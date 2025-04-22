# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      PermissionsBoundary = var.permissions_boundary_name
    }
  }
}
terraform {
  required_version = ">= 1.8.0"
  backend "s3" {
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }

    random = {
      source  = "hashicorp/random"
      version = "3.7.2"
    }
  }
}