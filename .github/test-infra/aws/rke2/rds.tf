# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

resource "random_password" "db_passwords" {
  for_each = var.databases

  length  = 16
  special = true
  upper = true
  lower = true
  override_special = "#$"
}

resource "aws_secretsmanager_secret" "db_secrets" {
  for_each = var.databases

  name                    = "${each.value.name}-db-secret-${random_id.unique_id.hex}"
  description             = "DB authentication token for ${each.value.name}"
  recovery_window_in_days = var.recovery_window
}

resource "aws_secretsmanager_secret_version" "db_secret_values" {
  for_each = var.databases

  depends_on    = [aws_secretsmanager_secret.db_secrets]
  secret_id     = aws_secretsmanager_secret.db_secrets[each.key].id
  secret_string = random_password.db_passwords[each.key].result
}

module "dbs" {
  source  = "terraform-aws-modules/rds/aws"
  version = "7.1.0"

  for_each = var.databases

  identifier                     = "${var.name}-${each.value.name}-db"
  instance_use_identifier_prefix = true

  allocated_storage       = each.value.allocated_storage
  backup_retention_period = 1
  backup_window           = "03:00-06:00"
  maintenance_window      = "Mon:00:00-Mon:03:00"
  skip_final_snapshot     = true

  engine               = "postgres"
  engine_version       = each.value.engine_version
  major_engine_version = split(".", each.value.engine_version)[0]
  family               = each.value.family
  instance_class       = each.value.instance_class

  db_name  = each.value.name
  username = each.value.username
  port     = each.value.port

  subnet_ids                  = data.aws_subnets.rds_subnets.ids
  create_db_subnet_group      = true
  create_db_parameter_group   = false
  manage_master_user_password = false
  password_wo                 = random_password.db_passwords[each.key].result
  password_wo_version         = 1

  vpc_security_group_ids = [aws_security_group.rds_sg.id]

  depends_on = [
    aws_security_group.rds_sg
  ]
}

resource "aws_security_group" "rds_sg" {
  vpc_id = data.aws_vpc.vpc.id

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_ingress" {
  security_group_id = aws_security_group.rds_sg.id

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "tcp"
  from_port   = 0
  to_port     = 5432
}
