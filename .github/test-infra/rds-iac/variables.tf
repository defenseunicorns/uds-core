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

variable "db_name" {
  description = "The name to give the database"
  type        = string
  default     = "grafana"
}

variable "db_port" {
  description = "The database port"
  type        = number
  default     = 5432
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
