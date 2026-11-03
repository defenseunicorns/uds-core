#!/usr/bin/env python3
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

"""Prepare the released Core fixture, recovering one known admission EOF."""

import argparse
import re
import subprocess
import sys
import time


def released_admission_eof(output):
    plain = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', output)
    errors = re.split(r'\b(?:ERROR|Error):\s*', plain)
    if len(errors) == 1:
        return False
    final = errors[-1]
    return ('failed calling webhook "pepr-uds-core.pepr.dev"' in final
            and re.search(r'Post "https://pepr-uds-core[.]pepr-system[.]svc:443/[^"\n]+": EOF\b', final) is not None)


def attempt(command):
    tail = ''
    with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          text=True, encoding='utf-8', errors='replace') as process:
        try:
            for line in process.stdout:
                sys.stdout.write(line)
                sys.stdout.flush()
                tail = (tail + line)[-65536:]
            return process.wait(), tail
        except BaseException:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            raise


def deploy(command):
    code, output = attempt(command)
    if code and released_admission_eof(output):
        print('Released Core fixture admission returned EOF; retrying its deployment once.', flush=True)
        time.sleep(5)
        code, _ = attempt(command)
    return code


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command:
        parser.error('Pass the released fixture deployment command after --')
    sys.exit(deploy(command))
