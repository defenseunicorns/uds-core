# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import importlib.util
from pathlib import Path
import unittest

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

    def test_repeat_and_custom_patterns_are_unchanged(self):
        for pattern in [migration.replacement(), "my-own-pattern"]:
            obj = self.fixture()
            obj["spec"]["exemptions"][0]["matcher"]["name"] = pattern
            self.assertEqual(migration.migration_patch(obj, "replacement"), [])


if __name__ == "__main__":
    unittest.main()
