---
title: Clusterconfig CR (v1alpha1)
tableOfContents:
  maxHeadingLevel: 6
sidebar:
  order: 20
---
<a id="Clusterconfig"></a>
<div style="margin-left: 20px; padding-top: 30px;">

# Clusterconfig
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">metadata</td><td style="white-space: nowrap;"><a href="#Metadata">Metadata</a></td><td></td></tr><tr><td style="white-space: nowrap;">spec</td><td style="white-space: nowrap;"><a href="#Spec">Spec</a></td><td></td></tr>
  </tbody>
</table>
</div>

<a id="Metadata"></a>
<div style="margin-left: 40px; padding-top: 30px;">

## Metadata
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">name</td><td style="white-space: nowrap;">string (enum):<ul><li><code>uds-cluster-config</code></li></ul></td><td></td></tr>
  </tbody>
</table>
</div>

<a id="Spec"></a>
<div style="margin-left: 40px; padding-top: 30px;">

## Spec
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">attributes</td><td style="white-space: nowrap;"><a href="#Attributes">Attributes</a></td><td></td></tr><tr><td style="white-space: nowrap;">networking</td><td style="white-space: nowrap;"><a href="#Networking">Networking</a></td><td></td></tr><tr><td style="white-space: nowrap;">caBundle</td><td style="white-space: nowrap;"><a href="#CaBundle">CaBundle</a></td><td></td></tr><tr><td style="white-space: nowrap;">expose</td><td style="white-space: nowrap;"><a href="#Expose">Expose</a></td><td></td></tr><tr><td style="white-space: nowrap;">policy</td><td style="white-space: nowrap;"><a href="#Policy">Policy</a></td><td></td></tr>
  </tbody>
</table>
</div>

<a id="Attributes"></a>
<div style="margin-left: 60px; padding-top: 30px;">

### Attributes
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">clusterName</td><td style="white-space: nowrap;">string</td><td>Friendly name to associate with your UDS cluster</td></tr><tr><td style="white-space: nowrap;">tags</td><td style="white-space: nowrap;">string[]</td><td>Tags to apply to your UDS cluster</td></tr>
  </tbody>
</table>
</div>

<a id="Networking"></a>
<div style="margin-left: 60px; padding-top: 30px;">

### Networking
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">kubeApiCIDR</td><td style="white-space: nowrap;">string</td><td>CIDR range for your Kubernetes control plane nodes. This is a manual override that can be used instead of relying on Pepr to automatically watch and update the values</td></tr><tr><td style="white-space: nowrap;">kubeNodeCIDRs</td><td style="white-space: nowrap;">string[]</td><td>CIDR(s) for all Kubernetes nodes (not just control plane). Similar reason to above,annual override instead of relying on watch</td></tr>
  </tbody>
</table>
</div>

<a id="CaBundle"></a>
<div style="margin-left: 60px; padding-top: 30px;">

### CaBundle
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">certs</td><td style="white-space: nowrap;">string</td><td>Contents of user provided CA bundle certificates</td></tr><tr><td style="white-space: nowrap;">includeDoDCerts</td><td style="white-space: nowrap;">boolean</td><td>Include DoD CA certificates in the bundle</td></tr><tr><td style="white-space: nowrap;">includePublicCerts</td><td style="white-space: nowrap;">boolean</td><td>Include public CA certificates in the bundle</td></tr>
  </tbody>
</table>
</div>

<a id="Expose"></a>
<div style="margin-left: 60px; padding-top: 30px;">

### Expose
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">domain</td><td style="white-space: nowrap;">string</td><td>Domain all cluster services will be exposed on</td></tr><tr><td style="white-space: nowrap;">adminDomain</td><td style="white-space: nowrap;">string</td><td>Domain all cluster services on the admin gateway will be exposed on</td></tr><tr><td style="white-space: nowrap;">caCert</td><td style="white-space: nowrap;">string</td><td>The trusted CA that signed your domain certificates if using Private PKI</td></tr>
  </tbody>
</table>
</div>

<a id="Policy"></a>
<div style="margin-left: 60px; padding-top: 30px;">

### Policy
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">allowAllNsExemptions</td><td style="white-space: nowrap;">boolean</td><td>Allow UDS Exemption custom resources to live in any namespace (default false)</td></tr>
  </tbody>
</table>
</div>