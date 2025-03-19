# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

output "kms_key_arn" {
  value = aws_kms_key.this.arn
}

output "kms_key_alias" {
  value = aws_kms_alias.default.name
}