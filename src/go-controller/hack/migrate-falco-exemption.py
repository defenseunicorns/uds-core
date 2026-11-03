#!/usr/bin/env python3
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
"""Explicit pre-upgrade remediation of Core's historical Falco matcher."""
import argparse
import json
from pathlib import Path
import re
import subprocess

OLD = "falco-(?!falcosidekick-).*"
POLICIES = {
    "DisallowHostNamespaces", "DisallowPrivileged", "RequireNonRootUser",
    "DropAllCapabilities", "RestrictHostPathWrite", "RestrictVolumeTypes",
}


def replacement():
    source = Path(__file__).resolve().parents[2] / "falco/chart/templates/uds-exemption.yaml"
    match = re.search(r'^\s*name: ("[^"]+")', source.read_text(), re.MULTILINE)
    if not match:
        raise ValueError("Cannot find the shipped Falco matcher")
    return json.loads(match.group(1))


def migration_patch(obj, pattern):
    metadata = obj.get("metadata", {})
    entries = obj.get("spec", {}).get("exemptions", [])
    changes = []
    for index, entry in enumerate(entries):
        matcher = entry.get("matcher", {})
        if matcher.get("name") != OLD:
            continue
        annotations = metadata.get("annotations", {})
        if (metadata.get("name") != "falco"
                or metadata.get("namespace") != "uds-policy-exemptions"
                or annotations.get("meta.helm.sh/release-name") != "uds-falco-config"
                or annotations.get("meta.helm.sh/release-namespace") != "falco"
                or matcher.get("namespace") != "falco"
                or matcher.get("kind", "pod") != "pod"
                or set(entry.get("policies", [])) != POLICIES):
            raise ValueError("Falco exemption is customized or has foreign ownership; review it manually")
        changes.append({"op": "replace", "path": f"/spec/exemptions/{index}/matcher/name", "value": pattern})
    if not changes:
        return []
    if not metadata.get("uid") or not metadata.get("resourceVersion"):
        raise ValueError("Falco exemption is missing immutable identity")
    return [
        {"op": "test", "path": "/metadata/uid", "value": metadata["uid"]},
        {"op": "test", "path": "/metadata/resourceVersion", "value": metadata["resourceVersion"]},
    ] + changes


def field_manager(obj):
    owners = {
        entry.get("manager")
        for entry in obj.get("metadata", {}).get("managedFields", [])
        if "f:exemptions" in entry.get("fieldsV1", {}).get("f:spec", {})
    }
    if len(owners) != 1 or not owners.issubset({"helm", "zarf", "uds"}):
        raise ValueError("Cannot identify the existing Helm field manager; review the exemption manually")
    return owners.pop()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--uds", default="uds", help="Existing UDS CLI; inherits its Kubernetes context")
    args = parser.parse_args()
    cli = [args.uds, "zarf", "tools", "kubectl"]
    raw = subprocess.check_output(cli + [
        "get", "exemption", "falco", "-n", "uds-policy-exemptions", "--ignore-not-found", "--show-managed-fields", "-o", "json",
    ], text=True)
    if not raw.strip():
        print("No installed Falco exemption to migrate")
        return
    obj = json.loads(raw)
    patch = migration_patch(obj, replacement())
    if not patch:
        print("Falco does not use the historical matcher; no change")
        return
    subprocess.run(cli + [
        "patch", "exemption", "falco", "-n", "uds-policy-exemptions",
        "--type=json", "--field-manager=" + field_manager(obj), "-p", json.dumps(patch),
    ], check=True)
    print("Updated only the historical Falco matcher; policy grants and sidekick exclusion are unchanged")


if __name__ == "__main__":
    main()
