# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

import contextlib
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

import released_baseline


PEPR_EOF = ('ERROR: failed to deploy bundle: failed calling webhook "pepr-uds-core.pepr.dev": '
            'failed to call webhook: Post "https://pepr-uds-core.pepr-system.svc:443/validate/released?timeout=10s": EOF')
GO_EOF = PEPR_EOF.replace('pepr-uds-core.pepr.dev', 'services.waypoint.uds.dev').replace(
    'pepr-uds-core.pepr-system.svc', 'uds-controller.uds-system.svc')
DENIED = 'ERROR: failed to deploy bundle: admission webhook denied the request: invalid policy'


class ReleasedFixtureTests(unittest.TestCase):
    def run_command(self, first, second='', second_code=0):
        with tempfile.TemporaryDirectory() as directory:
            count = Path(directory) / 'calls'
            source = ('from pathlib import Path\nimport sys\n'
                      f'p=Path({str(count)!r})\n'
                      'n=int(p.read_text())+1 if p.exists() else 1\np.write_text(str(n))\n'
                      f'print({first!r} if n==1 else {second!r})\n'
                      f'sys.exit(17 if n==1 else {second_code})\n')
            with mock.patch('released_baseline.time.sleep') as sleep, contextlib.redirect_stdout(io.StringIO()):
                result = released_baseline.deploy([sys.executable, '-c', source])
            return result, int(count.read_text()), sleep.call_count

    def test_released_transport_failure_resumes_same_fixture_once(self):
        self.assertEqual(self.run_command('\x1b[91m' + PEPR_EOF + '\x1b[0m'), (0, 2, 1))

    def test_next_released_transport_failure_resumes_same_fixture_once(self):
        message = PEPR_EOF.replace('ERROR: failed to deploy bundle:',
                                  'Error: deploying bundle "k3d-core-demo-next": failed to deploy package "core_base":')
        self.assertEqual(self.run_command(message), (0, 2, 1))

    def test_failed_resume_remains_a_failure_without_a_third_attempt(self):
        self.assertEqual(self.run_command(PEPR_EOF, DENIED, 23), (23, 2, 1))

    def test_policy_denial_is_not_retried(self):
        self.assertEqual(self.run_command(DENIED), (17, 1, 0))

    def test_replacement_controller_failure_is_not_retried(self):
        self.assertEqual(self.run_command(GO_EOF), (17, 1, 0))

    def test_earlier_transport_error_cannot_hide_final_policy_denial(self):
        self.assertEqual(self.run_command(PEPR_EOF + '\n' + DENIED), (17, 1, 0))


if __name__ == '__main__':
    unittest.main()
