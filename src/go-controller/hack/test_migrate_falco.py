# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import importlib.util
from pathlib import Path
import unittest
import os
import subprocess
import sys
import tempfile

spec = importlib.util.spec_from_file_location("migration", Path(__file__).with_name("migrate-falco-exemption.py"))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class MigrationTest(unittest.TestCase):
    def fixture(self):
        return {
            "metadata": {"name": "falco", "namespace": "uds-policy-exemptions", "uid": "original",
                         "resourceVersion": "42", "annotations": {
                             "meta.helm.sh/release-name": "uds-falco-config",
                             "meta.helm.sh/release-namespace": "falco"}},
            "spec": {"exemptions": [{"matcher": {"namespace": "falco", "name": migration.OLD},
                                     "policies": sorted(migration.POLICIES)}]},
        }

    def test_only_pattern_changes_with_identity_preconditions(self):
        obj = self.fixture()
        obj["spec"]["exemptions"].append({"matcher": {"name": "custom"}})
        patch = migration.migration_patch(obj, migration.replacement())
        self.assertEqual([p["path"] for p in patch],
                         ["/metadata/uid", "/metadata/resourceVersion", "/spec/exemptions/0/matcher/name"])
        self.assertEqual(patch[0]["value"], "original")
        self.assertEqual(patch[1]["value"], "42")
        self.assertNotIn("?!", patch[2]["value"])

    def test_foreign_or_customized_grants_are_refused(self):
        for field, value in [("namespace", "tenant"), ("kind", "service")]:
            obj = self.fixture()
            obj["spec"]["exemptions"][0]["matcher"][field] = value
            with self.assertRaises(ValueError):
                migration.migration_patch(obj, "replacement")
        obj = self.fixture()
        obj["metadata"]["annotations"]["meta.helm.sh/release-name"] = "foreign"
        with self.assertRaises(ValueError):
            migration.migration_patch(obj, "replacement")
        obj = self.fixture()
        obj["spec"]["exemptions"][0]["policies"].append("RestrictHostPorts")
        with self.assertRaises(ValueError):
            migration.migration_patch(obj, "replacement")

    def test_existing_helm_field_owner_is_preserved(self):
        obj = self.fixture()
        obj["metadata"]["managedFields"] = [
            {"manager": "helm", "fieldsV1": {"f:spec": {"f:exemptions": {}}}},
            {"manager": "unrelated", "fieldsV1": {"f:metadata": {}}},
        ]
        self.assertEqual(migration.field_manager(obj), "helm")
        obj["metadata"]["managedFields"][0]["manager"] = "kubectl-patch"
        with self.assertRaises(ValueError):
            migration.field_manager(obj)
        obj["metadata"]["managedFields"] = []
        with self.assertRaises(ValueError):
            migration.field_manager(obj)

    def test_cli_is_found_on_path_without_a_local_uds_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "bin").mkdir()
            cli = root / "bin" / "uds"
            # An empty successful get is kubectl's --ignore-not-found behavior.
            cli.write_text("#!/bin/sh\nexit 0\n")
            cli.chmod(0o755)
            env = dict(os.environ, PATH=str(root / "bin") + os.pathsep + os.defpath)
            result = subprocess.run(
                [sys.executable, str(Path(migration.__file__).resolve())],
                cwd=directory, env=env, text=True, capture_output=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("No installed Falco exemption", result.stdout)

    def test_repeat_and_custom_patterns_are_unchanged(self):
        for pattern in [migration.replacement(), "my-own-pattern"]:
            obj = self.fixture()
            obj["spec"]["exemptions"][0]["matcher"]["name"] = pattern
            self.assertEqual(migration.migration_patch(obj, "replacement"), [])


if __name__ == "__main__":
    unittest.main()
