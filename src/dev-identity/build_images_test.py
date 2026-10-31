# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

"""Check the provider receipt against actual Go compiler input discovery."""

import importlib.util
import os
from pathlib import Path
import shutil
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('provider_build', Path(__file__).with_name('build-images.py'))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class SourceReceiptTests(unittest.TestCase):
    def test_compiler_inputs_change_the_receipt(self):
        go = shutil.which('go')
        self.assertIsNotNone(go, 'Go is required for provider source verification')
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            package = root / 'cmd' / 'dev-identity'
            package.mkdir(parents=True)
            (root / 'go.mod').write_text('module receipt.test\n\ngo 1.25.0\n')
            (root / 'go.sum').write_text('')
            (package / 'main.go').write_text('package main\n\nfunc main() {}\n')
            # go list reports these compiler inputs without executing/linking them.
            for name in ['native.s', 'native.h', 'native.syso']:
                (package / name).write_bytes(b'first-input\n')
            previous = build.MODULE
            build.MODULE = root
            try:
                env = dict(os.environ, GOWORK='off', GOTOOLCHAIN='local', CGO_ENABLED='0', GOFLAGS='-buildvcs=false')
                before = build.bridge_inputs(go, env)
                for name in ['native.s', 'native.h', 'native.syso']:
                    key = 'cmd/dev-identity/' + name
                    self.assertIn(key, before)
                    (package / name).write_bytes(b'changed-input\n')
                    after = build.bridge_inputs(go, env)
                    self.assertNotEqual(before[key], after[key], name)
            finally:
                build.MODULE = previous


if __name__ == '__main__':
    unittest.main()
