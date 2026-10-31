# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

"""Render the exact pinned Dex Kubernetes storage CRD definitions for Helm."""

import argparse
import hashlib
import json
import re
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dex-source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = (args.dex_source / "storage/kubernetes/types.go").read_bytes()
    # Dex v2.45.1, commit 11d2eeb52b42e1980e14cb91e69dd9e3faab2076.
    if hashlib.sha256(source).hexdigest() != "0bb2bf0b78326293d8a3f16a0c7ff640924a45c44e066ffbe8e6808d0af5226d":
        raise ValueError("Dex storage source changed; review the upstream schema before updating its pin")
    text = source.decode().split("const keysName", 1)[0]
    names = re.findall(r'Plural:\s*"([^"]+)",\s*Singular:\s*"([^"]+)",\s*Kind:\s*"([^"]+)"', text)
    if len(names) != 10:
        raise ValueError("Expected all ten pinned Dex storage definitions")
    documents = []
    for plural, singular, kind in names:
        documents.append({"apiVersion": "apiextensions.k8s.io/v1", "kind": "CustomResourceDefinition", "metadata": {"name": plural + ".dex.coreos.com"}, "spec": {"group": "dex.coreos.com", "scope": "Namespaced", "names": {"plural": plural, "singular": singular, "kind": kind}, "versions": [{"name": "v1", "served": True, "storage": True, "schema": {"openAPIV3Schema": {"type": "object", "x-kubernetes-preserve-unknown-fields": True}}}]}})
    header = "# Copyright 2026 Defense Unicorns\n# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial\n# Generated from pinned upstream Dex storage/kubernetes/types.go.\n\n{{- if .Values.nativeIdentity.enabled }}\n"
    args.output.write_text(header + "\n---\n".join(json.dumps(doc, indent=2) for doc in documents) + "\n{{- end }}\n")


if __name__ == "__main__":
    main()
