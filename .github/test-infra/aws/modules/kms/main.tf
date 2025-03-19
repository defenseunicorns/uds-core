resource "aws_kms_alias" "default" {
  name_prefix   = "alias/${var.kms_key_alias_name_prefix}"
  target_key_id = aws_kms_key.this.key_id
}

resource "aws_kms_key" "this" {
  bypass_policy_lockout_safety_check = false
  customer_master_key_spec           = "SYMMETRIC_DEFAULT"
  deletion_window_in_days            = 7
  description                        = var.kms_key_description
  enable_key_rotation                = true
  is_enabled                         = true
  key_usage                          = "ENCRYPT_DECRYPT"
  multi_region                       = true
  policy = jsonencode(
    {
      Statement = [
        {
          Action = "kms:*"
          Effect = "Allow"
          Principal = {
            AWS = compact(concat(["arn:${var.current_partition}:iam::${var.account_id}:root"], var.kms_key_policy_default_identities))
          }
          Resource = "*"
          Sid      = "KMS Key Default"
        },
        {
          Action = [
            "kms:ReEncrypt*",
            "kms:GenerateDataKey*",
            "kms:Encrypt*",
            "kms:Describe*",
            "kms:Decrypt*",
          ]
          Effect = "Allow"
          Principal = {
            Service = "logs.us-gov-west-1.amazonaws.com"
          }
          Resource = "*"
          Sid      = "CloudWatchLogsEncryption"
        },
        {
          Action = [
            "kms:ReEncrypt*",
            "kms:GenerateDataKey*",
            "kms:Encrypt*",
            "kms:Describe*",
            "kms:Decrypt*",
          ]
          Effect = "Allow"
          Principal = {
            Service = "cloudtrail.amazonaws.com"
          }
          Resource = "*"
          Sid      = "Cloudtrail KMS permissions"
        },
      ]
      Version = "2012-10-17"
    }
  )
  tags = var.tags
}