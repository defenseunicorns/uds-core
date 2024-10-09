terraform {
  backend "s3" {
  }
  required_providers {
    aws = {
      version = "~> 5.70.0"
    }
    random = {
      version = "~> 3.6.0"
    }
    tls = {
      version = "~> 4.0.0"
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