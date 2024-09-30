output "bucket" {
  value = aws_s3_object.token.bucket
}

output "token_object" {
  value = aws_s3_object.token.id
}

output "kubeconfig_put_policy" {
  value = data.aws_iam_policy_document.setter.json
}

output "token" {
  value = {
    bucket          = aws_s3_object.token.bucket
    object          = aws_s3_object.token.id
    policy_document = data.aws_iam_policy_document.getter.json
    bucket_arn      = aws_s3_bucket.bucket.arn
  }
}