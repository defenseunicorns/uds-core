# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# setting up irsa for the rke2 cluster
# Keypair for signing, added as secrets in AWS Secrets Manager
resource "tls_private_key" "keypair" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "aws_secretsmanager_secret" "public_key" {
  name                    = "${var.environment}-${random_string.ssm.result}-oidc-public-key"
  description             = "Public Key for OIDC/IRSA for ${var.environment}"
  recovery_window_in_days = var.recovery_window
}

resource "aws_secretsmanager_secret_version" "public_key" {
  depends_on    = [aws_secretsmanager_secret.public_key]
  secret_id     = aws_secretsmanager_secret.public_key.name
  secret_string = tls_private_key.keypair.public_key_pem
}

resource "aws_secretsmanager_secret" "private_key" {
  name                    = "${var.environment}-${random_string.ssm.result}-oidc-private-key"
  description             = "Private Key for OIDC/IRSA for ${var.environment}"
  recovery_window_in_days = var.recovery_window
}

resource "aws_secretsmanager_secret_version" "private_key" {
  depends_on    = [aws_secretsmanager_secret.private_key]
  secret_id     = aws_secretsmanager_secret.private_key.name
  secret_string = tls_private_key.keypair.private_key_pem
}


# Public bucket to host OIDC files
module "oidc_bucket" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "5.10.0"

  bucket        = "${var.environment}-oidc-${random_string.ssm.result}"
  force_destroy = var.force_destroy

  # Allow our objects to be public
  control_object_ownership = true
  object_ownership         = "BucketOwnerPreferred"
  block_public_acls        = false
  block_public_policy      = false
  ignore_public_acls       = false
  restrict_public_buckets  = false
}

# OIDC file creation
resource "local_file" "oidc_config" {
  content  = <<EOF
{
  "issuer": "https://${module.oidc_bucket.s3_bucket_bucket_regional_domain_name}",
  "jwks_uri": "https://${module.oidc_bucket.s3_bucket_bucket_regional_domain_name}/keys.json",
  "authorization_endpoint": "urn:kubernetes:programmatic_authorization",
  "response_types_supported": [
    "id_token"
  ],
  "subject_types_supported": [
    "public"
  ],
  "id_token_signing_alg_values_supported": [
    "RS256"
  ],
  "claims_supported": [
    "sub",
    "iss"
  ]
}
EOF
  filename = "${path.module}/discovery.json"
}

data "external" "key_id" {
  program = ["bash", "${path.module}/scripts/key_id.sh", tls_private_key.keypair.public_key_pem]
}

data "external" "key_modulus" {
  program = ["bash", "${path.module}/scripts/key_modulus.sh", tls_private_key.keypair.public_key_pem]
}

resource "local_file" "keys_file" {
  content  = <<EOF
{
  "keys": [
    {
      "use": "sig",
      "kty": "RSA",
      "kid": "${data.external.key_id.result.key_id}",
      "alg": "RS256",
      "n": "${data.external.key_modulus.result.modulus}",
      "e": "AQAB"
    }
  ]
}
EOF
  filename = "${path.module}/keys.json"
}


resource "aws_s3_object" "oidc_config" {
  depends_on = [local_file.oidc_config, module.oidc_bucket]
  bucket     = module.oidc_bucket.s3_bucket_id
  key        = ".well-known/openid-configuration"
  source     = "${path.module}/discovery.json"
  acl        = "public-read"
}

resource "aws_s3_object" "keys_file" {
  depends_on = [local_file.keys_file, module.oidc_bucket]
  bucket     = module.oidc_bucket.s3_bucket_id
  key        = "keys.json"
  source     = "${path.module}/keys.json"
  acl        = "public-read"
}

# AWS IAM OIDC Provider
data "tls_certificate" "irsa" {
  depends_on = [aws_s3_object.oidc_config, aws_s3_object.keys_file]
  url        = "https://${module.oidc_bucket.s3_bucket_bucket_regional_domain_name}/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "irsa" {
  url             = "https://${module.oidc_bucket.s3_bucket_bucket_regional_domain_name}"
  thumbprint_list = [data.tls_certificate.irsa.certificates[0].sha1_fingerprint]
  client_id_list  = var.client_id_list
}


# Cluster join token
resource "random_password" "token" {
  length  = 40
  special = false
}

module "statestore" {
  source = "./modules/statestore"
  name   = local.cluster_name
  token  = random_password.token.result
  tags   = local.tags
}
