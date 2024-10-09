---
title: Package CR (v1alpha1)
weight: 6
---

<a id="Package"></a>
## Package
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">spec</td>
      <td style="white-space: nowrap;">
          <a href="#Spec">Spec</a>
      </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">status</td>
      <td style="white-space: nowrap;">
          <a href="#Status">Status</a>
      </td>
      <td></td>
    </tr>
  </tbody>
</table>

<a id="Spec"></a>
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
    <tr>
      <td style="white-space: nowrap;">monitor</td>
      <td style="white-space: nowrap;">
            <a href="#Monitor">Monitor</a>[]
      </td>
      <td>Create Service or Pod Monitor configurations</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">network</td>
      <td style="white-space: nowrap;">
          <a href="#Network">Network</a>
      </td>
      <td>Network configuration for the package</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">sso</td>
      <td style="white-space: nowrap;">
            <a href="#Sso">Sso</a>[]
      </td>
      <td>Create SSO client configurations</td>
    </tr>
  </tbody>
</table>

<a id="Monitor"></a>
## Monitor
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">authorization</td>
      <td style="white-space: nowrap;">
          <a href="#Authorization">Authorization</a>
      </td>
      <td>Authorization settings.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">description</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>A description of this monitor entry, this will become part of the ServiceMonitor name</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">kind</td>
      <td style="white-space: nowrap;">
          Kind (enum):<ul><li><code>PodMonitor</code></li><li><code>ServiceMonitor</code></li></ul>
      </td>
      <td>The type of monitor to create; PodMonitor or ServiceMonitor. ServiceMonitor is the<br/>default.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">path</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>HTTP path from which to scrape for metrics, defaults to `/metrics`</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">podSelector</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">portName</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>The port name for the serviceMonitor</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">selector</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">targetPort</td>
      <td style="white-space: nowrap;">
          number
              </td>
      <td>The service targetPort. This is required so the NetworkPolicy can be generated correctly.</td>
    </tr>
  </tbody>
</table>

<a id="Authorization"></a>
## Authorization
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">credentials</td>
      <td style="white-space: nowrap;">
          <a href="#Credentials">Credentials</a>
      </td>
      <td>Selects a key of a Secret in the namespace that contains the credentials for<br/>authentication.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">type</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>Defines the authentication type. The value is case-insensitive. "Basic" is not a<br/>supported value. Default: "Bearer"</td>
    </tr>
  </tbody>
</table>

<a id="Credentials"></a>
## Credentials
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">key</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>The key of the secret to select from. Must be a valid secret key.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">name</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>Name of the referent. More info:<br/>https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">optional</td>
      <td style="white-space: nowrap;">
          boolean
              </td>
      <td>Specify whether the Secret or its key must be defined</td>
    </tr>
  </tbody>
</table>

<a id="Network"></a>
## Network
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">allow</td>
      <td style="white-space: nowrap;">
            <a href="#Allow">Allow</a>[]
      </td>
      <td>Allow specific traffic (namespace will have a default-deny policy)</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">expose</td>
      <td style="white-space: nowrap;">
            <a href="#Expose">Expose</a>[]
      </td>
      <td>Expose a service on an Istio Gateway</td>
    </tr>
  </tbody>
</table>

<a id="Allow"></a>
## Allow
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">description</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>A description of the policy, this will become part of the policy name</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">direction</td>
      <td style="white-space: nowrap;">
          Direction (enum):<ul><li><code>Ingress</code></li><li><code>Egress</code></li></ul>
      </td>
      <td>The direction of the traffic</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">labels</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">podLabels</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">port</td>
      <td style="white-space: nowrap;">
          number
              </td>
      <td>The port to allow (protocol is always TCP)</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">ports</td>
      <td style="white-space: nowrap;">
            number[]
      </td>
      <td>A list of ports to allow (protocol is always TCP)</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">remoteCidr</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>Custom generated policy CIDR</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">remoteGenerated</td>
      <td style="white-space: nowrap;">
          RemoteGenerated (enum):<ul><li><code>KubeAPI</code></li><li><code>IntraNamespace</code></li><li><code>CloudMetadata</code></li><li><code>Anywhere</code></li></ul>
      </td>
      <td>Custom generated remote selector for the policy</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">remoteNamespace</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>The remote namespace to allow traffic to/from. Use * or empty string to allow all<br/>namespaces</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">remotePodLabels</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">remoteSelector</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">selector</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
  </tbody>
</table>

<a id="Expose"></a>
## Expose
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">advancedHTTP</td>
      <td style="white-space: nowrap;">
          <a href="#AdvancedHTTP">AdvancedHTTP</a>
      </td>
      <td>Advanced HTTP settings for the route.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">description</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>A description of this expose entry, this will become part of the VirtualService name</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">gateway</td>
      <td style="white-space: nowrap;">
          Gateway (enum):<ul><li><code>admin</code></li><li><code>tenant</code></li><li><code>passthrough</code></li></ul>
      </td>
      <td>The name of the gateway to expose the service on (default: tenant)</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">host</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>The hostname to expose the service on</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">match</td>
      <td style="white-space: nowrap;">
            <a href="#ExposeMatch">ExposeMatch</a>[]
      </td>
      <td>Match the incoming request based on custom rules. Not permitted when using the<br/>passthrough gateway.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">podLabels</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">port</td>
      <td style="white-space: nowrap;">
          number
              </td>
      <td>The port number to expose</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">selector</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">service</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>The name of the service to expose</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">targetPort</td>
      <td style="white-space: nowrap;">
          number
              </td>
      <td>The service targetPort. This defaults to port and is only required if the service port is<br/>different from the target port (so the NetworkPolicy can be generated correctly).</td>
    </tr>
  </tbody>
</table>

<a id="AdvancedHTTP"></a>
## AdvancedHTTP
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">corsPolicy</td>
      <td style="white-space: nowrap;">
          <a href="#CorsPolicy">CorsPolicy</a>
      </td>
      <td>Cross-Origin Resource Sharing policy (CORS).</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">directResponse</td>
      <td style="white-space: nowrap;">
          <a href="#DirectResponse">DirectResponse</a>
      </td>
      <td>A HTTP rule can either return a direct_response, redirect or forward (default) traffic.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">headers</td>
      <td style="white-space: nowrap;">
          <a href="#Headers">Headers</a>
      </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">match</td>
      <td style="white-space: nowrap;">
            <a href="#AdvancedHTTPMatch">AdvancedHTTPMatch</a>[]
      </td>
      <td>Match the incoming request based on custom rules. Not permitted when using the<br/>passthrough gateway.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">redirect</td>
      <td style="white-space: nowrap;">
          <a href="#Redirect">Redirect</a>
      </td>
      <td>A HTTP rule can either return a direct_response, redirect or forward (default) traffic.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">retries</td>
      <td style="white-space: nowrap;">
          <a href="#Retries">Retries</a>
      </td>
      <td>Retry policy for HTTP requests.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">rewrite</td>
      <td style="white-space: nowrap;">
          <a href="#Rewrite">Rewrite</a>
      </td>
      <td>Rewrite HTTP URIs and Authority headers.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">timeout</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>Timeout for HTTP requests, default is disabled.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">weight</td>
      <td style="white-space: nowrap;">
          integer
              </td>
      <td>Weight specifies the relative proportion of traffic to be forwarded to the destination.</td>
    </tr>
  </tbody>
</table>

<a id="CorsPolicy"></a>
## CorsPolicy
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">allowCredentials</td>
      <td style="white-space: nowrap;">
          boolean
              </td>
      <td>Indicates whether the caller is allowed to send the actual request (not the preflight)<br/>using credentials.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">allowHeaders</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td>List of HTTP headers that can be used when requesting the resource.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">allowMethods</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td>List of HTTP methods allowed to access the resource.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">allowOrigin</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">allowOrigins</td>
      <td style="white-space: nowrap;">
            <a href="#AllowOrigin">AllowOrigin</a>[]
      </td>
      <td>String patterns that match allowed origins.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">exposeHeaders</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td>A list of HTTP headers that the browsers are allowed to access.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">maxAge</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>Specifies how long the results of a preflight request can be cached.</td>
    </tr>
  </tbody>
</table>

<a id="AllowOrigin"></a>
## AllowOrigin
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">exact</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">prefix</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">regex</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td>
    </tr>
  </tbody>
</table>

<a id="DirectResponse"></a>
## DirectResponse
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">body</td>
      <td style="white-space: nowrap;">
          <a href="#Body">Body</a>
      </td>
      <td>Specifies the content of the response body.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">status</td>
      <td style="white-space: nowrap;">
          integer
              </td>
      <td>Specifies the HTTP response status to be returned.</td>
    </tr>
  </tbody>
</table>

<a id="Body"></a>
## Body
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">bytes</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>response body as base64 encoded bytes.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">string</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
  </tbody>
</table>

<a id="Headers"></a>
## Headers
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">request</td>
      <td style="white-space: nowrap;">
          <a href="#Request">Request</a>
      </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">response</td>
      <td style="white-space: nowrap;">
          <a href="#Response">Response</a>
      </td>
      <td></td>
    </tr>
  </tbody>
</table>

<a id="Request"></a>
## Request
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">add</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">remove</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">set</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
  </tbody>
</table>

<a id="Response"></a>
## Response
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">add</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">remove</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">set</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
  </tbody>
</table>

<a id="AdvancedHTTPMatch"></a>
## AdvancedHTTPMatch
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">ignoreUriCase</td>
      <td style="white-space: nowrap;">
          boolean
              </td>
      <td>Flag to specify whether the URI matching should be case-insensitive.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">method</td>
      <td style="white-space: nowrap;">
          <a href="#PurpleMethod">PurpleMethod</a>
      </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">name</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>The name assigned to a match.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">queryParams</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Query parameters for matching.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">uri</td>
      <td style="white-space: nowrap;">
          <a href="#PurpleURI">PurpleURI</a>
      </td>
      <td></td>
    </tr>
  </tbody>
</table>

<a id="PurpleMethod"></a>
## PurpleMethod
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">exact</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">prefix</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">regex</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td>
    </tr>
  </tbody>
</table>

<a id="PurpleQueryParam"></a>
## PurpleQueryParam
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">exact</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">prefix</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">regex</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td>
    </tr>
  </tbody>
</table>

<a id="PurpleURI"></a>
## PurpleURI
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">exact</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">prefix</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">regex</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td>
    </tr>
  </tbody>
</table>

<a id="Redirect"></a>
## Redirect
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">authority</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>On a redirect, overwrite the Authority/Host portion of the URL with this value.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">derivePort</td>
      <td style="white-space: nowrap;">
          DerivePort (enum):<ul><li><code>FROM_PROTOCOL_DEFAULT</code></li><li><code>FROM_REQUEST_PORT</code></li></ul>
      </td>
      <td>On a redirect, dynamically set the port: * FROM_PROTOCOL_DEFAULT: automatically set to 80<br/>for HTTP and 443 for HTTPS.<br/><br/>Valid Options: FROM_PROTOCOL_DEFAULT, FROM_REQUEST_PORT</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">port</td>
      <td style="white-space: nowrap;">
          integer
              </td>
      <td>On a redirect, overwrite the port portion of the URL with this value.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">redirectCode</td>
      <td style="white-space: nowrap;">
          integer
              </td>
      <td>On a redirect, Specifies the HTTP status code to use in the redirect response.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">scheme</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>On a redirect, overwrite the scheme portion of the URL with this value.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">uri</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>On a redirect, overwrite the Path portion of the URL with this value.</td>
    </tr>
  </tbody>
</table>

<a id="Retries"></a>
## Retries
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">attempts</td>
      <td style="white-space: nowrap;">
          integer
              </td>
      <td>Number of retries to be allowed for a given request.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">perTryTimeout</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>Timeout per attempt for a given request, including the initial call and any retries.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">retryOn</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>Specifies the conditions under which retry takes place.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">retryRemoteLocalities</td>
      <td style="white-space: nowrap;">
          boolean
              </td>
      <td>Flag to specify whether the retries should retry to other localities.</td>
    </tr>
  </tbody>
</table>

<a id="Rewrite"></a>
## Rewrite
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">authority</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>rewrite the Authority/Host header with this value.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">uri</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>rewrite the path (or the prefix) portion of the URI with this value.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">uriRegexRewrite</td>
      <td style="white-space: nowrap;">
          <a href="#URIRegexRewrite">URIRegexRewrite</a>
      </td>
      <td>rewrite the path portion of the URI with the specified regex.</td>
    </tr>
  </tbody>
</table>

<a id="URIRegexRewrite"></a>
## URIRegexRewrite
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">match</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">rewrite</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>The string that should replace into matching portions of original URI.</td>
    </tr>
  </tbody>
</table>

<a id="ExposeMatch"></a>
## ExposeMatch
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">ignoreUriCase</td>
      <td style="white-space: nowrap;">
          boolean
              </td>
      <td>Flag to specify whether the URI matching should be case-insensitive.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">method</td>
      <td style="white-space: nowrap;">
          <a href="#FluffyMethod">FluffyMethod</a>
      </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">name</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>The name assigned to a match.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">queryParams</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Query parameters for matching.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">uri</td>
      <td style="white-space: nowrap;">
          <a href="#FluffyURI">FluffyURI</a>
      </td>
      <td></td>
    </tr>
  </tbody>
</table>

<a id="FluffyMethod"></a>
## FluffyMethod
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">exact</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">prefix</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">regex</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td>
    </tr>
  </tbody>
</table>

<a id="FluffyQueryParam"></a>
## FluffyQueryParam
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">exact</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">prefix</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">regex</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td>
    </tr>
  </tbody>
</table>

<a id="FluffyURI"></a>
## FluffyURI
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">exact</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">prefix</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">regex</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td>
    </tr>
  </tbody>
</table>

<a id="Sso"></a>
## Sso
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">alwaysDisplayInConsole</td>
      <td style="white-space: nowrap;">
          boolean
              </td>
      <td>Always list this client in the Account UI, even if the user does not have an active<br/>session.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">attributes</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">clientAuthenticatorType</td>
      <td style="white-space: nowrap;">
          ClientAuthenticatorType (enum):<ul><li><code>client-secret</code></li><li><code>client-jwt</code></li></ul>
      </td>
      <td>The client authenticator type</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">clientId</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>The client identifier registered with the identity provider.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">defaultClientScopes</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td>Default client scopes</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">description</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>A description for the client, can be a URL to an image to replace the login logo</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">enableAuthserviceSelector</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">enabled</td>
      <td style="white-space: nowrap;">
          boolean
              </td>
      <td>Whether the SSO client is enabled</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">groups</td>
      <td style="white-space: nowrap;">
          <a href="#Groups">Groups</a>
      </td>
      <td>The client SSO group type</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">name</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>Specifies display name of the client</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">protocol</td>
      <td style="white-space: nowrap;">
          Protocol (enum):<ul><li><code>openid-connect</code></li><li><code>saml</code></li></ul>
      </td>
      <td>Specifies the protocol of the client, either 'openid-connect' or 'saml'</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">protocolMappers</td>
      <td style="white-space: nowrap;">
            <a href="#ProtocolMapper">ProtocolMapper</a>[]
      </td>
      <td>Protocol Mappers to configure on the client</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">publicClient</td>
      <td style="white-space: nowrap;">
          boolean
              </td>
      <td>Defines whether the client requires a client secret for authentication</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">redirectUris</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td>Valid URI pattern a browser can redirect to after a successful login. Simple wildcards<br/>are allowed such as 'https://unicorns.uds.dev/*'</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">rootUrl</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>Root URL appended to relative URLs</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">secret</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>The client secret. Typically left blank and auto-generated.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">secretName</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>The name of the secret to store the client secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">secretTemplate</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">standardFlowEnabled</td>
      <td style="white-space: nowrap;">
          boolean
              </td>
      <td>Enables the standard OpenID Connect redirect based authentication with authorization code.</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">webOrigins</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td>Allowed CORS origins. To permit all origins of Valid Redirect URIs, add '+'. This does<br/>not include the '*' wildcard though. To permit all origins, explicitly add '*'.</td>
    </tr>
  </tbody>
</table>

<a id="Groups"></a>
## Groups
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">anyOf</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td>List of groups allowed to access the client</td>
    </tr>
  </tbody>
</table>

<a id="ProtocolMapper"></a>
## ProtocolMapper
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">config</td>
      <td style="white-space: nowrap;">
          object
              </td>
      <td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>The labels to apply to the policy<br/>Deprecated: use selector<br/>Deprecated: use remoteSelector<br/>The remote pod selector labels to allow traffic to/from<br/>Specifies attributes for the client.<br/>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>Configuration options for the mapper.<br/>A template for the generated secret</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">consentRequired</td>
      <td style="white-space: nowrap;">
          boolean
              </td>
      <td>Whether user consent is required for this mapper</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">name</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>Name of the mapper</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">protocol</td>
      <td style="white-space: nowrap;">
          Protocol (enum):<ul><li><code>openid-connect</code></li><li><code>saml</code></li></ul>
      </td>
      <td>Protocol of the mapper</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">protocolMapper</td>
      <td style="white-space: nowrap;">
          string
              </td>
      <td>Protocol Mapper type of the mapper</td>
    </tr>
  </tbody>
</table>

<a id="Status"></a>
## Status
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">authserviceClients</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">endpoints</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">monitors</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">networkPolicyCount</td>
      <td style="white-space: nowrap;">
          integer
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">observedGeneration</td>
      <td style="white-space: nowrap;">
          integer
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">phase</td>
      <td style="white-space: nowrap;">
          Phase (enum):<ul><li><code>Pending</code></li><li><code>Ready</code></li><li><code>Failed</code></li><li><code>Retrying</code></li></ul>
      </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">retryAttempt</td>
      <td style="white-space: nowrap;">
          integer
              </td>
      <td></td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">ssoClients</td>
      <td style="white-space: nowrap;">
            string[]
      </td>
      <td></td>
    </tr>
  </tbody>
</table>
