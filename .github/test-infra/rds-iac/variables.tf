variable "region" {
  description = "AWS region"
  type        = string
}

variable "name" {
  description = "Name for cluster"
  type        = string
}

variable "recovery_window" {
  description = "Number of days to retain secret before permanent deletion"
  type        = number
  default     = 30
}

variable "environment" {
  description = "Deployment environment (e.g. 'prod' or 'staging' or 'dev')"
  type        = string
  default     = "dev"
}

variable "resource_prefix" {
  description = "Prefix for resources created"
  type        = string
}

variable "db_name" {
  description = "The name to give the database"
  type        = string
  default     = "grafana"
}

variable "username" {
  description = "The username to use to login to the DB"
  type        = string
  default     = "grafana"
}

variable "db_engine_version" {
  description = "The Postgres engine version to use for the DB"
  type        = string
  default     = "15.7"
}

variable "subnet_ids" {
  description = "List of subnets for the RDS instance"
  type        = list(string)
}

variable "vpc_id" {
  description = "The VPC ID where the RDS instance will be deployed"
  type        = string
}

variable "db_allocated_storage" {
  description = "Storage allocated to RDS instance"
  type        = number
  default     = 20
}

variable "db_storage_type" {
  description = "The type of storage (e.g., gp2, io1)"
  type        = string
  default     = "gp2"
}

variable "db_instance_class" {
  description = "The class of RDS instance (e.g., db.t4g.large)"
  type        = string
  default     = "db.t4g.large"
}

variable "db_security_group_ids" {
  description = "The list of security group IDs to assign to the RDS instance"
  type        = list(string)
  default     = []
}
