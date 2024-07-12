#!/bin/bash

mkdir -p crds

kubectl get crds/packages.uds.dev -o yaml > crds/package-crd.yaml
kubectl get crds/exemptions.uds.dev -o yaml > crds/exemption-crd.yaml

crdoc --resources crds --output ../docs/reference/index.md
