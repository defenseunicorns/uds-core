#!/usr/bin/env python3
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

"""Build Core's static controller image and record its compiler inputs."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import tomllib

MODULE = Path(__file__).resolve().parents[1]


def run(args, *, cwd=MODULE, env=None):
    result = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'{args[0]} failed: {result.stderr[-4000:]}')
    return result.stdout.strip()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compiler_inputs(invoke, source_root):
    raw = invoke(['list', '-deps', '-json', '.'])
    files = {MODULE / 'go.mod', MODULE / 'go.sum', MODULE / 'Dockerfile', MODULE / 'image-build.toml'}
    decoder = json.JSONDecoder()
    while raw.strip():
        package, end = decoder.raw_decode(raw.lstrip())
        raw = raw.lstrip()[end:]
        directory = Path(package['Dir'])
        if directory.is_relative_to(source_root):
            directory = MODULE / directory.relative_to(source_root)
            for field in ['GoFiles', 'CgoFiles', 'CFiles', 'CXXFiles', 'MFiles', 'HFiles',
                          'FFiles', 'SFiles', 'SwigFiles', 'SwigCXXFiles', 'SysoFiles', 'EmbedFiles']:
                files.update(directory / name for name in package.get(field, []))
    return {str(path.relative_to(MODULE)): sha(path) for path in sorted(files)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--flavor', required=True, choices=['upstream', 'unicorn'])
    parser.add_argument('--tag', required=True)
    parser.add_argument('--architecture', required=True, choices=['amd64', 'arm64'])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.tag = args.tag.removeprefix("v")
    go, docker = shutil.which('go'), shutil.which('docker')
    if not go or not docker:
        raise ValueError('Pinned Go and Docker are required to build Core')
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    settings = tomllib.loads((MODULE / 'image-build.toml').read_text())[args.flavor]
    reference = f"{settings['repository']}:{args.tag}-{args.architecture}"
    uds = shutil.which('uds')
    if not uds:
        raise ValueError('The pinned UDS CLI is required to resolve image digests')
    def resolve(image):
        digest = run([uds, 'zarf', 'tools', 'registry', 'digest', image])
        if not digest.startswith('sha256:'):
            raise ValueError('Image did not resolve to a digest')
        return image.split('@')[0] + '@' + digest
    base = resolve(settings['base'])
    builder = resolve(settings['builder']) if args.flavor == 'unicorn' else None
    with tempfile.TemporaryDirectory(prefix='uds-controller-image-') as scratch:
        workspace = Path(scratch)
        context = workspace / "image"
        context.mkdir()
        binary = context / 'uds-controller'
        env = dict(os.environ, GOWORK='off', GOTOOLCHAIN='local', CGO_ENABLED='0',
                   GOOS='linux', GOARCH=args.architecture, GOAMD64='v1', GOMAXPROCS='2')
        if builder:
            for directory in ['cache', 'gopath', 'tmp', 'home']:
                (workspace / directory).mkdir()
            prefix = [docker, 'run', '--rm', '--user', f'{os.getuid()}:{os.getgid()}',
                      '-v', str(MODULE) + ':/src:ro', '-v', str(workspace) + ':/work',
                      '-w', '/src']
            for key in ['GOWORK', 'GOTOOLCHAIN', 'CGO_ENABLED', 'GOOS', 'GOARCH', 'GOAMD64', 'GOMAXPROCS']:
                prefix += ['-e', key + '=' + env[key]]
            for key, value in {'GOCACHE':'/work/cache', 'GOPATH':'/work/gopath',
                               'GOTMPDIR':'/work/tmp', 'HOME':'/work/home', 'GOFLAGS':'-modcacherw'}.items():
                prefix += ['-e', key + '=' + value]
            # Preserve the licensed compiler's FIPS module and enforcement defaults.
            invoke = lambda command: run(prefix + [builder] + command)
            source_root, binary_path = Path('/src'), '/work/image/uds-controller'
        else:
            env['GOFIPS140'] = 'off'
            invoke = lambda command: run([go] + command, env=env)
            source_root, binary_path = MODULE, str(binary)
        compiler = invoke(['env', 'GOVERSION'])
        expected = next(line.split()[1] for line in (MODULE / 'go.mod').read_text().splitlines() if line.startswith('go '))
        if compiler != 'go' + expected:
            raise ValueError(f'Core requires the pinned Go {expected} compiler; got {compiler}')
        inputs = compiler_inputs(invoke, source_root)
        source_hash = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
        invoke(['build', '-p', '2', '-buildvcs=false', '-trimpath',
                '-ldflags=-s -w -X github.com/defenseunicorns/uds-core/src/go-controller/internal/buildinfo.Flavor=' + args.flavor,
                '-o', binary_path, '.'])
        raw = binary.read_bytes()
        machine = {'amd64': 62, 'arm64': 183}[args.architecture]
        if raw[:6] != b'\x7fELF\x02\x01' or struct.unpack_from('<H', raw, 18)[0] != machine:
            raise ValueError('Controller executable has the wrong ELF architecture')
        offset = struct.unpack_from('<Q', raw, 32)[0]
        size, count = struct.unpack_from('<HH', raw, 54)
        if any(struct.unpack_from('<I', raw, offset + size * index)[0] == 3 for index in range(count)):
            raise ValueError('Controller executable requires a dynamic interpreter')
        build_info = invoke(['version', '-m', binary_path])
        if args.flavor == 'unicorn' and ('GOFIPS140=' + settings['goFIPS140']) not in build_info:
            raise ValueError('Unicorn binary lacks the pinned FIPS build setting')
        if args.flavor == 'unicorn' and 'chainguard_cryptographic_module=' not in build_info:
            raise ValueError('Unicorn binary was not produced by the licensed Chainguard compiler')
        binary_hash = sha(binary)
        if inputs != compiler_inputs(invoke, source_root):
            raise ValueError('Controller sources changed while building')
        shutil.copyfile(MODULE / 'Dockerfile', context / 'Dockerfile')
        run([docker, 'buildx', 'build', '--load', '--platform', 'linux/' + args.architecture,
             '--tag', reference, '--build-arg', 'SOURCE_SHA256=' + source_hash,
             '--build-arg', 'BINARY_SHA256=' + binary_hash,
             '--build-arg', 'BASE_IMAGE=' + base, '--build-arg', 'FLAVOR=' + args.flavor, str(context)])
        image = json.loads(run([docker, 'image', 'inspect', reference]))[0]
        if image['Config']['User'] != '65532:65532':
            raise ValueError('Controller image must run as non-root')
        receipt = {'flavor': args.flavor, 'baseImage': base, 'builderImage': builder, 'goFIPS140': settings['goFIPS140'],
                   'buildInfo': build_info, 'image': reference, 'imageID': image['Id'], 'architecture': args.architecture,
                   'compiler': compiler, 'sourceSHA256': source_hash,
                   'binarySHA256': binary_hash, 'compilerInputs': inputs}
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(reference)


if __name__ == '__main__':
    main()
