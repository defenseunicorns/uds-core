FROM ubuntu:22.04

ARG K3S_TAG="v1.28.3+k3s2"

RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections

RUN apt-get update && \
  apt-get -y install curl nfs-common open-iscsi systemd

RUN curl -ksL https://get.k3s.io | INSTALL_K3S_VERSION=$K3S_TAG INSTALL_K3S_SKIP_ENABLE=true INSTALL_K3S_SKIP_START=true sh -

RUN mkdir -p /etc && \
    echo 'hosts: files dns' > /etc/nsswitch.conf && \
    echo "PRETTY_NAME=\"K3s ${K3S_TAG}\"" > /etc/os-release && \
    chmod 1777 /tmp

VOLUME /var/lib/kubelet
VOLUME /var/lib/rancher/k3s
VOLUME /var/lib/cni
VOLUME /var/log

ENV PATH="$PATH:/bin/aux"
ENV CRI_CONFIG_FILE="/var/lib/rancher/k3s/agent/etc/crictl.yaml"
ENTRYPOINT ["/usr/local/bin/k3s"]
CMD ["agent"]
