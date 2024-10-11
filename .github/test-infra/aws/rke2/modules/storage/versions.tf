terraform {
  required_providers {
    aws = {
      version = ">= 5.52.0"
    }
    random = {
      version = "~> 3.6.2"
    }
  }

  required_version = ">= 1.8.0"
}
