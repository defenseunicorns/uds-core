provider "aws" {
  region = var.region

  default_tags {
    tags = {
      PermissionsBoundary = var.permissions_boundary_name
    }
  }
}

terraform {
  required_version = "1.5.7"
  backend "s3" {
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 4.0, != 5.17.0"
    }

    random = {
      source  = "hashicorp/random"
      version = "3.5.1"
    }
  }
}

resource "random_id" "default" {
  byte_length = 2
}

data "aws_eks_cluster" "existing" {
  name = var.name
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

data "aws_region" "current" {}

locals {
  oidc_url_without_protocol = substr(data.aws_eks_cluster.existing.identity[0].oidc[0].issuer, 8, -1)
  oidc_arn                  = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${local.oidc_url_without_protocol}"

  generate_kms_key              = var.create_kms_key ? 1 : 0
  kms_key_arn                   = var.kms_key_arn == null ? module.generate_kms[0].kms_key_arn : var.kms_key_arn
  iam_role_permissions_boundary = var.use_permissions_boundary ? "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/${var.permissions_boundary_name}" : null
}

resource "random_id" "unique_id" {
  byte_length = 4
}
