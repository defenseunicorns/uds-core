resource "aws_s3_bucket" "this" {
  bucket_prefix       = var.bucket_prefix
  force_destroy       = true
  object_lock_enabled = false
  tags                = var.tags

}

resource "aws_s3_bucket_server_side_encryption_configuration" "bucket_encryption" {
  bucket = aws_s3_bucket.this.bucket
  rule {
    bucket_key_enabled = false
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_versioning" "versioning" {
  bucket = aws_s3_bucket.this.bucket
  versioning_configuration {
    status = "Enabled"
    #status = "Disabled"
  }
}

resource "aws_s3_bucket_policy" "bucket_policy" {
  count  = var.create_irsa ? 1 : 0
  bucket = aws_s3_bucket.this.bucket

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject"
        ]
        Effect = "Allow"
        Principal = {
          AWS = "${var.irsa_role_arn}"
        }
        Resource = [
          aws_s3_bucket.this.arn,
          "${aws_s3_bucket.this.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_s3_bucket_public_access_block" "this" {
  block_public_acls       = true
  block_public_policy     = true
  bucket                  = aws_s3_bucket.this.bucket
  ignore_public_acls      = true
  restrict_public_buckets = true
}