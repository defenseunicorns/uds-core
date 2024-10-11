# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
default_user = "ec2-user"
ssh_key_name = "packer-rke2-rhel-key"
os_distro    = "rhel"
# Need to allow in from internet for github runner to connect to node
allowed_in_cidrs = ["0.0.0.0/0"]

rke2_version = "1.30"