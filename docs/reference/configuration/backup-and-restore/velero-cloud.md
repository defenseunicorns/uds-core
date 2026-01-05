---
title: Velero Cloud Provider Snapshot Support
sidebar:
  order: 5
---

This document describes how to enable volume snapshot support in Velero for cloud-provider-specific infrastructure in `uds-core`. This allows backup and restoration of persistent volumes via native snapshot mechanisms provided by each cloud provider.

Velero can create snapshots of Persistent Volumes using the underlying cloud provider's native storage features:

## AWS (EBS) Snapshot Support

### Enable Snapshots in UDS-Core

To enable snapshotting of EBS volumes by Velero, add the following Helm overrides to your UDS bundle:

```yaml
velero:
  velero:
    values:
      - path: snapshotsEnabled
        value: true
      - path: schedules.udsbackup.template.snapshotVolumes
        value: true
```

These values ensure that volume snapshots are included in the default `udsbackup` schedule.

### IAM Permissions for EBS Snapshotting

The Velero service account must have an IRSA role with the necessary permissions to manage EBS snapshots. Add the following IAM policy statements to your Velero IRSA role definition:

```hcl
# Example IAM policy for Velero AWS plugin
# velero aws plugin policy scope from here: https://github.com/vmware-tanzu/velero-plugin-for-aws?tab=readme-ov-file#set-permissions-for-velero
# ref policy for scoping based on tags: https://cloudonaut.io/restricting-access-to-ec2-instances-based-on-tags/
data "aws_iam_policy_document" "velero_policy" {
  statement {
    effect = "Allow"
    actions = [
      "kms:ReEncryptFrom",
      "kms:ReEncryptTo"
    ]
    # Replace <YOUR_EBS_KMS_KEY_ARN> with the ARN of your EBS volume encryption KMS key
    resources = ["<YOUR_EBS_KMS_KEY_ARN>"]
  }

  statement {
    effect    = "Allow"
    actions   = ["ec2:DescribeVolumes", "ec2:DescribeSnapshots"]
    resources = ["*"]
  }

  # Replace <YOUR_CLUSTER_NAME> in statements below with your EKS cluster name
  statement {
    effect    = "Allow"
    actions   = ["ec2:CreateVolume"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/kubernetes.io/cluster/<YOUR_CLUSTER_NAME>"
      values   = ["owned"]
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["ec2:CreateSnapshot"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/kubernetes.io/cluster/<YOUR_CLUSTER_NAME>"
      values   = ["owned"]
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["ec2:CreateSnapshot"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/kubernetes.io/cluster/<YOUR_CLUSTER_NAME>"
      values   = ["owned"]
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["ec2:DeleteSnapshot"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/kubernetes.io/cluster/<YOUR_CLUSTER_NAME>"
      values   = ["owned"]
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["ec2:CreateTags"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/kubernetes.io/cluster/<YOUR_CLUSTER_NAME>"
      values   = ["owned"]
    }
    condition {
      test     = "StringEqualsIfExists"
      variable = "ec2:ResourceTag/kubernetes.io/cluster/<YOUR_CLUSTER_NAME>"
      values   = ["owned"]
    }
  }
}
```

This policy restricts actions to volumes and snapshots tagged by the EBS CSI driver, following AWS best practices.

## Future Expansion

This document is structured to support multiple cloud providers. Planned additions:

* [ ] Azure Disk snapshot support
* [ ] GCP PD snapshot support
* [ ] Generic backup configurations
