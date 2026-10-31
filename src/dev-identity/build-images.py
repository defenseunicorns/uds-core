#!/usr/bin/env python3
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

"""Build the actual native identity providers locally, with public input receipts."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import time
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
MODULE = HERE


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command, cwd=None, env=None, log=None):
    result = subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True)
    if log:
        log.write_text(result.stdout + result.stderr)
        log.chmod(0o600)
    if result.returncode:
        raise RuntimeError('build command failed; inspect ' + str(log or command[0]))
    return result.stdout.strip()


def executable(value):
    path = Path(value)
    if not path.is_absolute() or not path.is_file() or not os.access(path, os.X_OK):
        raise ValueError('tool paths must identify absolute executable files')
    return str(path)


def objects(raw):
    decoder = json.JSONDecoder()
    while raw.strip():
        obj, end = decoder.raw_decode(raw.lstrip())
        yield obj
        raw = raw.lstrip()[end:]


def bridge_inputs(go, env):
    files = {MODULE / 'go.mod', MODULE / 'go.sum'}
    for package in objects(run([go, 'list', '-deps', '-json', './cmd/dev-identity'], cwd=MODULE, env=env)):
        directory = Path(package['Dir'])
        if directory.is_relative_to(MODULE):
            for field in ['GoFiles', 'CgoFiles', 'CFiles', 'CXXFiles', 'MFiles', 'HFiles',
                          'FFiles', 'SFiles', 'SwigFiles', 'SwigCXXFiles', 'SysoFiles', 'EmbedFiles']:
                files.update(directory / name for name in package.get(field, []))
    return {str(path.relative_to(MODULE)): digest(path) for path in sorted(files)}


def static_linux_amd64(path):
    raw = path.read_bytes()
    if raw[:6] != b'\x7fELF\x02\x01' or struct.unpack_from('<H', raw, 18)[0] != 62:
        raise RuntimeError('provider binary is not a Linux AMD64 ELF')
    offset = struct.unpack_from('<Q', raw, 32)[0]
    size, count = struct.unpack_from('<HH', raw, 54)
    if any(struct.unpack_from('<I', raw, offset + size * index)[0] == 3 for index in range(count)):
        raise RuntimeError('provider binary requires a dynamic interpreter')


def binary(go, env, source, target, log, expected, mode):
    flags = ['-p', '2', '-trimpath', '-ldflags', '-s -w']
    if mode == 'release':
        flags.append('-buildvcs=false')
    run([go, 'build', *flags, '-o', str(target), './cmd/' + ('dex' if target.name == 'dex-dev' else 'dev-identity')], cwd=source, env=env, log=log)
    static_linux_amd64(target)
    sha = digest(target)
    if expected and sha != expected:
        raise RuntimeError('binary differs from expected checkpoint: actualSHA256=' + sha)
    return {'SHA256': sha, 'bytes': target.stat().st_size, 'staticLinuxAMD64': True,
            'expectedCheckpointSHA256': expected, 'expectedCheckpointMatches': sha == expected if expected else None, 'flags': flags,
            'goBuildInfo': run([go, 'version', '-m', str(target)])}


def image(docker, tag, context, output):
    metadata = output / (context.name + '-image-metadata.json')
    run([docker, 'buildx', 'build', '--load', '--platform', 'linux/amd64', '--metadata-file', str(metadata),
         '--tag', tag, str(context)], log=output / (context.name + '-image-build.log'))
    obj = json.loads(run([docker, 'image', 'inspect', tag]))[0]
    data = json.loads(metadata.read_text())
    if obj['Config']['User'] != '65532:65532':
        raise RuntimeError('provider image is not the required nonroot runtime')
    return {'tag': tag, 'localImageID': obj['Id'], 'manifestDigest': data.get('containerimage.digest'),
            'configDigest': data.get('containerimage.config.digest'), 'bytes': obj['Size'],
            'user': obj['Config']['User'], 'entrypoint': obj['Config']['Entrypoint']}


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--go', required=True, type=executable)
    parser.add_argument('--docker', required=True, type=executable)
    parser.add_argument('--git', required=True, type=executable)
    parser.add_argument('--output', required=True, type=Path, help='new absolute directory outside the Core source tree')
    parser.add_argument('--bridge-image', required=True, help='new local tag; existing tags are refused')
    parser.add_argument('--dex-image', required=True, help='new local tag; existing tags are refused')
    parser.add_argument('--dex-repository', help='optional existing Git repository or HTTPS mirror; only committed Dex source is cloned')
    parser.add_argument('--expected-bridge-binary', help='optional SHA256; reject a different binary before image creation')
    parser.add_argument('--expected-dex-binary', help='optional SHA256; reject a different binary before image creation')
    parser.add_argument('--save-images', action='store_true', help='save both local images to images.tar, without publishing')
    parser.add_argument('--mode', choices=['release', 'historical'], default='release', help='release omits VCS stamping; historical retains metadata for exact earlier checkpoint verification')
    return parser.parse_args()


def main():
    args = arguments()
    pins = json.loads((HERE / 'provider-inputs.json').read_text())
    output = args.output
    core = MODULE.parents[1]
    if not output.is_absolute() or output.exists() or output.resolve().is_relative_to(core):
        raise ValueError('output must be a new absolute directory outside the Core source tree')
    output.mkdir(mode=0o700, parents=True)
    repo = args.dex_repository or pins['dexRepository']
    if urlsplit(repo).username or urlsplit(repo).password:
        raise ValueError('repository URL must not contain credentials')
    if args.bridge_image == args.dex_image:
        raise ValueError('provider image tags must be distinct')
    for tag in [args.bridge_image, args.dex_image]:
        if subprocess.run([args.docker, 'image', 'inspect', tag], capture_output=True).returncode == 0:
            raise ValueError('refusing to overwrite an existing local image tag')
    env = dict(os.environ, GOWORK='off', GOTOOLCHAIN='local', GOFLAGS='', CGO_ENABLED=pins['CGOEnabled'],
               GOOS=pins['targetOS'], GOARCH=pins['targetArchitecture'], GOAMD64=pins['targetAMD64'], GOMAXPROCS='2')
    for variable, directory in [('GOCACHE', 'go-cache'), ('GOMODCACHE', 'go-mod'), ('GOPATH', 'gopath'), ('GOTMPDIR', 'go-tmp')]:
        if not env.get(variable):
            env[variable] = str(output / directory)
        Path(env[variable]).mkdir(parents=True, exist_ok=True)
    if run([args.go, 'env', 'GOVERSION'], env=env) != pins['goVersion']:
        raise ValueError('Go executable does not match provider-inputs.json')
    patch = HERE / 'dex-core-dev.patch'
    if digest(patch) != pins['dexPatchSHA256']:
        raise ValueError('Dex patch differs from provider-inputs.json')
    for name in ['bridge', 'dex']:
        if ('FROM ' + pins['runtimeBase']) not in (HERE / ('Dockerfile.' + name)).read_text():
            raise ValueError('provider Dockerfile base differs from provider-inputs.json')
    started = time.monotonic()
    before = bridge_inputs(args.go, env)
    source = output / 'dex-source'
    run([args.git, 'clone', '--no-checkout', '--no-local', '--', repo, str(source)], log=output / 'dex-clone.log')
    run([args.git, 'checkout', '--detach', pins['dexCommit']], cwd=source, log=output / 'dex-checkout.log')
    if run([args.git, 'rev-parse', 'HEAD'], cwd=source) != pins['dexCommit']:
        raise RuntimeError('Dex checkout does not match pinned commit')
    run([args.git, 'apply', '--check', str(patch)], cwd=source, log=output / 'dex-patch-check.log')
    run([args.git, 'apply', str(patch)], cwd=source, log=output / 'dex-patch.log')
    contexts = {name: output / name for name in ['bridge', 'dex']}
    for name, context in contexts.items():
        context.mkdir()
        shutil.copyfile(HERE / ('Dockerfile.' + name), context / 'Dockerfile')
    receipt = {'pins': pins, 'mode': args.mode, 'goExecutableSHA256': digest(Path(args.go)), 'bridgeSourceFiles': before,
               'recipeFiles': {path.name: digest(path) for path in [Path(__file__), HERE / 'provider-inputs.json', patch, HERE / 'Dockerfile.bridge', HERE / 'Dockerfile.dex']},
               'privateConfigurationRead': False, 'imagesPublished': False, 'clusterMutated': False}
    receipt['bridgeBinary'] = binary(args.go, env, MODULE, contexts['bridge'] / 'dev-identity', output / 'bridge-build.log', args.expected_bridge_binary, args.mode)
    print(json.dumps({'stage': 'bridge_binary_built', 'SHA256': receipt['bridgeBinary']['SHA256']}), flush=True)
    receipt['dexBinary'] = binary(args.go, env, source, contexts['dex'] / 'dex-dev', output / 'dex-build.log', args.expected_dex_binary, args.mode)
    print(json.dumps({'stage': 'dex_binary_built', 'SHA256': receipt['dexBinary']['SHA256']}), flush=True)
    shutil.copytree(source / 'web', contexts['dex'] / 'web')
    if before != bridge_inputs(args.go, env):
        raise RuntimeError('bridge source changed during build; refusing mixed input images')
    receipt['bridgeImage'] = image(args.docker, args.bridge_image, contexts['bridge'], output)
    receipt['dexImage'] = image(args.docker, args.dex_image, contexts['dex'], output)
    if args.save_images:
        archive = output / 'images.tar'
        run([args.docker, 'save', '--output', str(archive), args.bridge_image, args.dex_image], log=output / 'image-save.log')
        receipt['archive'] = {'file': str(archive), 'SHA256': digest(archive), 'bytes': archive.stat().st_size}
    receipt['durationSeconds'] = time.monotonic() - started
    (output / 'build-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'stage': 'complete', 'receipt': str(output / 'build-receipt.json'),
                      'bridgeManifest': receipt['bridgeImage']['manifestDigest'], 'dexManifest': receipt['dexImage']['manifestDigest']}), flush=True)


if __name__ == '__main__':
    main()
