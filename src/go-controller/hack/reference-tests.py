#!/usr/bin/env python3
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

"""Run the frozen pre-replacement tests as an isolated compatibility oracle."""

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[3]
REFERENCE = '129d6e4a1928ce2b10ba6c5c8b5a0e7350f4053c'
CORPORA = {
    'internal/admission/policies/testdata/core-policy-parity.json': 182,
    'internal/admission/policies/testdata/core-diagnostic-parity.json': 40,
    'internal/admission/resources/testdata/custom-resource-parity.json': 17,
    'internal/admission/resources/testdata/package-parity.json': 140,
    'internal/admission/exemptions/testdata/javascript-regex-parity.json': 1008,
    'webhook/testdata/exemption-name-parity.json': 21,
    'webhook/testdata/core-waypoint-parity.json': 10,
}


def run(command, cwd, log):
    with log.open('w') as stream:
        subprocess.run(command, cwd=cwd, stdout=stream, stderr=subprocess.STDOUT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if not args.output.is_absolute() or args.output.exists():
        raise ValueError('Use a new absolute evidence directory outside the source tree')
    if args.output.is_relative_to(ROOT):
        raise ValueError('The legacy oracle must stay outside the production checkout')
    args.output.mkdir(parents=True)
    source = args.output / 'reference'
    source.mkdir()
    archive = args.output / 'reference.tar'
    with archive.open('wb') as stream:
        subprocess.run(['git', 'archive', REFERENCE], cwd=ROOT, stdout=stream, check=True)
    with tarfile.open(archive) as bundle:
        bundle.extractall(source, filter='data')
    archive.unlink()
    run(['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], source, args.output / 'npm.log')
    vitest = str(source / 'node_modules/vitest/vitest.mjs')
    run(['node', vitest, 'run', 'src/pepr', '--reporter=json', '--outputFile=' + str(args.output / 'unit.json')], source, args.output / 'unit.log')
    report = json.loads((args.output / 'unit.json').read_text())
    if not report.get('success') or report['numTotalTests'] != 1117 or report['numPassedTests'] != 1117:
        raise ValueError('The unchanged reference suite did not execute every expected test')
    capture = source / 'src/go-controller/native-admission/reference'
    capture.mkdir(parents=True)
    for adapter in (ROOT / 'src/go-controller/native-admission/reference').glob('capture-*'):
        shutil.copyfile(adapter, capture / adapter.name)
    module = source / 'src/go-controller'
    for relative in CORPORA:
        (module / relative).parent.mkdir(parents=True, exist_ok=True)
    run(['node', vitest, 'run', str(capture), '--reporter=json', '--outputFile=' + str(args.output / 'capture.json')], source, args.output / 'capture.log')
    captured = json.loads((args.output / 'capture.json').read_text())
    if not captured.get('success') or captured['numTotalTests'] != 372 or captured['numPassedTests'] != 372:
        raise ValueError('Incomplete source differential capture')
    run(['node', str(capture / 'capture-regex-parity.mjs')], source, args.output / 'regex.log')
    for relative, count in CORPORA.items():
        actual = json.loads((module / relative).read_text())
        expected = json.loads((ROOT / 'src/go-controller' / relative).read_text())
        if actual != expected or len(actual['cases']) != count:
            raise ValueError('Differential corpus differs from pinned source: ' + relative)
    receipt = {'reference': REFERENCE, 'originalTestsPassed': 1117, 'captureTestsPassed': 372,
               'differentialCasesMatched': sum(CORPORA.values()), 'productionDependency': False}
    (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
