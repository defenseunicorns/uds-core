---
title: Packages CR (v1alpha1)
tableOfContents:
  maxHeadingLevel: 6
sidebar:
  order: 20
---
<a id="Packages"></a>
<div style="margin-left: 20px; padding-top: 30px;">

# Packages
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
    <tr><td style="white-space: nowrap;">network</td><td style="white-space: nowrap;"><a href="#Network">Network</a></td><td>Network configuration for the package</td></tr><tr><td style="white-space: nowrap;">monitor</td><td style="white-space: nowrap;"><a href="#Monitor">Monitor[]</a></td><td>Create Service or Pod Monitor configurations</td></tr><tr><td style="white-space: nowrap;">sso</td><td style="white-space: nowrap;"><a href="#Sso">Sso[]</a></td><td>Create SSO client configurations</td></tr><tr><td style="white-space: nowrap;">caBundle</td><td style="white-space: nowrap;"><a href="#CaBundle">CaBundle</a></td><td>CA bundle configuration for the package</td></tr>
  </tbody>
</table>
</div>

<a id="Network"></a>
<div style="margin-left: 60px; padding-top: 30px;">

### Network
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">expose</td><td style="white-space: nowrap;"><a href="#Expose">Expose[]</a></td><td>Expose a service on an Istio Gateway</td></tr><tr><td style="white-space: nowrap;">allow</td><td style="white-space: nowrap;"><a href="#Allow">Allow[]</a></td><td>Allow specific traffic (namespace will have a default-deny policy)</td></tr><tr><td style="white-space: nowrap;">serviceMesh</td><td style="white-space: nowrap;"><a href="#ServiceMesh">ServiceMesh</a></td><td>Service Mesh configuration for the package</td></tr>
  </tbody>
</table>
</div>

<a id="Expose"></a>
<div style="margin-left: 80px; padding-top: 30px;">

#### Expose
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">description</td><td style="white-space: nowrap;">string</td><td>A description of this expose entry, this will become part of the VirtualService name</td></tr><tr><td style="white-space: nowrap;">host</td><td style="white-space: nowrap;">string</td><td>The hostname to expose the service on</td></tr><tr><td style="white-space: nowrap;">gateway</td><td style="white-space: nowrap;">string</td><td>The name of the gateway to expose the service on (default: tenant)</td></tr><tr><td style="white-space: nowrap;">domain</td><td style="white-space: nowrap;">string</td><td>The domain to expose the service on, only valid for additional gateways (not tenant, admin, or passthrough)</td></tr><tr><td style="white-space: nowrap;">service</td><td style="white-space: nowrap;">string</td><td>The name of the service to expose</td></tr><tr><td style="white-space: nowrap;">port</td><td style="white-space: nowrap;">number</td><td>The port number to expose</td></tr><tr><td style="white-space: nowrap;">selector</td><td style="white-space: nowrap;"></td><td>Selector for Pods targeted by the selected Services (so the NetworkPolicy can be generated correctly).</td></tr><tr><td style="white-space: nowrap;">targetPort</td><td style="white-space: nowrap;">number</td><td>The service targetPort. This defaults to port and is only required if the service port is different from the target port (so the NetworkPolicy can be generated correctly).</td></tr><tr><td style="white-space: nowrap;">advancedHTTP</td><td style="white-space: nowrap;"><a href="#AdvancedHTTP">AdvancedHTTP</a></td><td>Advanced HTTP settings for the route.</td></tr><tr><td style="white-space: nowrap;">match</td><td style="white-space: nowrap;"><a href="#Match">Match[]</a></td><td>Match the incoming request based on custom rules. Not permitted when using the passthrough gateway.</td></tr><tr><td style="white-space: nowrap;">podLabels</td><td style="white-space: nowrap;"></td><td>Deprecated: use selector</td></tr><tr><td style="white-space: nowrap;">uptime</td><td style="white-space: nowrap;"><a href="#Uptime">Uptime</a></td><td>Uptime monitoring configuration for this exposed service.</td></tr>
  </tbody>
</table>
</div>

<a id="AdvancedHTTP"></a>
<div style="margin-left: 100px; padding-top: 30px;">

##### AdvancedHTTP
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">corsPolicy</td><td style="white-space: nowrap;"><a href="#CorsPolicy">CorsPolicy</a></td><td>Cross-Origin Resource Sharing policy (CORS).</td></tr><tr><td style="white-space: nowrap;">directResponse</td><td style="white-space: nowrap;"><a href="#DirectResponse">DirectResponse</a></td><td>A HTTP rule can either return a direct_response, redirect or forward (default) traffic.</td></tr><tr><td style="white-space: nowrap;">headers</td><td style="white-space: nowrap;"><a href="#Headers">Headers</a></td><td></td></tr><tr><td style="white-space: nowrap;">match</td><td style="white-space: nowrap;"><a href="#Match">Match[]</a></td><td>Match the incoming request based on custom rules. Not permitted when using the passthrough gateway.</td></tr><tr><td style="white-space: nowrap;">rewrite</td><td style="white-space: nowrap;"><a href="#Rewrite">Rewrite</a></td><td>Rewrite HTTP URIs and Authority headers.</td></tr><tr><td style="white-space: nowrap;">redirect</td><td style="white-space: nowrap;"><a href="#Redirect">Redirect</a></td><td>A HTTP rule can either return a direct_response, redirect or forward (default) traffic.</td></tr><tr><td style="white-space: nowrap;">retries</td><td style="white-space: nowrap;"><a href="#Retries">Retries</a></td><td>Retry policy for HTTP requests.</td></tr><tr><td style="white-space: nowrap;">weight</td><td style="white-space: nowrap;">integer</td><td>Weight specifies the relative proportion of traffic to be forwarded to the destination.</td></tr><tr><td style="white-space: nowrap;">timeout</td><td style="white-space: nowrap;">string</td><td>Timeout for HTTP requests, default is disabled.</td></tr>
  </tbody>
</table>
</div>

<a id="CorsPolicy"></a>
<div style="margin-left: 120px; padding-top: 30px;">

###### CorsPolicy
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">allowCredentials</td><td style="white-space: nowrap;">boolean</td><td>Indicates whether the caller is allowed to send the actual request (not the preflight) using credentials.</td></tr><tr><td style="white-space: nowrap;">allowHeaders</td><td style="white-space: nowrap;">string[]</td><td>List of HTTP headers that can be used when requesting the resource.</td></tr><tr><td style="white-space: nowrap;">allowMethods</td><td style="white-space: nowrap;">string[]</td><td>List of HTTP methods allowed to access the resource.</td></tr><tr><td style="white-space: nowrap;">allowOrigin</td><td style="white-space: nowrap;">string[]</td><td></td></tr><tr><td style="white-space: nowrap;">allowOrigins</td><td style="white-space: nowrap;"><a href="#AllowOrigins">AllowOrigins[]</a></td><td>String patterns that match allowed origins.</td></tr><tr><td style="white-space: nowrap;">exposeHeaders</td><td style="white-space: nowrap;">string[]</td><td>A list of HTTP headers that the browsers are allowed to access.</td></tr><tr><td style="white-space: nowrap;">maxAge</td><td style="white-space: nowrap;">string</td><td>Specifies how long the results of a preflight request can be cached.</td></tr>
  </tbody>
</table>
</div>

<a id="AllowOrigins"></a>
<div style="margin-left: 140px; padding-top: 30px;">

###### AllowOrigins
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">exact</td><td style="white-space: nowrap;">string</td><td></td></tr><tr><td style="white-space: nowrap;">prefix</td><td style="white-space: nowrap;">string</td><td></td></tr><tr><td style="white-space: nowrap;">regex</td><td style="white-space: nowrap;">string</td><td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td></tr>
  </tbody>
</table>
</div>

<a id="DirectResponse"></a>
<div style="margin-left: 120px; padding-top: 30px;">

###### DirectResponse
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">body</td><td style="white-space: nowrap;"><a href="#Body">Body</a></td><td>Specifies the content of the response body.</td></tr>
  </tbody>
</table>
</div>

<a id="Body"></a>
<div style="margin-left: 140px; padding-top: 30px;">

###### Body
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">bytes</td><td style="white-space: nowrap;">string</td><td>response body as base64 encoded bytes.</td></tr><tr><td style="white-space: nowrap;">string</td><td style="white-space: nowrap;">string</td><td></td></tr>
  </tbody>
</table>
</div>

<a id="Headers"></a>
<div style="margin-left: 120px; padding-top: 30px;">

###### Headers
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">request</td><td style="white-space: nowrap;"><a href="#Request">Request</a></td><td></td></tr><tr><td style="white-space: nowrap;">response</td><td style="white-space: nowrap;"><a href="#Response">Response</a></td><td></td></tr>
  </tbody>
</table>
</div>

<a id="Request"></a>
<div style="margin-left: 140px; padding-top: 30px;">

###### Request
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">add</td><td style="white-space: nowrap;"></td><td></td></tr><tr><td style="white-space: nowrap;">remove</td><td style="white-space: nowrap;">string[]</td><td></td></tr><tr><td style="white-space: nowrap;">set</td><td style="white-space: nowrap;"></td><td></td></tr>
  </tbody>
</table>
</div>

<a id="Response"></a>
<div style="margin-left: 140px; padding-top: 30px;">

###### Response
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">add</td><td style="white-space: nowrap;"></td><td></td></tr><tr><td style="white-space: nowrap;">remove</td><td style="white-space: nowrap;">string[]</td><td></td></tr><tr><td style="white-space: nowrap;">set</td><td style="white-space: nowrap;"></td><td></td></tr>
  </tbody>
</table>
</div>

<a id="Match"></a>
<div style="margin-left: 120px; padding-top: 30px;">

###### Match
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">ignoreUriCase</td><td style="white-space: nowrap;">boolean</td><td>Flag to specify whether the URI matching should be case-insensitive.</td></tr><tr><td style="white-space: nowrap;">method</td><td style="white-space: nowrap;"><a href="#Method">Method</a></td><td></td></tr><tr><td style="white-space: nowrap;">name</td><td style="white-space: nowrap;">string</td><td>The name assigned to a match.</td></tr><tr><td style="white-space: nowrap;">queryParams</td><td style="white-space: nowrap;"></td><td>Query parameters for matching.</td></tr><tr><td style="white-space: nowrap;">uri</td><td style="white-space: nowrap;"><a href="#Uri">Uri</a></td><td></td></tr>
  </tbody>
</table>
</div>

<a id="Method"></a>
<div style="margin-left: 140px; padding-top: 30px;">

###### Method
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">exact</td><td style="white-space: nowrap;">string</td><td></td></tr><tr><td style="white-space: nowrap;">prefix</td><td style="white-space: nowrap;">string</td><td></td></tr><tr><td style="white-space: nowrap;">regex</td><td style="white-space: nowrap;">string</td><td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td></tr>
  </tbody>
</table>
</div>

<a id="Uri"></a>
<div style="margin-left: 140px; padding-top: 30px;">

###### Uri
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">exact</td><td style="white-space: nowrap;">string</td><td></td></tr><tr><td style="white-space: nowrap;">prefix</td><td style="white-space: nowrap;">string</td><td></td></tr><tr><td style="white-space: nowrap;">regex</td><td style="white-space: nowrap;">string</td><td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td></tr>
  </tbody>
</table>
</div>

<a id="Rewrite"></a>
<div style="margin-left: 120px; padding-top: 30px;">

###### Rewrite
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">authority</td><td style="white-space: nowrap;">string</td><td>rewrite the Authority/Host header with this value.</td></tr><tr><td style="white-space: nowrap;">uri</td><td style="white-space: nowrap;">string</td><td>rewrite the path (or the prefix) portion of the URI with this value.</td></tr><tr><td style="white-space: nowrap;">uriRegexRewrite</td><td style="white-space: nowrap;"><a href="#UriRegexRewrite">UriRegexRewrite</a></td><td>rewrite the path portion of the URI with the specified regex.</td></tr>
  </tbody>
</table>
</div>

<a id="UriRegexRewrite"></a>
<div style="margin-left: 140px; padding-top: 30px;">

###### UriRegexRewrite
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">match</td><td style="white-space: nowrap;">string</td><td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td></tr><tr><td style="white-space: nowrap;">rewrite</td><td style="white-space: nowrap;">string</td><td>The string that should replace into matching portions of original URI.</td></tr>
  </tbody>
</table>
</div>

<a id="Redirect"></a>
<div style="margin-left: 120px; padding-top: 30px;">

###### Redirect
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">authority</td><td style="white-space: nowrap;">string</td><td>On a redirect, overwrite the Authority/Host portion of the URL with this value.</td></tr><tr><td style="white-space: nowrap;">port</td><td style="white-space: nowrap;">integer</td><td>On a redirect, overwrite the port portion of the URL with this value.</td></tr><tr><td style="white-space: nowrap;">derivePort</td><td style="white-space: nowrap;">string (enum):<ul><li><code>FROM_PROTOCOL_DEFAULT</code></li><li><code>FROM_REQUEST_PORT</code></li></ul></td><td>On a redirect, dynamically set the port: * FROM_PROTOCOL_DEFAULT: automatically set to 80 for HTTP and 443 for HTTPS.

Valid Options: FROM_PROTOCOL_DEFAULT, FROM_REQUEST_PORT</td></tr><tr><td style="white-space: nowrap;">redirectCode</td><td style="white-space: nowrap;">integer</td><td>On a redirect, Specifies the HTTP status code to use in the redirect response.</td></tr><tr><td style="white-space: nowrap;">scheme</td><td style="white-space: nowrap;">string</td><td>On a redirect, overwrite the scheme portion of the URL with this value.</td></tr><tr><td style="white-space: nowrap;">uri</td><td style="white-space: nowrap;">string</td><td>On a redirect, overwrite the Path portion of the URL with this value.</td></tr>
  </tbody>
</table>
</div>

<a id="Retries"></a>
<div style="margin-left: 120px; padding-top: 30px;">

###### Retries
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">attempts</td><td style="white-space: nowrap;">integer</td><td>Number of retries to be allowed for a given request.</td></tr><tr><td style="white-space: nowrap;">perTryTimeout</td><td style="white-space: nowrap;">string</td><td>Timeout per attempt for a given request, including the initial call and any retries.</td></tr><tr><td style="white-space: nowrap;">retryOn</td><td style="white-space: nowrap;">string</td><td>Specifies the conditions under which retry takes place.</td></tr><tr><td style="white-space: nowrap;">retryRemoteLocalities</td><td style="white-space: nowrap;">boolean</td><td>Flag to specify whether the retries should retry to other localities.</td></tr>
  </tbody>
</table>
</div>

<a id="Match"></a>
<div style="margin-left: 100px; padding-top: 30px;">

##### Match
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">ignoreUriCase</td><td style="white-space: nowrap;">boolean</td><td>Flag to specify whether the URI matching should be case-insensitive.</td></tr><tr><td style="white-space: nowrap;">method</td><td style="white-space: nowrap;"><a href="#Method">Method</a></td><td></td></tr><tr><td style="white-space: nowrap;">name</td><td style="white-space: nowrap;">string</td><td>The name assigned to a match.</td></tr><tr><td style="white-space: nowrap;">queryParams</td><td style="white-space: nowrap;"></td><td>Query parameters for matching.</td></tr><tr><td style="white-space: nowrap;">uri</td><td style="white-space: nowrap;"><a href="#Uri">Uri</a></td><td></td></tr>
  </tbody>
</table>
</div>

<a id="Method"></a>
<div style="margin-left: 120px; padding-top: 30px;">

###### Method
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">exact</td><td style="white-space: nowrap;">string</td><td></td></tr><tr><td style="white-space: nowrap;">prefix</td><td style="white-space: nowrap;">string</td><td></td></tr><tr><td style="white-space: nowrap;">regex</td><td style="white-space: nowrap;">string</td><td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td></tr>
  </tbody>
</table>
</div>

<a id="Uri"></a>
<div style="margin-left: 120px; padding-top: 30px;">

###### Uri
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">exact</td><td style="white-space: nowrap;">string</td><td></td></tr><tr><td style="white-space: nowrap;">prefix</td><td style="white-space: nowrap;">string</td><td></td></tr><tr><td style="white-space: nowrap;">regex</td><td style="white-space: nowrap;">string</td><td>RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).</td></tr>
  </tbody>
</table>
</div>

<a id="Uptime"></a>
<div style="margin-left: 100px; padding-top: 30px;">

##### Uptime
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">checks</td><td style="white-space: nowrap;"><a href="#Checks">Checks</a></td><td>HTTP probe checks configuration for blackbox-exporter</td></tr>
  </tbody>
</table>
</div>

<a id="Checks"></a>
<div style="margin-left: 120px; padding-top: 30px;">

###### Checks
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">enabled</td><td style="white-space: nowrap;">boolean</td><td>Enable uptime monitoring for this endpoint (default: false)</td></tr><tr><td style="white-space: nowrap;">paths</td><td style="white-space: nowrap;">string[]</td><td>List of paths to check for uptime monitoring, appended to the host (default: ['/'])</td></tr><tr><td style="white-space: nowrap;">interval</td><td style="white-space: nowrap;">string</td><td>How frequently to scrape the targets (e.g., 30s, 1m)</td></tr><tr><td style="white-space: nowrap;">scrapeTimeout</td><td style="white-space: nowrap;">string</td><td>Timeout for each scrape request (e.g., 10s)</td></tr>
  </tbody>
</table>
</div>

<a id="Allow"></a>
<div style="margin-left: 80px; padding-top: 30px;">

#### Allow
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">labels</td><td style="white-space: nowrap;"></td><td>The labels to apply to the policy</td></tr><tr><td style="white-space: nowrap;">description</td><td style="white-space: nowrap;">string</td><td>A description of the policy, this will become part of the policy name</td></tr><tr><td style="white-space: nowrap;">direction</td><td style="white-space: nowrap;">string (enum):<ul><li><code>Ingress</code></li><li><code>Egress</code></li></ul></td><td>The direction of the traffic</td></tr><tr><td style="white-space: nowrap;">selector</td><td style="white-space: nowrap;"></td><td>Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace</td></tr><tr><td style="white-space: nowrap;">remoteNamespace</td><td style="white-space: nowrap;">string</td><td>The remote namespace to allow traffic to/from. Use * or empty string to allow all namespaces</td></tr><tr><td style="white-space: nowrap;">remoteSelector</td><td style="white-space: nowrap;"></td><td>The remote pod selector labels to allow traffic to/from</td></tr><tr><td style="white-space: nowrap;">remoteGenerated</td><td style="white-space: nowrap;">string (enum):<ul><li><code>KubeAPI</code></li><li><code>KubeNodes</code></li><li><code>IntraNamespace</code></li><li><code>CloudMetadata</code></li><li><code>Anywhere</code></li></ul></td><td>Custom generated remote selector for the policy</td></tr><tr><td style="white-space: nowrap;">remoteCidr</td><td style="white-space: nowrap;">string</td><td>Custom generated policy CIDR</td></tr><tr><td style="white-space: nowrap;">remoteHost</td><td style="white-space: nowrap;">string</td><td>Remote host to allow traffic out to</td></tr><tr><td style="white-space: nowrap;">remoteProtocol</td><td style="white-space: nowrap;">string (enum):<ul><li><code>TLS</code></li><li><code>HTTP</code></li></ul></td><td>Protocol used for external connection</td></tr><tr><td style="white-space: nowrap;">port</td><td style="white-space: nowrap;">number</td><td>The port to allow (protocol is always TCP)</td></tr><tr><td style="white-space: nowrap;">ports</td><td style="white-space: nowrap;">number[]</td><td>A list of ports to allow (protocol is always TCP)</td></tr><tr><td style="white-space: nowrap;">remoteServiceAccount</td><td style="white-space: nowrap;">string</td><td>The remote service account to restrict incoming traffic from within the remote namespace.           Only valid for Ingress rules.</td></tr><tr><td style="white-space: nowrap;">serviceAccount</td><td style="white-space: nowrap;">string</td><td>The service account to restrict outgoing traffic from within the package namespace.           Only valid for Egress rules.</td></tr><tr><td style="white-space: nowrap;">podLabels</td><td style="white-space: nowrap;"></td><td>Deprecated: use selector</td></tr><tr><td style="white-space: nowrap;">remotePodLabels</td><td style="white-space: nowrap;"></td><td>Deprecated: use remoteSelector</td></tr>
  </tbody>
</table>
</div>

<a id="ServiceMesh"></a>
<div style="margin-left: 80px; padding-top: 30px;">

#### ServiceMesh
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">mode</td><td style="white-space: nowrap;">string (enum):<ul><li><code>sidecar</code></li><li><code>ambient</code></li></ul></td><td>Set the service mesh mode for this package (namespace), defaults to ambient</td></tr>
  </tbody>
</table>
</div>

<a id="Monitor"></a>
<div style="margin-left: 60px; padding-top: 30px;">

### Monitor
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">description</td><td style="white-space: nowrap;">string</td><td>A description of this monitor entry, this will become part of the ServiceMonitor name</td></tr><tr><td style="white-space: nowrap;">portName</td><td style="white-space: nowrap;">string</td><td>The port name for the serviceMonitor</td></tr><tr><td style="white-space: nowrap;">targetPort</td><td style="white-space: nowrap;">number</td><td>The service targetPort. This is required so the NetworkPolicy can be generated correctly.</td></tr><tr><td style="white-space: nowrap;">selector</td><td style="white-space: nowrap;"></td><td>Selector for Services that expose metrics to scrape</td></tr><tr><td style="white-space: nowrap;">podSelector</td><td style="white-space: nowrap;"></td><td>Selector for Pods targeted by the selected Services (so the NetworkPolicy can be generated correctly). Defaults to `selector` when not specified.</td></tr><tr><td style="white-space: nowrap;">path</td><td style="white-space: nowrap;">string</td><td>HTTP path from which to scrape for metrics, defaults to `/metrics`</td></tr><tr><td style="white-space: nowrap;">kind</td><td style="white-space: nowrap;">string (enum):<ul><li><code>PodMonitor</code></li><li><code>ServiceMonitor</code></li></ul></td><td>The type of monitor to create; PodMonitor or ServiceMonitor. ServiceMonitor is the default.</td></tr><tr><td style="white-space: nowrap;">fallbackScrapeProtocol</td><td style="white-space: nowrap;">string (enum):<ul><li><code>OpenMetricsText0.0.1</code></li><li><code>OpenMetricsText1.0.0</code></li><li><code>PrometheusProto</code></li><li><code>PrometheusText0.0.4</code></li><li><code>PrometheusText1.0.0</code></li></ul></td><td>The protocol for Prometheus to use if a scrape returns a blank, unparsable, or otherwise invalid Content-Type</td></tr><tr><td style="white-space: nowrap;">authorization</td><td style="white-space: nowrap;"><a href="#Authorization">Authorization</a></td><td>Authorization settings.</td></tr>
  </tbody>
</table>
</div>

<a id="Authorization"></a>
<div style="margin-left: 80px; padding-top: 30px;">

#### Authorization
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">credentials</td><td style="white-space: nowrap;"><a href="#Credentials">Credentials</a></td><td>Selects a key of a Secret in the namespace that contains the credentials for authentication.</td></tr><tr><td style="white-space: nowrap;">type</td><td style="white-space: nowrap;">string</td><td>Defines the authentication type. The value is case-insensitive. "Basic" is not a supported value. Default: "Bearer"</td></tr>
  </tbody>
</table>
</div>

<a id="Credentials"></a>
<div style="margin-left: 100px; padding-top: 30px;">

##### Credentials
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">key</td><td style="white-space: nowrap;">string</td><td>The key of the secret to select from. Must be a valid secret key.</td></tr><tr><td style="white-space: nowrap;">name</td><td style="white-space: nowrap;">string</td><td>Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names</td></tr><tr><td style="white-space: nowrap;">optional</td><td style="white-space: nowrap;">boolean</td><td>Specify whether the Secret or its key must be defined</td></tr>
  </tbody>
</table>
</div>

<a id="Sso"></a>
<div style="margin-left: 60px; padding-top: 30px;">

### Sso
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">enableAuthserviceSelector</td><td style="white-space: nowrap;"></td><td>Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection</td></tr><tr><td style="white-space: nowrap;">secretConfig</td><td style="white-space: nowrap;"><a href="#SecretConfig">SecretConfig</a></td><td>Configuration for the generated Kubernetes Secret</td></tr><tr><td style="white-space: nowrap;">clientId</td><td style="white-space: nowrap;">string</td><td>The client identifier registered with the identity provider.</td></tr><tr><td style="white-space: nowrap;">secret</td><td style="white-space: nowrap;">string</td><td>The OAuth/OIDC client secret value sent to Keycloak. Typically left blank and auto-generated by Keycloak. Not to be confused with secretConfig, which configures the Kubernetes Secret resource.</td></tr><tr><td style="white-space: nowrap;">secretName</td><td style="white-space: nowrap;">string</td><td>Deprecated: use secretConfig.name</td></tr><tr><td style="white-space: nowrap;">secretLabels</td><td style="white-space: nowrap;"></td><td>Deprecated: use secretConfig.labels</td></tr><tr><td style="white-space: nowrap;">secretAnnotations</td><td style="white-space: nowrap;"></td><td>Deprecated: use secretConfig.annotations</td></tr><tr><td style="white-space: nowrap;">secretTemplate</td><td style="white-space: nowrap;"></td><td>Deprecated: use secretConfig.template</td></tr><tr><td style="white-space: nowrap;">name</td><td style="white-space: nowrap;">string</td><td>Specifies display name of the client</td></tr><tr><td style="white-space: nowrap;">description</td><td style="white-space: nowrap;">string</td><td>A description for the client, can be a URL to an image to replace the login logo</td></tr><tr><td style="white-space: nowrap;">baseUrl</td><td style="white-space: nowrap;">string</td><td>Default URL to use when the auth server needs to redirect or link back to the client.</td></tr><tr><td style="white-space: nowrap;">adminUrl</td><td style="white-space: nowrap;">string</td><td>This URL will be used for every binding to both the SP's Assertion Consumer and Single Logout Services.</td></tr><tr><td style="white-space: nowrap;">protocol</td><td style="white-space: nowrap;">string (enum):<ul><li><code>openid-connect</code></li><li><code>saml</code></li></ul></td><td>Specifies the protocol of the client, either 'openid-connect' or 'saml'</td></tr><tr><td style="white-space: nowrap;">attributes</td><td style="white-space: nowrap;"></td><td>Specifies attributes for the client.</td></tr><tr><td style="white-space: nowrap;">protocolMappers</td><td style="white-space: nowrap;"><a href="#ProtocolMappers">ProtocolMappers[]</a></td><td>Protocol Mappers to configure on the client</td></tr><tr><td style="white-space: nowrap;">rootUrl</td><td style="white-space: nowrap;">string</td><td>Root URL appended to relative URLs</td></tr><tr><td style="white-space: nowrap;">redirectUris</td><td style="white-space: nowrap;">string[]</td><td>Valid URI pattern a browser can redirect to after a successful login. Simple wildcards are allowed such as 'https://unicorns.uds.dev/*'</td></tr><tr><td style="white-space: nowrap;">webOrigins</td><td style="white-space: nowrap;">string[]</td><td>Allowed CORS origins. To permit all origins of Valid Redirect URIs, add '+'. This does not include the '*' wildcard though. To permit all origins, explicitly add '*'.</td></tr><tr><td style="white-space: nowrap;">enabled</td><td style="white-space: nowrap;">boolean</td><td>Whether the SSO client is enabled</td></tr><tr><td style="white-space: nowrap;">alwaysDisplayInConsole</td><td style="white-space: nowrap;">boolean</td><td>Always list this client in the Account UI, even if the user does not have an active session.</td></tr><tr><td style="white-space: nowrap;">standardFlowEnabled</td><td style="white-space: nowrap;">boolean</td><td>Enables the standard OpenID Connect redirect based authentication with authorization code.</td></tr><tr><td style="white-space: nowrap;">serviceAccountsEnabled</td><td style="white-space: nowrap;">boolean</td><td>Enables the client credentials grant based authentication via OpenID Connect protocol.</td></tr><tr><td style="white-space: nowrap;">publicClient</td><td style="white-space: nowrap;">boolean</td><td>Defines whether the client requires a client secret for authentication</td></tr><tr><td style="white-space: nowrap;">clientAuthenticatorType</td><td style="white-space: nowrap;">string (enum):<ul><li><code>client-secret</code></li><li><code>client-jwt</code></li></ul></td><td>The client authenticator type</td></tr><tr><td style="white-space: nowrap;">defaultClientScopes</td><td style="white-space: nowrap;">string[]</td><td>Default client scopes</td></tr><tr><td style="white-space: nowrap;">groups</td><td style="white-space: nowrap;"><a href="#Groups">Groups</a></td><td>The client SSO group type</td></tr>
  </tbody>
</table>
</div>

<a id="SecretConfig"></a>
<div style="margin-left: 80px; padding-top: 30px;">

#### SecretConfig
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">name</td><td style="white-space: nowrap;">string</td><td>The name of the secret to store the client secret</td></tr><tr><td style="white-space: nowrap;">labels</td><td style="white-space: nowrap;"></td><td>Additional labels to apply to the generated secret, can be used for pod reloading</td></tr><tr><td style="white-space: nowrap;">annotations</td><td style="white-space: nowrap;"></td><td>Additional annotations to apply to the generated secret, can be used for pod reloading with a selector</td></tr><tr><td style="white-space: nowrap;">template</td><td style="white-space: nowrap;"></td><td>A template for the generated secret</td></tr>
  </tbody>
</table>
</div>

<a id="ProtocolMappers"></a>
<div style="margin-left: 80px; padding-top: 30px;">

#### ProtocolMappers
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">name</td><td style="white-space: nowrap;">string</td><td>Name of the mapper</td></tr><tr><td style="white-space: nowrap;">protocol</td><td style="white-space: nowrap;">string (enum):<ul><li><code>openid-connect</code></li><li><code>saml</code></li></ul></td><td>Protocol of the mapper</td></tr><tr><td style="white-space: nowrap;">protocolMapper</td><td style="white-space: nowrap;">string</td><td>Protocol Mapper type of the mapper</td></tr><tr><td style="white-space: nowrap;">consentRequired</td><td style="white-space: nowrap;">boolean</td><td>Whether user consent is required for this mapper</td></tr><tr><td style="white-space: nowrap;">config</td><td style="white-space: nowrap;"></td><td>Configuration options for the mapper.</td></tr>
  </tbody>
</table>
</div>

<a id="Groups"></a>
<div style="margin-left: 80px; padding-top: 30px;">

#### Groups
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">anyOf</td><td style="white-space: nowrap;">string[]</td><td>List of groups allowed to access the client</td></tr>
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
    <tr><td style="white-space: nowrap;">configMap</td><td style="white-space: nowrap;"><a href="#ConfigMap">ConfigMap</a></td><td>ConfigMap configuration for CA bundle</td></tr>
  </tbody>
</table>
</div>

<a id="ConfigMap"></a>
<div style="margin-left: 80px; padding-top: 30px;">

#### ConfigMap
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="white-space: nowrap;">name</td><td style="white-space: nowrap;">string</td><td>The name of the ConfigMap to create (default: uds-trust-bundle)</td></tr><tr><td style="white-space: nowrap;">key</td><td style="white-space: nowrap;">string</td><td>The key name inside the ConfigMap (default: ca-bundle.pem)</td></tr><tr><td style="white-space: nowrap;">labels</td><td style="white-space: nowrap;"></td><td>Additional labels to apply to the generated ConfigMap (default: {})</td></tr><tr><td style="white-space: nowrap;">annotations</td><td style="white-space: nowrap;"></td><td>Additional annotations to apply to the generated ConfigMap (default: {})</td></tr>
  </tbody>
</table>
</div>