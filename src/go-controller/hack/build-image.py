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

MODULE = Path(__file__).resolve().parents[1]


def run(args, *, cwd=MODULE, env=None):
    result = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'{args[0]} failed: {result.stderr[-4000:]}')
    return result.stdout.strip()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compiler_inputs(go, env):
    raw = run([go, 'list', '-deps', '-json', '.'], env=env)
    files = {MODULE / 'go.mod', MODULE / 'go.sum', MODULE / 'Dockerfile'}
    decoder = json.JSONDecoder()
    while raw.strip():
        package, end = decoder.raw_decode(raw.lstrip())
        raw = raw.lstrip()[end:]
        directory = Path(package['Dir'])
        if directory.is_relative_to(MODULE):
            for field in ['GoFiles', 'CgoFiles', 'CFiles', 'CXXFiles', 'MFiles', 'HFiles',
                          'FFiles', 'SFiles', 'SwigFiles', 'SwigCXXFiles', 'SysoFiles', 'EmbedFiles']:
                files.update(directory / name for name in package.get(field, []))
    return {str(path.relative_to(MODULE)): sha(path) for path in sorted(files)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--architecture', required=True, choices=['amd64', 'arm64'])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    go, docker = shutil.which('go'), shutil.which('docker')
    if not go or not docker:
        raise ValueError('Pinned Go and Docker are required to build Core')
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, GOWORK='off', GOTOOLCHAIN='local', CGO_ENABLED='0',
               GOOS='linux', GOARCH=args.architecture, GOAMD64='v1', GOMAXPROCS='2')
    expected = next(line.split()[1] for line in (MODULE / 'go.mod').read_text().splitlines() if line.startswith('go '))
    if run([go, 'env', 'GOVERSION'], env=env) != 'go' + expected:
        raise ValueError(f'Core requires the pinned Go {expected} compiler')
    inputs = compiler_inputs(go, env)
    source_hash = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
    reference = f'docker.io/library/uds-core-controller:{source_hash[:20]}-{args.architecture}'
    with tempfile.TemporaryDirectory(prefix='uds-controller-image-') as scratch:
        context = Path(scratch)
        binary = context / 'uds-controller'
        run([go, 'build', '-p', '2', '-buildvcs=false', '-trimpath', '-ldflags=-s -w', '-o', str(binary), '.'], env=env)
        raw = binary.read_bytes()
        machine = {'amd64': 62, 'arm64': 183}[args.architecture]
        if raw[:6] != b'\x7fELF\x02\x01' or struct.unpack_from('<H', raw, 18)[0] != machine:
            raise ValueError('Controller executable has the wrong ELF architecture')
        offset = struct.unpack_from('<Q', raw, 32)[0]
        size, count = struct.unpack_from('<HH', raw, 54)
        if any(struct.unpack_from('<I', raw, offset + size * index)[0] == 3 for index in range(count)):
            raise ValueError('Controller executable requires a dynamic interpreter')
        binary_hash = sha(binary)
        if inputs != compiler_inputs(go, env):
            raise ValueError('Controller sources changed while building')
        shutil.copyfile(MODULE / 'Dockerfile', context / 'Dockerfile')
        run([docker, 'buildx', 'build', '--load', '--platform', 'linux/' + args.architecture,
             '--tag', reference, '--build-arg', 'SOURCE_SHA256=' + source_hash,
             '--build-arg', 'BINARY_SHA256=' + binary_hash, str(context)])
        image = json.loads(run([docker, 'image', 'inspect', reference]))[0]
        if image['Config']['User'] != '65532:65532':
            raise ValueError('Controller image must run as non-root')
        receipt = {'image': reference, 'imageID': image['Id'], 'architecture': args.architecture,
                   'compiler': run([go, 'env', 'GOVERSION'], env=env), 'sourceSHA256': source_hash,
                   'binarySHA256': binary_hash, 'compilerInputs': inputs}
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    tools = args.output.parent.parent / 'controller-tools'
    tools.mkdir(parents=True, exist_ok=True)
    for system in ['linux', 'darwin']:
        for arch in ['amd64', 'arm64']:
            host_env = dict(env, GOOS=system, GOARCH=arch)
            run([go, 'build', '-p', '2', '-buildvcs=false', '-trimpath', '-ldflags=-s -w',
                 '-o', str(tools / (system + '-' + arch)), './cmd/core-transition'], env=host_env)
    host_os = run([go, 'env', 'GOHOSTOS'], env=env)
    host_arch = run([go, 'env', 'GOHOSTARCH'], env=env)
    uds = shutil.which('uds')
    if not uds:
        raise ValueError('The pinned UDS CLI is required for Core contract generation')
    run([str(tools / (host_os + '-' + host_arch)), '--zarf', uds, '--uds', '--phase', 'contract',
         '--chart', str(MODULE / 'chart'), '--contract', str(tools / 'admission-contract.json')])
    print(reference)


if __name__ == '__main__':
    main()
