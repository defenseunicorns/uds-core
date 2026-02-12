default_user = "ec2-user"
ssh_key_name = "packer-rke2-rhel-key"
os_distro    = "rhel"
# Need to allow in from internet for github runner to connect to node
allowed_in_cidrs = ["0.0.0.0/0"]

rke2_version = "1.34"
