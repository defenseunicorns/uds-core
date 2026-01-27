#!/bin/bash
# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

info() {
    echo "[INFO] " "$@"
}

export CCM="${ccm}"
export CCM_EXTERNAL="${ccm_external}"
export CLUSTER_NAME="${cluster_name}"

###############################
### pre userdata
###############################
pre_userdata() {
info "Beginning user defined pre userdata"
info "Create HelmChart Resources."
mkdir -p /var/lib/rancher/rke2/server/manifests
cat > helmchart-template.yaml << EOM
${helm_chart_template}
EOM

envsubst < helmchart-template.yaml > /var/lib/rancher/rke2/server/manifests/00-helmcharts.yaml
# We install longhorn from a template to avoid install issues with the HelmController
# <!-- renovate: datasource=helm depName=longhorn versioning=helm registryUrl=https://charts.longhorn.io -->
LONGHORN_VERSION=1.10.1
HELM_LATEST=$(curl -L --silent --show-error --fail "https://get.helm.sh/helm-latest-version" 2>&1 || true)
curl https://get.helm.sh/helm-$HELM_LATEST-linux-amd64.tar.gz --output helm.tar.gz
tar -xvf ./helm.tar.gz && rm -rf ./helm.tar.gz
chmod +x ./linux-amd64/helm
./linux-amd64/helm repo add longhorn https://charts.longhorn.io
./linux-amd64/helm repo update
./linux-amd64/helm template longhorn longhorn/longhorn --version $LONGHORN_VERSION --set defaultSettings.deletingConfirmationFlag=true --set longhornUI.replicas=0 --set namespaceOverride=kube-system --no-hooks > /var/lib/rancher/rke2/server/manifests/01-longhorn.yaml
rm -rf ./linux-amd64

info "Installing awscli and yq"
sudo dnf install -y awscli
curl -L https://github.com/mikefarah/yq/releases/download/v4.45.4/yq_linux_amd64 -o yq
chmod +x yq

echo "Getting OIDC keypair"
sudo mkdir -p /irsa
sudo chown ec2-user:ec2-user /irsa
aws secretsmanager get-secret-value --secret-id ${secret_prefix}-oidc-private-key | jq -r '.SecretString' > /irsa/signer.key
aws secretsmanager get-secret-value --secret-id ${secret_prefix}-oidc-public-key | jq -r '.SecretString' > /irsa/signer.key.pub
sudo chcon -t svirt_sandbox_file_t /irsa/*

info "Setting up RKE2 config file"
./yq -i '.cloud-provider-name += "external"' /etc/rancher/rke2/config.yaml
./yq -i '.disable-cloud-controller += "true"' /etc/rancher/rke2/config.yaml
./yq -i '.kube-apiserver-arg += "service-account-key-file=/irsa/signer.key.pub"' /etc/rancher/rke2/config.yaml
./yq -i '.kube-apiserver-arg += "service-account-signing-key-file=/irsa/signer.key"' /etc/rancher/rke2/config.yaml
./yq -i '.kube-apiserver-arg += "api-audiences=kubernetes.svc.default"' /etc/rancher/rke2/config.yaml
./yq -i '.kube-apiserver-arg += "service-account-issuer=https://${BUCKET_REGIONAL_DOMAIN_NAME}"' /etc/rancher/rke2/config.yaml
./yq -i '.kube-apiserver-arg += "audit-log-path=/var/log/kubernetes/audit/audit.log"' /etc/rancher/rke2/config.yaml
# Temporary, enable watch cache initiliazation feature gate
./yq -i '.kube-apiserver-arg += "feature-gates=WatchCacheInitializationPostStartHook=true"' /etc/rancher/rke2/config.yaml
#Fix for metrics server scraping of kubernetes api server components
./yq -i '.kube-controller-manager-arg[2] = "bind-address=0.0.0.0"' /etc/rancher/rke2/config.yaml
./yq -i '.kube-scheduler-arg += "bind-address=0.0.0.0"' /etc/rancher/rke2/config.yaml
./yq -i '.etcd-arg += "listen-metrics-urls=http://0.0.0.0:2381"|.etcd-arg style="double"' /etc/rancher/rke2/config.yaml
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

