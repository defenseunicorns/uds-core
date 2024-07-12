# API Reference

Packages:

- [uds.dev/v1alpha1](#udsdevv1alpha1)

# uds.dev/v1alpha1

Resource Types:

- [Exemption](#exemption)

- [Package](#package)




## Exemption
<sup><sup>[↩ Parent](#udsdevv1alpha1 )</sup></sup>








<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
      <td><b>apiVersion</b></td>
      <td>string</td>
      <td>uds.dev/v1alpha1</td>
      <td>true</td>
      </tr>
      <tr>
      <td><b>kind</b></td>
      <td>string</td>
      <td>Exemption</td>
      <td>true</td>
      </tr>
      <tr>
      <td><b><a href="https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#objectmeta-v1-meta">metadata</a></b></td>
      <td>object</td>
      <td>Refer to the Kubernetes API documentation for the fields of the `metadata` field.</td>
      <td>true</td>
      </tr><tr>
        <td><b><a href="#exemptionspec">spec</a></b></td>
        <td>object</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Exemption.spec
<sup><sup>[↩ Parent](#exemption)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#exemptionspecexemptionsindex">exemptions</a></b></td>
        <td>[]object</td>
        <td>
          Policy exemptions<br/>
        </td>
        <td>true</td>
      </tr></tbody>
</table>


### Exemption.spec.exemptions[index]
<sup><sup>[↩ Parent](#exemptionspec)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#exemptionspecexemptionsindexmatcher">matcher</a></b></td>
        <td>object</td>
        <td>
          Resource to exempt (Regex allowed for name)<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>policies</b></td>
        <td>[]enum</td>
        <td>
          A list of policies to override<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>description</b></td>
        <td>string</td>
        <td>
          Reasons as to why this exemption is needed<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>title</b></td>
        <td>string</td>
        <td>
          title to give the exemption for reporting purposes<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Exemption.spec.exemptions[index].matcher
<sup><sup>[↩ Parent](#exemptionspecexemptionsindex)</sup></sup>



Resource to exempt (Regex allowed for name)

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>namespace</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>kind</b></td>
        <td>enum</td>
        <td>
          <br/>
          <br/>
            <i>Enum</i>: pod, service<br/>
            <i>Default</i>: pod<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>

## Package
<sup><sup>[↩ Parent](#udsdevv1alpha1 )</sup></sup>








<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
      <td><b>apiVersion</b></td>
      <td>string</td>
      <td>uds.dev/v1alpha1</td>
      <td>true</td>
      </tr>
      <tr>
      <td><b>kind</b></td>
      <td>string</td>
      <td>Package</td>
      <td>true</td>
      </tr>
      <tr>
      <td><b><a href="https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#objectmeta-v1-meta">metadata</a></b></td>
      <td>object</td>
      <td>Refer to the Kubernetes API documentation for the fields of the `metadata` field.</td>
      <td>true</td>
      </tr><tr>
        <td><b><a href="#packagespec">spec</a></b></td>
        <td>object</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagestatus">status</a></b></td>
        <td>object</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec
<sup><sup>[↩ Parent](#package)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#packagespecmonitorindex">monitor</a></b></td>
        <td>[]object</td>
        <td>
          Create Service or Pod Monitor configurations<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetwork">network</a></b></td>
        <td>object</td>
        <td>
          Network configuration for the package<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecssoindex">sso</a></b></td>
        <td>[]object</td>
        <td>
          Create SSO client configurations<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.monitor[index]
<sup><sup>[↩ Parent](#packagespec)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>portName</b></td>
        <td>string</td>
        <td>
          The port name for the serviceMonitor<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>selector</b></td>
        <td>map[string]string</td>
        <td>
          Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>targetPort</b></td>
        <td>number</td>
        <td>
          The service targetPort. This is required so the NetworkPolicy can be generated correctly.<br/>
          <br/>
            <i>Minimum</i>: 1<br/>
            <i>Maximum</i>: 65535<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#packagespecmonitorindexauthorization">authorization</a></b></td>
        <td>object</td>
        <td>
          Authorization settings.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>description</b></td>
        <td>string</td>
        <td>
          A description of this monitor entry, this will become part of the ServiceMonitor name<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>kind</b></td>
        <td>enum</td>
        <td>
          The type of monitor to create; PodMonitor or ServiceMonitor. ServiceMonitor is the default.<br/>
          <br/>
            <i>Enum</i>: PodMonitor, ServiceMonitor<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>path</b></td>
        <td>string</td>
        <td>
          HTTP path from which to scrape for metrics, defaults to `/metrics`<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>podSelector</b></td>
        <td>map[string]string</td>
        <td>
          Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.monitor[index].authorization
<sup><sup>[↩ Parent](#packagespecmonitorindex)</sup></sup>



Authorization settings.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#packagespecmonitorindexauthorizationcredentials">credentials</a></b></td>
        <td>object</td>
        <td>
          Selects a key of a Secret in the namespace that contains the credentials for authentication.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>type</b></td>
        <td>string</td>
        <td>
          Defines the authentication type. The value is case-insensitive. "Basic" is not a supported value. Default: "Bearer"<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.monitor[index].authorization.credentials
<sup><sup>[↩ Parent](#packagespecmonitorindexauthorization)</sup></sup>



Selects a key of a Secret in the namespace that contains the credentials for authentication.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          The key of the secret to select from. Must be a valid secret key.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>optional</b></td>
        <td>boolean</td>
        <td>
          Specify whether the Secret or its key must be defined<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network
<sup><sup>[↩ Parent](#packagespec)</sup></sup>



Network configuration for the package

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#packagespecnetworkallowindex">allow</a></b></td>
        <td>[]object</td>
        <td>
          Allow specific traffic (namespace will have a default-deny policy)<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindex">expose</a></b></td>
        <td>[]object</td>
        <td>
          Expose a service on an Istio Gateway<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.allow[index]
<sup><sup>[↩ Parent](#packagespecnetwork)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>direction</b></td>
        <td>enum</td>
        <td>
          The direction of the traffic<br/>
          <br/>
            <i>Enum</i>: Ingress, Egress<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>description</b></td>
        <td>string</td>
        <td>
          A description of the policy, this will become part of the policy name<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>labels</b></td>
        <td>map[string]string</td>
        <td>
          The labels to apply to the policy<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>podLabels</b></td>
        <td>map[string]string</td>
        <td>
          Deprecated: use selector<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>port</b></td>
        <td>number</td>
        <td>
          The port to allow (protocol is always TCP)<br/>
          <br/>
            <i>Minimum</i>: 1<br/>
            <i>Maximum</i>: 65535<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>ports</b></td>
        <td>[]number</td>
        <td>
          A list of ports to allow (protocol is always TCP)<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>remoteGenerated</b></td>
        <td>enum</td>
        <td>
          Custom generated remote selector for the policy<br/>
          <br/>
            <i>Enum</i>: KubeAPI, IntraNamespace, CloudMetadata, Anywhere<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>remoteNamespace</b></td>
        <td>string</td>
        <td>
          The remote namespace to allow traffic to/from. Use * or empty string to allow all namespaces<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>remotePodLabels</b></td>
        <td>map[string]string</td>
        <td>
          Deprecated: use remoteSelector<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>remoteSelector</b></td>
        <td>map[string]string</td>
        <td>
          The remote pod selector labels to allow traffic to/from<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>selector</b></td>
        <td>map[string]string</td>
        <td>
          Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index]
<sup><sup>[↩ Parent](#packagespecnetwork)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>host</b></td>
        <td>string</td>
        <td>
          The hostname to expose the service on<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttp">advancedHTTP</a></b></td>
        <td>object</td>
        <td>
          Advanced HTTP settings for the route.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>description</b></td>
        <td>string</td>
        <td>
          A description of this expose entry, this will become part of the VirtualService name<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>gateway</b></td>
        <td>enum</td>
        <td>
          The name of the gateway to expose the service on (default: tenant)<br/>
          <br/>
            <i>Enum</i>: admin, tenant, passthrough<br/>
            <i>Default</i>: tenant<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexmatchindex">match</a></b></td>
        <td>[]object</td>
        <td>
          Match the incoming request based on custom rules. Not permitted when using the passthrough gateway.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>podLabels</b></td>
        <td>map[string]string</td>
        <td>
          Deprecated: use selector<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>port</b></td>
        <td>number</td>
        <td>
          The port number to expose<br/>
          <br/>
            <i>Minimum</i>: 1<br/>
            <i>Maximum</i>: 65535<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>selector</b></td>
        <td>map[string]string</td>
        <td>
          Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>service</b></td>
        <td>string</td>
        <td>
          The name of the service to expose<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>targetPort</b></td>
        <td>number</td>
        <td>
          The service targetPort. This defaults to port and is only required if the service port is different from the target port (so the NetworkPolicy can be generated correctly).<br/>
          <br/>
            <i>Minimum</i>: 1<br/>
            <i>Maximum</i>: 65535<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP
<sup><sup>[↩ Parent](#packagespecnetworkexposeindex)</sup></sup>



Advanced HTTP settings for the route.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttpcorspolicy">corsPolicy</a></b></td>
        <td>object</td>
        <td>
          Cross-Origin Resource Sharing policy (CORS).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttpdirectresponse">directResponse</a></b></td>
        <td>object</td>
        <td>
          A HTTP rule can either return a direct_response, redirect or forward (default) traffic.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttpheaders">headers</a></b></td>
        <td>object</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttpmatchindex">match</a></b></td>
        <td>[]object</td>
        <td>
          Match the incoming request based on custom rules. Not permitted when using the passthrough gateway.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttpretries">retries</a></b></td>
        <td>object</td>
        <td>
          Retry policy for HTTP requests.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttprewrite">rewrite</a></b></td>
        <td>object</td>
        <td>
          Rewrite HTTP URIs and Authority headers.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>timeout</b></td>
        <td>string</td>
        <td>
          Timeout for HTTP requests, default is disabled.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>weight</b></td>
        <td>integer</td>
        <td>
          Weight specifies the relative proportion of traffic to be forwarded to the destination.<br/>
          <br/>
            <i>Format</i>: int32<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.corsPolicy
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttp)</sup></sup>



Cross-Origin Resource Sharing policy (CORS).

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>allowCredentials</b></td>
        <td>boolean</td>
        <td>
          Indicates whether the caller is allowed to send the actual request (not the preflight) using credentials.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>allowHeaders</b></td>
        <td>[]string</td>
        <td>
          List of HTTP headers that can be used when requesting the resource.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>allowMethods</b></td>
        <td>[]string</td>
        <td>
          List of HTTP methods allowed to access the resource.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>allowOrigin</b></td>
        <td>[]string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttpcorspolicyalloworiginsindex">allowOrigins</a></b></td>
        <td>[]object</td>
        <td>
          String patterns that match allowed origins.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>exposeHeaders</b></td>
        <td>[]string</td>
        <td>
          A list of HTTP headers that the browsers are allowed to access.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>maxAge</b></td>
        <td>string</td>
        <td>
          Specifies how long the results of a preflight request can be cached.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.corsPolicy.allowOrigins[index]
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttpcorspolicy)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>exact</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>prefix</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>regex</b></td>
        <td>string</td>
        <td>
          RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.directResponse
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttp)</sup></sup>



A HTTP rule can either return a direct_response, redirect or forward (default) traffic.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>status</b></td>
        <td>integer</td>
        <td>
          Specifies the HTTP response status to be returned.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttpdirectresponsebody">body</a></b></td>
        <td>object</td>
        <td>
          Specifies the content of the response body.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.directResponse.body
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttpdirectresponse)</sup></sup>



Specifies the content of the response body.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>bytes</b></td>
        <td>string</td>
        <td>
          response body as base64 encoded bytes.<br/>
          <br/>
            <i>Format</i>: binary<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>string</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.headers
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttp)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttpheadersrequest">request</a></b></td>
        <td>object</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttpheadersresponse">response</a></b></td>
        <td>object</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.headers.request
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttpheaders)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>add</b></td>
        <td>map[string]string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>remove</b></td>
        <td>[]string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>set</b></td>
        <td>map[string]string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.headers.response
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttpheaders)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>add</b></td>
        <td>map[string]string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>remove</b></td>
        <td>[]string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>set</b></td>
        <td>map[string]string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.match[index]
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttp)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          The name assigned to a match.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>ignoreUriCase</b></td>
        <td>boolean</td>
        <td>
          Flag to specify whether the URI matching should be case-insensitive.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttpmatchindexmethod">method</a></b></td>
        <td>object</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttpmatchindexqueryparamskey">queryParams</a></b></td>
        <td>map[string]object</td>
        <td>
          Query parameters for matching.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttpmatchindexuri">uri</a></b></td>
        <td>object</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.match[index].method
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttpmatchindex)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>exact</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>prefix</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>regex</b></td>
        <td>string</td>
        <td>
          RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.match[index].queryParams[key]
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttpmatchindex)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>exact</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>prefix</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>regex</b></td>
        <td>string</td>
        <td>
          RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.match[index].uri
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttpmatchindex)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>exact</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>prefix</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>regex</b></td>
        <td>string</td>
        <td>
          RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.retries
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttp)</sup></sup>



Retry policy for HTTP requests.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>attempts</b></td>
        <td>integer</td>
        <td>
          Number of retries to be allowed for a given request.<br/>
          <br/>
            <i>Format</i>: int32<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>perTryTimeout</b></td>
        <td>string</td>
        <td>
          Timeout per attempt for a given request, including the initial call and any retries.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>retryOn</b></td>
        <td>string</td>
        <td>
          Specifies the conditions under which retry takes place.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>retryRemoteLocalities</b></td>
        <td>boolean</td>
        <td>
          Flag to specify whether the retries should retry to other localities.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.rewrite
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttp)</sup></sup>



Rewrite HTTP URIs and Authority headers.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>authority</b></td>
        <td>string</td>
        <td>
          rewrite the Authority/Host header with this value.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>uri</b></td>
        <td>string</td>
        <td>
          rewrite the path (or the prefix) portion of the URI with this value.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexadvancedhttprewriteuriregexrewrite">uriRegexRewrite</a></b></td>
        <td>object</td>
        <td>
          rewrite the path portion of the URI with the specified regex.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].advancedHTTP.rewrite.uriRegexRewrite
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexadvancedhttprewrite)</sup></sup>



rewrite the path portion of the URI with the specified regex.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>match</b></td>
        <td>string</td>
        <td>
          RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>rewrite</b></td>
        <td>string</td>
        <td>
          The string that should replace into matching portions of original URI.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].match[index]
<sup><sup>[↩ Parent](#packagespecnetworkexposeindex)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          The name assigned to a match.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>ignoreUriCase</b></td>
        <td>boolean</td>
        <td>
          Flag to specify whether the URI matching should be case-insensitive.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexmatchindexmethod">method</a></b></td>
        <td>object</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexmatchindexqueryparamskey">queryParams</a></b></td>
        <td>map[string]object</td>
        <td>
          Query parameters for matching.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecnetworkexposeindexmatchindexuri">uri</a></b></td>
        <td>object</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].match[index].method
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexmatchindex)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>exact</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>prefix</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>regex</b></td>
        <td>string</td>
        <td>
          RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].match[index].queryParams[key]
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexmatchindex)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>exact</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>prefix</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>regex</b></td>
        <td>string</td>
        <td>
          RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.network.expose[index].match[index].uri
<sup><sup>[↩ Parent](#packagespecnetworkexposeindexmatchindex)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>exact</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>prefix</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>regex</b></td>
        <td>string</td>
        <td>
          RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.sso[index]
<sup><sup>[↩ Parent](#packagespec)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>clientId</b></td>
        <td>string</td>
        <td>
          The client identifier registered with the identity provider.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          Specifies display name of the client<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>redirectUris</b></td>
        <td>[]string</td>
        <td>
          Valid URI pattern a browser can redirect to after a successful login. Simple wildcards are allowed such as 'https://unicorns.uds.dev/*'<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>alwaysDisplayInConsole</b></td>
        <td>boolean</td>
        <td>
          Always list this client in the Account UI, even if the user does not have an active session.<br/>
          <br/>
            <i>Default</i>: false<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>attributes</b></td>
        <td>map[string]string</td>
        <td>
          Specifies attributes for the client.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>clientAuthenticatorType</b></td>
        <td>enum</td>
        <td>
          The client authenticator type<br/>
          <br/>
            <i>Enum</i>: client-secret, client-jwt<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>defaultClientScopes</b></td>
        <td>[]string</td>
        <td>
          Default client scopes<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>description</b></td>
        <td>string</td>
        <td>
          A description for the client, can be a URL to an image to replace the login logo<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>enableAuthserviceSelector</b></td>
        <td>map[string]string</td>
        <td>
          Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>enabled</b></td>
        <td>boolean</td>
        <td>
          Whether the SSO client is enabled<br/>
          <br/>
            <i>Default</i>: true<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#packagespecssoindexgroups">groups</a></b></td>
        <td>object</td>
        <td>
          The client sso group type<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>protocol</b></td>
        <td>enum</td>
        <td>
          Specifies the protocol of the client, either 'openid-connect' or 'saml'<br/>
          <br/>
            <i>Enum</i>: openid-connect, saml<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>rootUrl</b></td>
        <td>string</td>
        <td>
          Root URL appended to relative URLs<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>secret</b></td>
        <td>string</td>
        <td>
          The client secret. Typically left blank and auto-generated.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>secretName</b></td>
        <td>string</td>
        <td>
          The name of the secret to store the client secret<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>secretTemplate</b></td>
        <td>map[string]string</td>
        <td>
          A template for the generated secret<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>webOrigins</b></td>
        <td>[]string</td>
        <td>
          Allowed CORS origins. To permit all origins of Valid Redirect URIs, add '+'. This does not include the '*' wildcard though. To permit all origins, explicitly add '*'.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.spec.sso[index].groups
<sup><sup>[↩ Parent](#packagespecssoindex)</sup></sup>



The client sso group type

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>anyOf</b></td>
        <td>[]string</td>
        <td>
          List of groups allowed to access to client<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### Package.status
<sup><sup>[↩ Parent](#package)</sup></sup>





<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>authserviceClients</b></td>
        <td>[]string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>endpoints</b></td>
        <td>[]string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>monitors</b></td>
        <td>[]string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>networkPolicyCount</b></td>
        <td>integer</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>observedGeneration</b></td>
        <td>integer</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>phase</b></td>
        <td>enum</td>
        <td>
          <br/>
          <br/>
            <i>Enum</i>: Pending, Ready, Failed, Retrying<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>retryAttempt</b></td>
        <td>integer</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>ssoClients</b></td>
        <td>[]string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>
