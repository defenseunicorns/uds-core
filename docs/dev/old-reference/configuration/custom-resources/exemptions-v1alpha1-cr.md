---
title: Exemptions CR (v1alpha1)
tableOfContents:
  maxHeadingLevel: 6
sidebar:
  order: 20
---
<a id="Exemptions"></a>
<div style="margin-left: 20px; padding-top: 30px;">

# Exemptions
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">spec</td><td style="white-space: nowrap;"><a href="#Spec">Spec</a></td><td></td></tr>
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
    <tr><td style="white-space: nowrap;">exemptions</td><td style="white-space: nowrap;"><a href="#Exemptions">Exemptions[]</a></td><td>Policy exemptions</td></tr>
  </tbody>
</table>
</div>

<a id="Exemptions"></a>
<div style="margin-left: 60px; padding-top: 30px;">

### Exemptions
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">title</td><td style="white-space: nowrap;">string</td><td>title to give the exemption for reporting purposes</td></tr><tr><td style="white-space: nowrap;">description</td><td style="white-space: nowrap;">string</td><td>Reasons as to why this exemption is needed</td></tr><tr><td style="white-space: nowrap;">policies</td><td style="white-space: nowrap;">Policies[] (enum):<ul><li><code>DisallowHostNamespaces</code></li><li><code>DisallowNodePortServices</code></li><li><code>DisallowPrivileged</code></li><li><code>DisallowSELinuxOptions</code></li><li><code>DropAllCapabilities</code></li><li><code>RequireNonRootUser</code></li><li><code>RestrictCapabilities</code></li><li><code>RestrictExternalNames</code></li><li><code>RestrictHostPathWrite</code></li><li><code>RestrictHostPorts</code></li><li><code>RestrictIstioAmbientOverrides</code></li><li><code>RestrictIstioSidecarOverrides</code></li><li><code>RestrictIstioTrafficOverrides</code></li><li><code>RestrictIstioUser</code></li><li><code>RestrictProcMount</code></li><li><code>RestrictSeccomp</code></li><li><code>RestrictSELinuxType</code></li><li><code>RestrictVolumeTypes</code></li></ul></td><td>A list of policies to override</td></tr><tr><td style="white-space: nowrap;">matcher</td><td style="white-space: nowrap;"><a href="#Matcher">Matcher</a></td><td>Resource to exempt (Regex allowed for name)</td></tr>
  </tbody>
</table>
</div>

<a id="Matcher"></a>
<div style="margin-left: 80px; padding-top: 30px;">

#### Matcher
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">namespace</td><td style="white-space: nowrap;">string</td><td></td></tr><tr><td style="white-space: nowrap;">name</td><td style="white-space: nowrap;">string</td><td></td></tr><tr><td style="white-space: nowrap;">kind</td><td style="white-space: nowrap;">string (enum):<ul><li><code>pod</code></li><li><code>service</code></li></ul></td><td></td></tr>
  </tbody>
</table>
</div>