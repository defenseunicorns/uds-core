# Schema Docs

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Exemption                                                   |

| Property         | Title/Description |
| ---------------- | ----------------- |
| - [spec](#spec ) | -                 |

## Property `spec`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Spec                                                        |

| Property                          | Title/Description |
| --------------------------------- | ----------------- |
| + [exemptions](#spec_exemptions ) | Policy exemptions |

### Property `exemptions`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | Yes     |

**Description:** Policy exemptions

| Each item of this array must be            | Description |
| ------------------------------------------ | ----------- |
| [ExemptionElement](#spec_exemptions_items) | -           |

#### ExemptionElement

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | No                                                                        |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/ExemptionElement                                            |

| Property                                             | Title/Description                                  |
| ---------------------------------------------------- | -------------------------------------------------- |
| - [description](#spec_exemptions_items_description ) | Reasons as to why this exemption is needed         |
| + [matcher](#spec_exemptions_items_matcher )         | Resource to exempt (Regex allowed for name)        |
| + [policies](#spec_exemptions_items_policies )       | A list of policies to override                     |
| - [title](#spec_exemptions_items_title )             | title to give the exemption for reporting purposes |

##### Property `description`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Reasons as to why this exemption is needed

##### Property `matcher`

|                           |                                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| **Type**                  | `object`                                                                  |
| **Required**              | Yes                                                                       |
| **Additional properties** | [[Any type: allowed]](# "Additional Properties of any type are allowed.") |
| **Defined in**            | #/definitions/Matcher                                                     |

**Description:** Resource to exempt (Regex allowed for name)

| Property                                                 | Title/Description |
| -------------------------------------------------------- | ----------------- |
| - [kind](#spec_exemptions_items_matcher_kind )           | -                 |
| + [name](#spec_exemptions_items_matcher_name )           | -                 |
| + [namespace](#spec_exemptions_items_matcher_namespace ) | -                 |

###### Property `kind`

|                |                    |
| -------------- | ------------------ |
| **Type**       | `enum (of string)` |
| **Required**   | No                 |
| **Defined in** | #/definitions/Kind |

Must be one of:
* "pod"
* "service"

###### Property `name`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

###### Property `namespace`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

##### Property `policies`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | Yes     |

**Description:** A list of policies to override

| Each item of this array must be                 | Description |
| ----------------------------------------------- | ----------- |
| [Policy](#spec_exemptions_items_policies_items) | -           |

###### Policy

|                |                      |
| -------------- | -------------------- |
| **Type**       | `enum (of string)`   |
| **Required**   | No                   |
| **Defined in** | #/definitions/Policy |

Must be one of:
* "DisallowHostNamespaces"
* "DisallowNodePortServices"
* "DisallowPrivileged"
* "DisallowSELinuxOptions"
* "DropAllCapabilities"
* "RequireNonRootUser"
* "RestrictCapabilities"
* "RestrictExternalNames"
* "RestrictHostPathWrite"
* "RestrictHostPorts"
* "RestrictProcMount"
* "RestrictSeccomp"
* "RestrictSELinuxType"
* "RestrictVolumeTypes"

##### Property `title`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** title to give the exemption for reporting purposes

----------------------------------------------------------------------------------------------------------------------------
