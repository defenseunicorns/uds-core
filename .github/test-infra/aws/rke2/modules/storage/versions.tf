# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

terraform {
  required_providers {
    aws = {
      version = ">= 5.52.0"
    }
    random = {
      version = "~> 3.8.0"
    }
  }

  required_version = ">= 1.8.0"
}
