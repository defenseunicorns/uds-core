# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variable "environment" {
  description = "Environment/account that this is deployed to"
  default     = "ci"
}

variable "name" {
  description = "Name for cluster"
  type        = string
}

variable "vpc_name" {
  type        = string
  description = "VPC ID to deploy into"
  default     = "uds-vpc"
}

variable "subnet_name" {
  type        = string
  description = "Name of subnet to use for testing. Can use a wildcard as long as it only matches one subnet per az."
  default     = "uds-vpc-public*"
}

variable "region" {
  type        = string
  description = "Region to use for deployment"
}

variable "agent_instance_type" {
  type        = string
  description = "Instance type to use for agent nodes. Defaults to c5.xlarge to match RKE2 recommended specs."
  default     = "m5.2xlarge"
}

variable "control_plane_instance_type" {
  type        = string
  description = "Instance type to use for control plane nodes. Defaults to c5.xlarge to match RKE2 recommended specs."
  default     = "m5.2xlarge"
}

variable "control_plane_node_count" {
  type        = number
  description = "How many control plane nodes to spin up. Total control plane nodes will be n+1 due to bootstrap node. For HA, there should be an odd number of control plane nodes."
  default     = 2
}

variable "agent_node_count" {
  type        = number
  description = "How many agent nodes to spin up"
  default     = 1
}

variable "allowed_in_cidrs" {
  type        = list(string)
  description = "Optional list of CIDRs that can connect to the cluster in addition to CIDR of VPC cluster is deployed to"
  default     = []
}

variable "cluster_hostname" {
  type        = string
  description = "Hostname to use for connecting to cluster API. cluster.foo.bar default used by CI tests"
  default     = "cluster.foo.bar"
}

variable "os_distro" {
  type        = string
  description = "OS distribution used to distinguish test infra based on which test created it"
}

variable "rke2_version" {
  type        = string
  description = "RKE2 version used to distinguish test infra based on which test created it"
}

variable "default_user" {
  type        = string
  description = "Default user of AMI"
}

variable "ssh_key_name" {
  type        = string
  description = "What to name generated SSH key pair in AWS"
}

variable "use_permissions_boundary" {
  description = "Whether to use IAM permissions boundary for resources."
  type        = bool
}

variable "permissions_boundary_name" {
  description = "The name of the permissions boundary for IAM resources.  This will be used for tagging and to build out the ARN."
}

variable "databases" {
  description = "Map of database configurations"
  type = map(object({
    name              = string
    port              = number
    username          = string
    engine_version    = string
    family            = string
    allocated_storage = number
    instance_class    = string
  }))
  default = {
    grafana = {
      name              = "grafana"
      port              = 5432
      username          = "grafana"
      engine_version    = "16.8"
      family            = "postgres16"
      allocated_storage = 20
      instance_class    = "db.t4g.large"
    },
    keycloak = {
      name              = "keycloak"
      port              = 5432
      username          = "keycloak"
      engine_version    = "16.8"
      family            = "postgres16"
      allocated_storage = 20
      instance_class    = "db.t4g.large"
    }
  }
}

variable "recovery_window" {
  default = 7
  type    = number
}

variable "force_destroy" {
  type    = bool
  default = true
}

variable "client_id_list" {
  description = "Comma separated list of client IDs (audiences) for the provider"
  type        = list(string)
  default     = ["irsa"]
}

variable "run_id" {
  description = "Github Actions Run ID. Used to tag AWS resources that are created by this workspace."
}

variable "uds_images_aws_account_id" {
  description = "The AWS Account ID for uds-images that the RKE2 amis are published to"
  type        = string
}
