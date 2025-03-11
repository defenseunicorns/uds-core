#!/bin/bash
# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

info() {
    echo "[INFO] " "$@"
}

export CCM="${ccm}"
export CCM_EXTERNAL="${ccm_external}"

###############################
### pre userdata
###############################
pre_userdata() {
info "Beginning user defined pre userdata"

# add aws cloud controller
info "Adding AWS cloud provider manifest."
mkdir -p /var/lib/rancher/rke2/server/manifests
cat > /var/lib/rancher/rke2/server/manifests/00-aws-ccm.yaml << EOM
apiVersion: helm.cattle.io/v1
kind: HelmChart
metadata:
  name: aws-cloud-controller-manager
  namespace: kube-system
spec:
  chart: aws-cloud-controller-manager
  repo: https://kubernetes.github.io/cloud-provider-aws
  version: 0.0.8
  targetNamespace: kube-system
  bootstrap: true
  valuesContent: |-
    nodeSelector:
      node-role.kubernetes.io/control-plane: "true"
    hostNetworking: true
    args:
      - --configure-cloud-routes=false
      - --v=2
      - --cloud-provider=aws
EOM

#longhorn helm values: https://github.com/longhorn/longhorn/tree/master/chart
cat > /var/lib/rancher/rke2/server/manifests/01-longhorn.yaml << EOM
apiVersion: helm.cattle.io/v1
kind: HelmChart
metadata:
  name: longhorn
  namespace: kube-system
spec:
  chart: longhorn
  repo: https://charts.longhorn.io
  version: 1.7.1
  targetNamespace: kube-system 
EOM

# #metallb helm values: https://github.com/metallb/metallb/tree/main/charts/metallb
# cat > /var/lib/rancher/rke2/server/manifests/02-metallb.yaml << EOM
# apiVersion: helm.cattle.io/v1
# kind: HelmChart
# metadata:
#   name: metallb
#   namespace: kube-system
# spec:
#   chart: metallb
#   repo: https://metallb.github.io/metallb
#   version: 0.14.9
#   targetNamespace: kube-system
# EOM

# aws lb controller helm values: https://github.com/kubernetes-sigs/aws-load-balancer-controller/tree/main/helm/aws-load-balancer-controller#configuration
cat > /var/lib/rancher/rke2/server/manifests/02-lb-controller.yaml << EOM
apiVersion: helm.cattle.io/v1
kind: HelmChart
metadata:
  name: aws-load-balancer-controller
  namespace: kube-system
spec:
  chart: aws-load-balancer-controller
  repo: https://aws.github.io/eks-charts
  version: 1.11.0
  targetNamespace: kube-system
  valuesContent: |-
    clusterName: ${cluster_name}
EOM

info "Installing awscli"
yum install -y unzip jq || apt-get -y install unzip jq
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

echo "Getting OIDC keypair"
sudo mkdir /irsa
sudo chown ec2-user:ec2-user /irsa
aws secretsmanager get-secret-value --secret-id ${secret_prefix}-oidc-private-key | jq -r '.SecretString' > /irsa/signer.key
aws secretsmanager get-secret-value --secret-id ${secret_prefix}-oidc-public-key | jq -r '.SecretString' > /irsa/signer.key.pub
chcon -t svirt_sandbox_file_t /irsa/*

info "Setting up RKE2 config file"
curl -L https://github.com/mikefarah/yq/releases/download/v4.40.4/yq_linux_amd64 -o yq
chmod +x yq
./yq -i '.cloud-provider-name += "external"' /etc/rancher/rke2/config.yaml
./yq -i '.disable-cloud-controller += "true"' /etc/rancher/rke2/config.yaml
./yq -i '.kube-apiserver-arg += "service-account-key-file=/irsa/signer.key.pub"' /etc/rancher/rke2/config.yaml
./yq -i '.kube-apiserver-arg += "service-account-signing-key-file=/irsa/signer.key"' /etc/rancher/rke2/config.yaml
./yq -i '.kube-apiserver-arg += "api-audiences=kubernetes.svc.default"' /etc/rancher/rke2/config.yaml
./yq -i '.kube-apiserver-arg += "service-account-issuer=https://${BUCKET_REGIONAL_DOMAIN_NAME}"' /etc/rancher/rke2/config.yaml
./yq -i '.kube-apiserver-arg += "audit-log-path=/var/log/kubernetes/audit/audit.log"' /etc/rancher/rke2/config.yaml
#Fix for metrics server scraping of kubernetes api server components
./yq -i '.kube-controller-manager-arg[2] = "bind-address=0.0.0.0"' /etc/rancher/rke2/config.yaml
rm -rf ./yq
}

pre_userdata

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

