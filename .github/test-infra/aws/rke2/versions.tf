# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

terraform {
  backend "s3" {
  }
  required_providers {
    aws = {
      version = "~> 5.98.0"
    }
    random = {
      version = "~> 3.7.0"
    }
    tls = {
      version = "~> 4.1.0"
    }
  }
  required_version = ">= 1.8.0"
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      PermissionsBoundary = var.permissions_boundary_name
    }
  }
}