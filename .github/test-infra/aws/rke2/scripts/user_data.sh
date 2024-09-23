#!/bin/bash

# If no bootstrap IP is provided then start RKE2 as single node/bootstrap
if [[ "${BOOTSTRAP_IP}" == "" ]]; then
    bootstrap_ip=$(ip route get $(ip route show 0.0.0.0/0 | grep -oP 'via \K\S+') | grep -oP 'src \K\S+')
else
    bootstrap_ip=${BOOTSTRAP_IP}
fi

if [[ "${CLUSTER_SANS}" ]]; then
    echo "Passing SANs to RKE2 startup script: ${CLUSTER_SANS}"
    public_ipv4=$(curl http://169.254.169.254/latest/meta-data/public-ipv4)
    # Use array to properly handle cluster_sans containing multiple values
    san_options=(-T "$${public_ipv4} ${CLUSTER_SANS}")
fi

if [[ "${AGENT_NODE}" == "true" ]]; then
    /root/rke2-startup.sh -t ${RKE2_JOIN_TOKEN} "$${san_options[@]}" -s $${bootstrap_ip} -a
else
    /root/rke2-startup.sh -t ${RKE2_JOIN_TOKEN} "$${san_options[@]}" -s $${bootstrap_ip}
fi

cat > /var/lib/rancher/rke2/server/manifests/01-aws-ebs.yaml << EOM
apiVersion: helm.cattle.io/v1
kind: HelmChart
metadata:
  name: aws-ebs-csi-driver
  namespace: kube-system
spec:
  chart: aws-ebs-csi-driver
  repo: https://kubernetes-sigs.github.io/aws-ebs-csi-driver
  version: 2.25.0
  targetNamespace: kube-system
  valuesContent: |-
    controller:
      nodeSelector:
        node-role.kubernetes.io/control-plane: "true"
    storageClasses:
      - name: default
        annotations:
          storageclass.kubernetes.io/is-default-class: "true"
        allowVolumeExpansion: true
        provisioner: kubernetes.io/aws-ebs
        volumeBindingMode: WaitForFirstConsumer
        parameters:
          type: gp3
          encrypted: "true"
          kmsKeyId: ${KMS_KEY_ID}
        reclaimPolicy: Retain
EOM