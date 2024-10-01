data "aws_vpc" "vpc" {
  filter {
    name   = "tag:Name"
    values = [var.vpc_name]
  }
}

data "aws_subnet" "rke2_ci_subnet" {
  vpc_id            = data.aws_vpc.vpc.id
  availability_zone = "${var.region}c"

  filter {
    name   = "tag:Name"
    values = [var.subnet_name]
  }
}