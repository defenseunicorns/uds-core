default_user = "ec2-user"
ssh_key_name = "packer-rke2-rhel-key"
os_distro    = "rhel"
# Need to allow in from internet for github runner to connect to node
allowed_in_cidrs = ["0.0.0.0/0"]

ami_id       = "ami-0699e51c9b070e3d5"
rke2_version = "1.30"