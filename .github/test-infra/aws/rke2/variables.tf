
variable "environment" {
  description = "Environment/account that this is deployed to"
  default     = "ci"
}
variable "vpc_name" {
  type        = string
  description = "VPC ID to deploy into"
  default     = "uds-ci-commercial-*"
}

variable "subnet_name" {
  type        = string
  description = "Name of subnet tobrew install libtool use for testing. Can use a wildcard as long as it only matches one subnet per az."
  default     = "uds-ci-commercial-*-public*"
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

variable "ami_id" {
  type        = string
  description = "AMI to use for deployment, must have RKE2 pre-installed"
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