# Schema Docs

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Package                                                     |

| Property             | Title/Description |
| -------------------- | ----------------- |
| - [spec](#spec )     | -                 |
| - [status](#status ) | -                 |

## Property `spec`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Spec                                                        |

| Property                    | Title/Description                            |
| --------------------------- | -------------------------------------------- |
| - [monitor](#spec_monitor ) | Create Service or Pod Monitor configurations |
| - [network](#spec_network ) | Network configuration for the package        |
| - [sso](#spec_sso )         | Create SSO client configurations             |

### Property `monitor`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** Create Service or Pod Monitor configurations

| Each item of this array must be | Description |
| ------------------------------- | ----------- |
| [Monitor](#spec_monitor_items)  | -           |

#### Monitor

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Monitor                                                     |

| Property                                              | Title/Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [authorization](#spec_monitor_items_authorization ) | Authorization settings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| - [description](#spec_monitor_items_description )     | A description of this monitor entry, this will become part of the ServiceMonitor name                                                                                                                                                                                                                                                                                                                                                                                                       |
| - [kind](#spec_monitor_items_kind )                   | The type of monitor to create; PodMonitor or ServiceMonitor. ServiceMonitor is the<br />default.                                                                                                                                                                                                                                                                                                                                                                                            |
| - [path](#spec_monitor_items_path )                   | HTTP path from which to scrape for metrics, defaults to \`/metrics\`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| - [podSelector](#spec_monitor_items_podSelector )     | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| + [portName](#spec_monitor_items_portName )           | The port name for the serviceMonitor                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| + [selector](#spec_monitor_items_selector )           | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| + [targetPort](#spec_monitor_items_targetPort )       | The service targetPort. This is required so the NetworkPolicy can be generated correctly.                                                                                                                                                                                                                                                                                                                                                                                                   |

##### Property `authorization`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Authorization                                               |

**Description:** Authorization settings.

| Property                                                        | Title/Description                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| + [credentials](#spec_monitor_items_authorization_credentials ) | Selects a key of a Secret in the namespace that contains the credentials for<br />authentication.                        |
| - [type](#spec_monitor_items_authorization_type )               | Defines the authentication type. The value is case-insensitive. "Basic" is not a<br />supported value. Default: "Bearer" |

###### Property `credentials`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | Yes                                                                       |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Credentials                                                 |

**Description:** Selects a key of a Secret in the namespace that contains the credentials for
authentication.

| Property                                                              | Title/Description                                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| + [key](#spec_monitor_items_authorization_credentials_key )           | The key of the secret to select from. Must be a valid secret key.                                                    |
| - [name](#spec_monitor_items_authorization_credentials_name )         | Name of the referent. More info:<br />https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names |
| - [optional](#spec_monitor_items_authorization_credentials_optional ) | Specify whether the Secret or its key must be defined                                                                |

###### Property `key`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The key of the secret to select from. Must be a valid secret key.

###### Property `name`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Name of the referent. More info:
https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

###### Property `optional`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Specify whether the Secret or its key must be defined

###### Property `type`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Defines the authentication type. The value is case-insensitive. "Basic" is not a
supported value. Default: "Bearer"

##### Property `description`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** A description of this monitor entry, this will become part of the ServiceMonitor name

##### Property `kind`

|                |                    |
| -------------- | ------------------ |
| **Type**       | `enum (of string)` |
| **Required**   | No                 |
| **Defined in** | #/definitions/Kind |

**Description:** The type of monitor to create; PodMonitor or ServiceMonitor. ServiceMonitor is the
default.

Must be one of:
* "PodMonitor"
* "ServiceMonitor"

##### Property `path`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** HTTP path from which to scrape for metrics, defaults to `/metrics`

##### Property `podSelector`

|                           |                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                 |
| **Required**              | No                                                                                                                                       |
| **Additional properties** | [[Should-conform]](#spec_monitor_items_podSelector_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                    | Title/Description |
| ----------------------------------------------------------- | ----------------- |
| - [](#spec_monitor_items_podSelector_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### Property `portName`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The port name for the serviceMonitor

##### Property `selector`

|                           |                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                              |
| **Required**              | Yes                                                                                                                                   |
| **Additional properties** | [[Should-conform]](#spec_monitor_items_selector_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                 | Title/Description |
| -------------------------------------------------------- | ----------------- |
| - [](#spec_monitor_items_selector_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### Property `targetPort`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | Yes      |

**Description:** The service targetPort. This is required so the NetworkPolicy can be generated correctly.

### Property `network`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Network                                                     |

**Description:** Network configuration for the package

| Property                          | Title/Description                                                  |
| --------------------------------- | ------------------------------------------------------------------ |
| - [allow](#spec_network_allow )   | Allow specific traffic (namespace will have a default-deny policy) |
| - [expose](#spec_network_expose ) | Expose a service on an Istio Gateway                               |

#### Property `allow`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** Allow specific traffic (namespace will have a default-deny policy)

| Each item of this array must be    | Description |
| ---------------------------------- | ----------- |
| [Allow](#spec_network_allow_items) | -           |

##### Allow

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Allow                                                       |

| Property                                                        | Title/Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [description](#spec_network_allow_items_description )         | A description of the policy, this will become part of the policy name                                                                                                                                                                                                                                                                                                                                                                                                                       |
| + [direction](#spec_network_allow_items_direction )             | The direction of the traffic                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| - [labels](#spec_network_allow_items_labels )                   | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| - [podLabels](#spec_network_allow_items_podLabels )             | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| - [port](#spec_network_allow_items_port )                       | The port to allow (protocol is always TCP)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| - [ports](#spec_network_allow_items_ports )                     | A list of ports to allow (protocol is always TCP)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| - [remoteGenerated](#spec_network_allow_items_remoteGenerated ) | Custom generated remote selector for the policy                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| - [remoteNamespace](#spec_network_allow_items_remoteNamespace ) | The remote namespace to allow traffic to/from. Use * or empty string to allow all<br />namespaces                                                                                                                                                                                                                                                                                                                                                                                           |
| - [remotePodLabels](#spec_network_allow_items_remotePodLabels ) | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| - [remoteSelector](#spec_network_allow_items_remoteSelector )   | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| - [selector](#spec_network_allow_items_selector )               | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |

###### Property `description`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** A description of the policy, this will become part of the policy name

###### Property `direction`

|                |                         |
| -------------- | ----------------------- |
| **Type**       | `enum (of string)`      |
| **Required**   | Yes                     |
| **Defined in** | #/definitions/Direction |

**Description:** The direction of the traffic

Must be one of:
* "Ingress"
* "Egress"

###### Property `labels`

|                           |                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                  |
| **Required**              | No                                                                                                                                        |
| **Additional properties** | [[Should-conform]](#spec_network_allow_items_labels_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                     | Title/Description |
| ------------------------------------------------------------ | ----------------- |
| - [](#spec_network_allow_items_labels_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `podLabels`

|                           |                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                     |
| **Required**              | No                                                                                                                                           |
| **Additional properties** | [[Should-conform]](#spec_network_allow_items_podLabels_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                        | Title/Description |
| --------------------------------------------------------------- | ----------------- |
| - [](#spec_network_allow_items_podLabels_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port to allow (protocol is always TCP)

###### Property `ports`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of number` |
| **Required** | No                |

**Description:** A list of ports to allow (protocol is always TCP)

| Each item of this array must be                      | Description |
| ---------------------------------------------------- | ----------- |
| [ports items](#spec_network_allow_items_ports_items) | -           |

###### ports items

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

###### Property `remoteGenerated`

|                |                               |
| -------------- | ----------------------------- |
| **Type**       | `enum (of string)`            |
| **Required**   | No                            |
| **Defined in** | #/definitions/RemoteGenerated |

**Description:** Custom generated remote selector for the policy

Must be one of:
* "KubeAPI"
* "IntraNamespace"
* "CloudMetadata"
* "Anywhere"

###### Property `remoteNamespace`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The remote namespace to allow traffic to/from. Use * or empty string to allow all
namespaces

###### Property `remotePodLabels`

|                           |                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                           |
| **Required**              | No                                                                                                                                                 |
| **Additional properties** | [[Should-conform]](#spec_network_allow_items_remotePodLabels_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                              | Title/Description |
| --------------------------------------------------------------------- | ----------------- |
| - [](#spec_network_allow_items_remotePodLabels_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `remoteSelector`

|                           |                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                          |
| **Required**              | No                                                                                                                                                |
| **Additional properties** | [[Should-conform]](#spec_network_allow_items_remoteSelector_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                             | Title/Description |
| -------------------------------------------------------------------- | ----------------- |
| - [](#spec_network_allow_items_remoteSelector_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `selector`

|                           |                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                    |
| **Required**              | No                                                                                                                                          |
| **Additional properties** | [[Should-conform]](#spec_network_allow_items_selector_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                       | Title/Description |
| -------------------------------------------------------------- | ----------------- |
| - [](#spec_network_allow_items_selector_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### Property `expose`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** Expose a service on an Istio Gateway

| Each item of this array must be      | Description |
| ------------------------------------ | ----------- |
| [Expose](#spec_network_expose_items) | -           |

##### Expose

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Expose                                                      |

| Property                                                   | Title/Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [advancedHTTP](#spec_network_expose_items_advancedHTTP ) | Advanced HTTP settings for the route.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| - [description](#spec_network_expose_items_description )   | A description of this expose entry, this will become part of the VirtualService name                                                                                                                                                                                                                                                                                                                                                                                                        |
| - [gateway](#spec_network_expose_items_gateway )           | The name of the gateway to expose the service on (default: tenant)                                                                                                                                                                                                                                                                                                                                                                                                                          |
| + [host](#spec_network_expose_items_host )                 | The hostname to expose the service on                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| - [match](#spec_network_expose_items_match )               | Match the incoming request based on custom rules. Not permitted when using the<br />passthrough gateway.                                                                                                                                                                                                                                                                                                                                                                                    |
| - [podLabels](#spec_network_expose_items_podLabels )       | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| - [port](#spec_network_expose_items_port )                 | The port number to expose                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| - [selector](#spec_network_expose_items_selector )         | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| - [service](#spec_network_expose_items_service )           | The name of the service to expose                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| - [targetPort](#spec_network_expose_items_targetPort )     | The service targetPort. This defaults to port and is only required if the service port is<br />different from the target port (so the NetworkPolicy can be generated correctly).                                                                                                                                                                                                                                                                                                            |

###### Property `advancedHTTP`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/AdvancedHTTP                                                |

**Description:** Advanced HTTP settings for the route.

| Property                                                                    | Title/Description                                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| - [corsPolicy](#spec_network_expose_items_advancedHTTP_corsPolicy )         | Cross-Origin Resource Sharing policy (CORS).                                                             |
| - [directResponse](#spec_network_expose_items_advancedHTTP_directResponse ) | A HTTP rule can either return a direct_response, redirect or forward (default) traffic.                  |
| - [headers](#spec_network_expose_items_advancedHTTP_headers )               | -                                                                                                        |
| - [match](#spec_network_expose_items_advancedHTTP_match )                   | Match the incoming request based on custom rules. Not permitted when using the<br />passthrough gateway. |
| - [retries](#spec_network_expose_items_advancedHTTP_retries )               | Retry policy for HTTP requests.                                                                          |
| - [rewrite](#spec_network_expose_items_advancedHTTP_rewrite )               | Rewrite HTTP URIs and Authority headers.                                                                 |
| - [timeout](#spec_network_expose_items_advancedHTTP_timeout )               | Timeout for HTTP requests, default is disabled.                                                          |
| - [weight](#spec_network_expose_items_advancedHTTP_weight )                 | Weight specifies the relative proportion of traffic to be forwarded to the destination.                  |

###### Property `corsPolicy`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/CorsPolicy                                                  |

**Description:** Cross-Origin Resource Sharing policy (CORS).

| Property                                                                                   | Title/Description                                                                                              |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| - [allowCredentials](#spec_network_expose_items_advancedHTTP_corsPolicy_allowCredentials ) | Indicates whether the caller is allowed to send the actual request (not the preflight)<br />using credentials. |
| - [allowHeaders](#spec_network_expose_items_advancedHTTP_corsPolicy_allowHeaders )         | List of HTTP headers that can be used when requesting the resource.                                            |
| - [allowMethods](#spec_network_expose_items_advancedHTTP_corsPolicy_allowMethods )         | List of HTTP methods allowed to access the resource.                                                           |
| - [allowOrigin](#spec_network_expose_items_advancedHTTP_corsPolicy_allowOrigin )           | -                                                                                                              |
| - [allowOrigins](#spec_network_expose_items_advancedHTTP_corsPolicy_allowOrigins )         | String patterns that match allowed origins.                                                                    |
| - [exposeHeaders](#spec_network_expose_items_advancedHTTP_corsPolicy_exposeHeaders )       | A list of HTTP headers that the browsers are allowed to access.                                                |
| - [maxAge](#spec_network_expose_items_advancedHTTP_corsPolicy_maxAge )                     | Specifies how long the results of a preflight request can be cached.                                           |

###### Property `allowCredentials`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Indicates whether the caller is allowed to send the actual request (not the preflight)
using credentials.

###### Property `allowHeaders`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** List of HTTP headers that can be used when requesting the resource.

| Each item of this array must be                                                             | Description |
| ------------------------------------------------------------------------------------------- | ----------- |
| [allowHeaders items](#spec_network_expose_items_advancedHTTP_corsPolicy_allowHeaders_items) | -           |

###### allowHeaders items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `allowMethods`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** List of HTTP methods allowed to access the resource.

| Each item of this array must be                                                             | Description |
| ------------------------------------------------------------------------------------------- | ----------- |
| [allowMethods items](#spec_network_expose_items_advancedHTTP_corsPolicy_allowMethods_items) | -           |

###### allowMethods items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `allowOrigin`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

| Each item of this array must be                                                           | Description |
| ----------------------------------------------------------------------------------------- | ----------- |
| [allowOrigin items](#spec_network_expose_items_advancedHTTP_corsPolicy_allowOrigin_items) | -           |

###### allowOrigin items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `allowOrigins`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** String patterns that match allowed origins.

| Each item of this array must be                                                      | Description |
| ------------------------------------------------------------------------------------ | ----------- |
| [AllowOrigin](#spec_network_expose_items_advancedHTTP_corsPolicy_allowOrigins_items) | -           |

###### AllowOrigin

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/AllowOrigin                                                 |

| Property                                                                                  | Title/Description                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| - [exact](#spec_network_expose_items_advancedHTTP_corsPolicy_allowOrigins_items_exact )   | -                                                                        |
| - [prefix](#spec_network_expose_items_advancedHTTP_corsPolicy_allowOrigins_items_prefix ) | -                                                                        |
| - [regex](#spec_network_expose_items_advancedHTTP_corsPolicy_allowOrigins_items_regex )   | RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax). |

###### Property `exact`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `prefix`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).

###### Property `exposeHeaders`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** A list of HTTP headers that the browsers are allowed to access.

| Each item of this array must be                                                               | Description |
| --------------------------------------------------------------------------------------------- | ----------- |
| [exposeHeaders items](#spec_network_expose_items_advancedHTTP_corsPolicy_exposeHeaders_items) | -           |

###### exposeHeaders items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `maxAge`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Specifies how long the results of a preflight request can be cached.

###### Property `directResponse`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/DirectResponse                                              |

**Description:** A HTTP rule can either return a direct_response, redirect or forward (default) traffic.

| Property                                                                   | Title/Description                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------- |
| - [body](#spec_network_expose_items_advancedHTTP_directResponse_body )     | Specifies the content of the response body.        |
| + [status](#spec_network_expose_items_advancedHTTP_directResponse_status ) | Specifies the HTTP response status to be returned. |

###### Property `body`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Body                                                        |

**Description:** Specifies the content of the response body.

| Property                                                                        | Title/Description                      |
| ------------------------------------------------------------------------------- | -------------------------------------- |
| - [bytes](#spec_network_expose_items_advancedHTTP_directResponse_body_bytes )   | response body as base64 encoded bytes. |
| - [string](#spec_network_expose_items_advancedHTTP_directResponse_body_string ) | -                                      |

###### Property `bytes`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** response body as base64 encoded bytes.

###### Property `string`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `status`

|              |           |
| ------------ | --------- |
| **Type**     | `integer` |
| **Required** | Yes       |

**Description:** Specifies the HTTP response status to be returned.

###### Property `headers`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Headers                                                     |

| Property                                                                | Title/Description |
| ----------------------------------------------------------------------- | ----------------- |
| - [request](#spec_network_expose_items_advancedHTTP_headers_request )   | -                 |
| - [response](#spec_network_expose_items_advancedHTTP_headers_response ) | -                 |

###### Property `request`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Request                                                     |

| Property                                                                    | Title/Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [add](#spec_network_expose_items_advancedHTTP_headers_request_add )       | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| - [remove](#spec_network_expose_items_advancedHTTP_headers_request_remove ) | -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| - [set](#spec_network_expose_items_advancedHTTP_headers_request_set )       | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |

###### Property `add`

|                           |                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                                             |
| **Required**              | No                                                                                                                                                                   |
| **Additional properties** | [[Should-conform]](#spec_network_expose_items_advancedHTTP_headers_request_add_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                                                | Title/Description |
| --------------------------------------------------------------------------------------- | ----------------- |
| - [](#spec_network_expose_items_advancedHTTP_headers_request_add_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `remove`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

| Each item of this array must be                                                      | Description |
| ------------------------------------------------------------------------------------ | ----------- |
| [remove items](#spec_network_expose_items_advancedHTTP_headers_request_remove_items) | -           |

###### remove items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `set`

|                           |                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                                             |
| **Required**              | No                                                                                                                                                                   |
| **Additional properties** | [[Should-conform]](#spec_network_expose_items_advancedHTTP_headers_request_set_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                                                | Title/Description |
| --------------------------------------------------------------------------------------- | ----------------- |
| - [](#spec_network_expose_items_advancedHTTP_headers_request_set_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `response`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Response                                                    |

| Property                                                                     | Title/Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [add](#spec_network_expose_items_advancedHTTP_headers_response_add )       | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| - [remove](#spec_network_expose_items_advancedHTTP_headers_response_remove ) | -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| - [set](#spec_network_expose_items_advancedHTTP_headers_response_set )       | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |

###### Property `add`

|                           |                                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                                              |
| **Required**              | No                                                                                                                                                                    |
| **Additional properties** | [[Should-conform]](#spec_network_expose_items_advancedHTTP_headers_response_add_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                                                 | Title/Description |
| ---------------------------------------------------------------------------------------- | ----------------- |
| - [](#spec_network_expose_items_advancedHTTP_headers_response_add_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `remove`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

| Each item of this array must be                                                       | Description |
| ------------------------------------------------------------------------------------- | ----------- |
| [remove items](#spec_network_expose_items_advancedHTTP_headers_response_remove_items) | -           |

###### remove items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `set`

|                           |                                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                                              |
| **Required**              | No                                                                                                                                                                    |
| **Additional properties** | [[Should-conform]](#spec_network_expose_items_advancedHTTP_headers_response_set_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                                                 | Title/Description |
| ---------------------------------------------------------------------------------------- | ----------------- |
| - [](#spec_network_expose_items_advancedHTTP_headers_response_set_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `match`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** Match the incoming request based on custom rules. Not permitted when using the
passthrough gateway.

| Each item of this array must be                                          | Description |
| ------------------------------------------------------------------------ | ----------- |
| [AdvancedHTTPMatch](#spec_network_expose_items_advancedHTTP_match_items) | -           |

###### AdvancedHTTPMatch

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/AdvancedHTTPMatch                                           |

| Property                                                                              | Title/Description                                                    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| - [ignoreUriCase](#spec_network_expose_items_advancedHTTP_match_items_ignoreUriCase ) | Flag to specify whether the URI matching should be case-insensitive. |
| - [method](#spec_network_expose_items_advancedHTTP_match_items_method )               | -                                                                    |
| + [name](#spec_network_expose_items_advancedHTTP_match_items_name )                   | The name assigned to a match.                                        |
| - [queryParams](#spec_network_expose_items_advancedHTTP_match_items_queryParams )     | Query parameters for matching.                                       |
| - [uri](#spec_network_expose_items_advancedHTTP_match_items_uri )                     | -                                                                    |

###### Property `ignoreUriCase`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Flag to specify whether the URI matching should be case-insensitive.

###### Property `method`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/PurpleMethod                                                |

| Property                                                                       | Title/Description                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| - [exact](#spec_network_expose_items_advancedHTTP_match_items_method_exact )   | -                                                                        |
| - [prefix](#spec_network_expose_items_advancedHTTP_match_items_method_prefix ) | -                                                                        |
| - [regex](#spec_network_expose_items_advancedHTTP_match_items_method_regex )   | RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax). |

###### Property `exact`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `prefix`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).

###### Property `name`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The name assigned to a match.

###### Property `queryParams`

|                           |                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Type**                  | `object`                                                                                                                                                                 |
| **Required**              | No                                                                                                                                                                       |
| **Additional properties** | [[Should-conform]](#spec_network_expose_items_advancedHTTP_match_items_queryParams_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Query parameters for matching.

| Property                                                                                    | Title/Description |
| ------------------------------------------------------------------------------------------- | ----------------- |
| - [](#spec_network_expose_items_advancedHTTP_match_items_queryParams_additionalProperties ) | -                 |

###### Property `PurpleQueryParam`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/PurpleQueryParam                                            |

| Property                                                                                                 | Title/Description                                                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| - [exact](#spec_network_expose_items_advancedHTTP_match_items_queryParams_additionalProperties_exact )   | -                                                                        |
| - [prefix](#spec_network_expose_items_advancedHTTP_match_items_queryParams_additionalProperties_prefix ) | -                                                                        |
| - [regex](#spec_network_expose_items_advancedHTTP_match_items_queryParams_additionalProperties_regex )   | RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax). |

###### Property `exact`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `prefix`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).

###### Property `uri`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/PurpleURI                                                   |

| Property                                                                    | Title/Description                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| - [exact](#spec_network_expose_items_advancedHTTP_match_items_uri_exact )   | -                                                                        |
| - [prefix](#spec_network_expose_items_advancedHTTP_match_items_uri_prefix ) | -                                                                        |
| - [regex](#spec_network_expose_items_advancedHTTP_match_items_uri_regex )   | RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax). |

###### Property `exact`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `prefix`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).

###### Property `retries`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Retries                                                     |

**Description:** Retry policy for HTTP requests.

| Property                                                                                          | Title/Description                                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| - [attempts](#spec_network_expose_items_advancedHTTP_retries_attempts )                           | Number of retries to be allowed for a given request.                                 |
| - [perTryTimeout](#spec_network_expose_items_advancedHTTP_retries_perTryTimeout )                 | Timeout per attempt for a given request, including the initial call and any retries. |
| - [retryOn](#spec_network_expose_items_advancedHTTP_retries_retryOn )                             | Specifies the conditions under which retry takes place.                              |
| - [retryRemoteLocalities](#spec_network_expose_items_advancedHTTP_retries_retryRemoteLocalities ) | Flag to specify whether the retries should retry to other localities.                |

###### Property `attempts`

|              |           |
| ------------ | --------- |
| **Type**     | `integer` |
| **Required** | No        |

**Description:** Number of retries to be allowed for a given request.

###### Property `perTryTimeout`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Timeout per attempt for a given request, including the initial call and any retries.

###### Property `retryOn`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Specifies the conditions under which retry takes place.

###### Property `retryRemoteLocalities`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Flag to specify whether the retries should retry to other localities.

###### Property `rewrite`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Rewrite                                                     |

**Description:** Rewrite HTTP URIs and Authority headers.

| Property                                                                              | Title/Description                                                    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| - [authority](#spec_network_expose_items_advancedHTTP_rewrite_authority )             | rewrite the Authority/Host header with this value.                   |
| - [uri](#spec_network_expose_items_advancedHTTP_rewrite_uri )                         | rewrite the path (or the prefix) portion of the URI with this value. |
| - [uriRegexRewrite](#spec_network_expose_items_advancedHTTP_rewrite_uriRegexRewrite ) | rewrite the path portion of the URI with the specified regex.        |

###### Property `authority`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** rewrite the Authority/Host header with this value.

###### Property `uri`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** rewrite the path (or the prefix) portion of the URI with this value.

###### Property `uriRegexRewrite`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/URIRegexRewrite                                             |

**Description:** rewrite the path portion of the URI with the specified regex.

| Property                                                                              | Title/Description                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| - [match](#spec_network_expose_items_advancedHTTP_rewrite_uriRegexRewrite_match )     | RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax). |
| - [rewrite](#spec_network_expose_items_advancedHTTP_rewrite_uriRegexRewrite_rewrite ) | The string that should replace into matching portions of original URI.   |

###### Property `match`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).

###### Property `rewrite`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The string that should replace into matching portions of original URI.

###### Property `timeout`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Timeout for HTTP requests, default is disabled.

###### Property `weight`

|              |           |
| ------------ | --------- |
| **Type**     | `integer` |
| **Required** | No        |

**Description:** Weight specifies the relative proportion of traffic to be forwarded to the destination.

###### Property `description`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** A description of this expose entry, this will become part of the VirtualService name

###### Property `gateway`

|                |                       |
| -------------- | --------------------- |
| **Type**       | `enum (of string)`    |
| **Required**   | No                    |
| **Defined in** | #/definitions/Gateway |

**Description:** The name of the gateway to expose the service on (default: tenant)

Must be one of:
* "admin"
* "tenant"
* "passthrough"

###### Property `host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The hostname to expose the service on

###### Property `match`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** Match the incoming request based on custom rules. Not permitted when using the
passthrough gateway.

| Each item of this array must be                       | Description |
| ----------------------------------------------------- | ----------- |
| [ExposeMatch](#spec_network_expose_items_match_items) | -           |

###### ExposeMatch

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/ExposeMatch                                                 |

| Property                                                                 | Title/Description                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| - [ignoreUriCase](#spec_network_expose_items_match_items_ignoreUriCase ) | Flag to specify whether the URI matching should be case-insensitive. |
| - [method](#spec_network_expose_items_match_items_method )               | -                                                                    |
| + [name](#spec_network_expose_items_match_items_name )                   | The name assigned to a match.                                        |
| - [queryParams](#spec_network_expose_items_match_items_queryParams )     | Query parameters for matching.                                       |
| - [uri](#spec_network_expose_items_match_items_uri )                     | -                                                                    |

###### Property `ignoreUriCase`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Flag to specify whether the URI matching should be case-insensitive.

###### Property `method`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/FluffyMethod                                                |

| Property                                                          | Title/Description                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| - [exact](#spec_network_expose_items_match_items_method_exact )   | -                                                                        |
| - [prefix](#spec_network_expose_items_match_items_method_prefix ) | -                                                                        |
| - [regex](#spec_network_expose_items_match_items_method_regex )   | RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax). |

###### Property `exact`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `prefix`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).

###### Property `name`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The name assigned to a match.

###### Property `queryParams`

|                           |                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                                    |
| **Required**              | No                                                                                                                                                          |
| **Additional properties** | [[Should-conform]](#spec_network_expose_items_match_items_queryParams_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Query parameters for matching.

| Property                                                                       | Title/Description |
| ------------------------------------------------------------------------------ | ----------------- |
| - [](#spec_network_expose_items_match_items_queryParams_additionalProperties ) | -                 |

###### Property `FluffyQueryParam`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/FluffyQueryParam                                            |

| Property                                                                                    | Title/Description                                                        |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| - [exact](#spec_network_expose_items_match_items_queryParams_additionalProperties_exact )   | -                                                                        |
| - [prefix](#spec_network_expose_items_match_items_queryParams_additionalProperties_prefix ) | -                                                                        |
| - [regex](#spec_network_expose_items_match_items_queryParams_additionalProperties_regex )   | RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax). |

###### Property `exact`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `prefix`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).

###### Property `uri`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/FluffyURI                                                   |

| Property                                                       | Title/Description                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| - [exact](#spec_network_expose_items_match_items_uri_exact )   | -                                                                        |
| - [prefix](#spec_network_expose_items_match_items_uri_prefix ) | -                                                                        |
| - [regex](#spec_network_expose_items_match_items_uri_regex )   | RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax). |

###### Property `exact`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `prefix`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).

###### Property `podLabels`

|                           |                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                      |
| **Required**              | No                                                                                                                                            |
| **Additional properties** | [[Should-conform]](#spec_network_expose_items_podLabels_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                         | Title/Description |
| ---------------------------------------------------------------- | ----------------- |
| - [](#spec_network_expose_items_podLabels_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port number to expose

###### Property `selector`

|                           |                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                     |
| **Required**              | No                                                                                                                                           |
| **Additional properties** | [[Should-conform]](#spec_network_expose_items_selector_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                        | Title/Description |
| --------------------------------------------------------------- | ----------------- |
| - [](#spec_network_expose_items_selector_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### Property `service`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The name of the service to expose

###### Property `targetPort`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The service targetPort. This defaults to port and is only required if the service port is
different from the target port (so the NetworkPolicy can be generated correctly).

### Property `sso`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** Create SSO client configurations

| Each item of this array must be | Description |
| ------------------------------- | ----------- |
| [Sso](#spec_sso_items)          | -           |

#### Sso

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Sso                                                         |

| Property                                                                  | Title/Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [alwaysDisplayInConsole](#spec_sso_items_alwaysDisplayInConsole )       | Always list this client in the Account UI, even if the user does not have an active<br />session.                                                                                                                                                                                                                                                                                                                                                                                           |
| - [attributes](#spec_sso_items_attributes )                               | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| - [clientAuthenticatorType](#spec_sso_items_clientAuthenticatorType )     | The client authenticator type                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| + [clientId](#spec_sso_items_clientId )                                   | The client identifier registered with the identity provider.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| - [defaultClientScopes](#spec_sso_items_defaultClientScopes )             | Default client scopes                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| - [description](#spec_sso_items_description )                             | A description for the client, can be a URL to an image to replace the login logo                                                                                                                                                                                                                                                                                                                                                                                                            |
| - [enableAuthserviceSelector](#spec_sso_items_enableAuthserviceSelector ) | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| - [enabled](#spec_sso_items_enabled )                                     | Whether the SSO client is enabled                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| - [groups](#spec_sso_items_groups )                                       | The client sso group type                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| + [name](#spec_sso_items_name )                                           | Specifies display name of the client                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| - [protocol](#spec_sso_items_protocol )                                   | Specifies the protocol of the client, either 'openid-connect' or 'saml'                                                                                                                                                                                                                                                                                                                                                                                                                     |
| - [publicClient](#spec_sso_items_publicClient )                           | Defines whether the client requires a client secret for authentication                                                                                                                                                                                                                                                                                                                                                                                                                      |
| - [redirectUris](#spec_sso_items_redirectUris )                           | Valid URI pattern a browser can redirect to after a successful login. Simple wildcards<br />are allowed such as 'https://unicorns.uds.dev/*'                                                                                                                                                                                                                                                                                                                                                |
| - [rootUrl](#spec_sso_items_rootUrl )                                     | Root URL appended to relative URLs                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| - [secret](#spec_sso_items_secret )                                       | The client secret. Typically left blank and auto-generated.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| - [secretName](#spec_sso_items_secretName )                               | The name of the secret to store the client secret                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| - [secretTemplate](#spec_sso_items_secretTemplate )                       | Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace<br />The labels to apply to the policy<br />Deprecated: use selector<br />Deprecated: use remoteSelector<br />The remote pod selector labels to allow traffic to/from<br />Specifies attributes for the client.<br />Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection<br />A template for the generated secret |
| - [standardFlowEnabled](#spec_sso_items_standardFlowEnabled )             | Enables the standard OpenID Connect redirect based authentication with authorization code.                                                                                                                                                                                                                                                                                                                                                                                                  |
| - [webOrigins](#spec_sso_items_webOrigins )                               | Allowed CORS origins. To permit all origins of Valid Redirect URIs, add '+'. This does<br />not include the '*' wildcard though. To permit all origins, explicitly add '*'.                                                                                                                                                                                                                                                                                                                 |

##### Property `alwaysDisplayInConsole`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Always list this client in the Account UI, even if the user does not have an active
session.

##### Property `attributes`

|                           |                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                            |
| **Required**              | No                                                                                                                                  |
| **Additional properties** | [[Should-conform]](#spec_sso_items_attributes_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                               | Title/Description |
| ------------------------------------------------------ | ----------------- |
| - [](#spec_sso_items_attributes_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### Property `clientAuthenticatorType`

|                |                                       |
| -------------- | ------------------------------------- |
| **Type**       | `enum (of string)`                    |
| **Required**   | No                                    |
| **Defined in** | #/definitions/ClientAuthenticatorType |

**Description:** The client authenticator type

Must be one of:
* "client-secret"
* "client-jwt"

##### Property `clientId`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The client identifier registered with the identity provider.

##### Property `defaultClientScopes`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** Default client scopes

| Each item of this array must be                                        | Description |
| ---------------------------------------------------------------------- | ----------- |
| [defaultClientScopes items](#spec_sso_items_defaultClientScopes_items) | -           |

###### defaultClientScopes items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### Property `description`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** A description for the client, can be a URL to an image to replace the login logo

##### Property `enableAuthserviceSelector`

|                           |                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                           |
| **Required**              | No                                                                                                                                                 |
| **Additional properties** | [[Should-conform]](#spec_sso_items_enableAuthserviceSelector_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                              | Title/Description |
| --------------------------------------------------------------------- | ----------------- |
| - [](#spec_sso_items_enableAuthserviceSelector_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### Property `enabled`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Whether the SSO client is enabled

##### Property `groups`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Groups                                                      |

**Description:** The client sso group type

| Property                                 | Title/Description                          |
| ---------------------------------------- | ------------------------------------------ |
| - [anyOf](#spec_sso_items_groups_anyOf ) | List of groups allowed to access to client |

###### Property `anyOf`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** List of groups allowed to access to client

| Each item of this array must be                   | Description |
| ------------------------------------------------- | ----------- |
| [anyOf items](#spec_sso_items_groups_anyOf_items) | -           |

###### anyOf items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### Property `name`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** Specifies display name of the client

##### Property `protocol`

|                |                        |
| -------------- | ---------------------- |
| **Type**       | `enum (of string)`     |
| **Required**   | No                     |
| **Defined in** | #/definitions/Protocol |

**Description:** Specifies the protocol of the client, either 'openid-connect' or 'saml'

Must be one of:
* "openid-connect"
* "saml"

##### Property `publicClient`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Defines whether the client requires a client secret for authentication

##### Property `redirectUris`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** Valid URI pattern a browser can redirect to after a successful login. Simple wildcards
are allowed such as 'https://unicorns.uds.dev/*'

| Each item of this array must be                          | Description |
| -------------------------------------------------------- | ----------- |
| [redirectUris items](#spec_sso_items_redirectUris_items) | -           |

###### redirectUris items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### Property `rootUrl`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Root URL appended to relative URLs

##### Property `secret`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The client secret. Typically left blank and auto-generated.

##### Property `secretName`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The name of the secret to store the client secret

##### Property `secretTemplate`

|                           |                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                                                                                |
| **Required**              | No                                                                                                                                      |
| **Additional properties** | [[Should-conform]](#spec_sso_items_secretTemplate_additionalProperties "Each additional property must conform to the following schema") |

**Description:** Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace
The labels to apply to the policy
Deprecated: use selector
Deprecated: use remoteSelector
The remote pod selector labels to allow traffic to/from
Specifies attributes for the client.
Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection
A template for the generated secret

| Property                                                   | Title/Description |
| ---------------------------------------------------------- | ----------------- |
| - [](#spec_sso_items_secretTemplate_additionalProperties ) | -                 |

###### Property `additionalProperties`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### Property `standardFlowEnabled`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Enables the standard OpenID Connect redirect based authentication with authorization code.

##### Property `webOrigins`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** Allowed CORS origins. To permit all origins of Valid Redirect URIs, add '+'. This does
not include the '*' wildcard though. To permit all origins, explicitly add '*'.

| Each item of this array must be                      | Description |
| ---------------------------------------------------- | ----------- |
| [webOrigins items](#spec_sso_items_webOrigins_items) | -           |

###### webOrigins items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

## Property `status`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Status                                                      |

| Property                                            | Title/Description |
| --------------------------------------------------- | ----------------- |
| - [authserviceClients](#status_authserviceClients ) | -                 |
| - [endpoints](#status_endpoints )                   | -                 |
| - [monitors](#status_monitors )                     | -                 |
| - [networkPolicyCount](#status_networkPolicyCount ) | -                 |
| - [observedGeneration](#status_observedGeneration ) | -                 |
| - [phase](#status_phase )                           | -                 |
| - [retryAttempt](#status_retryAttempt )             | -                 |
| - [ssoClients](#status_ssoClients )                 | -                 |

### Property `authserviceClients`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

| Each item of this array must be                              | Description |
| ------------------------------------------------------------ | ----------- |
| [authserviceClients items](#status_authserviceClients_items) | -           |

#### authserviceClients items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

### Property `endpoints`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

| Each item of this array must be            | Description |
| ------------------------------------------ | ----------- |
| [endpoints items](#status_endpoints_items) | -           |

#### endpoints items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

### Property `monitors`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

| Each item of this array must be          | Description |
| ---------------------------------------- | ----------- |
| [monitors items](#status_monitors_items) | -           |

#### monitors items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

### Property `networkPolicyCount`

|              |           |
| ------------ | --------- |
| **Type**     | `integer` |
| **Required** | No        |

### Property `observedGeneration`

|              |           |
| ------------ | --------- |
| **Type**     | `integer` |
| **Required** | No        |

### Property `phase`

|                |                     |
| -------------- | ------------------- |
| **Type**       | `enum (of string)`  |
| **Required**   | No                  |
| **Defined in** | #/definitions/Phase |

Must be one of:
* "Pending"
* "Ready"
* "Failed"
* "Retrying"

### Property `retryAttempt`

|              |           |
| ------------ | --------- |
| **Type**     | `integer` |
| **Required** | No        |

### Property `ssoClients`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

| Each item of this array must be              | Description |
| -------------------------------------------- | ----------- |
| [ssoClients items](#status_ssoClients_items) | -           |

#### ssoClients items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

----------------------------------------------------------------------------------------------------------------------------
