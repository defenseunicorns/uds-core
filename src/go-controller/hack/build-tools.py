#!/usr/bin/env python3
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
"""Build release/development host helpers; never invoked by package create."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

MODULE = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    go = shutil.which('go')
    if not go:
        raise ValueError('Go is required to build release helpers')
    receipts = {}
    for system in ['linux', 'darwin']:
        for arch in ['amd64', 'arm64']:
            target = args.output / f'core-transition-{system}-{arch}'
            env = dict(os.environ, GOWORK='off', GOTOOLCHAIN='local', CGO_ENABLED='0',
                       GOOS=system, GOARCH=arch, GOFIPS140='off')
            subprocess.run([go, 'build', '-buildvcs=false', '-trimpath', '-ldflags=-s -w',
                            '-o', str(target), './cmd/core-transition'], cwd=MODULE, env=env, check=True)
            receipts[target.name] = hashlib.sha256(target.read_bytes()).hexdigest()
    (args.output / 'SHA256SUMS').write_text(''.join(f'{digest}  {name}\n' for name, digest in receipts.items()))
    (args.output / 'receipt.json').write_text(json.dumps(receipts, indent=2) + '\n')

if __name__ == '__main__':
    main()
