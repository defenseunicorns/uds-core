terraform {
  required_version = ">= 1.8.0"
  backend "s3" {
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}