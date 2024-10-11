# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

output "s3_buckets" {
  value = { for k, v in module.s3 : k => v }
}

output "irsa" {
  value = { for k, v in module.irsa : k => v }
}
