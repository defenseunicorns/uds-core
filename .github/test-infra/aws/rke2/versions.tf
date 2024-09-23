terraform {
  backend "local" {
  }
  required_providers {
    aws = {
      version = "~> 5.67.0"
    }
    random = {
      version = "~> 3.6.0"
    }
    tls = {
      version = "~> 4.0.0"
    }
  }
  required_version = "~> 1.8.0"
}