# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variable "name" {
  type = string
}

variable "token" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "attach_deny_insecure_transport_policy" {
  type    = bool
  default = true
}

variable "create_acl" {
  type    = bool
  default = true
}