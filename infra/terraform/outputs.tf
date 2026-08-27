output "trace_bucket" { value = aws_s3_bucket.traces.id }
output "ecr_repositories" { value = { for key, repository in aws_ecr_repository.images : key => repository.repository_url } }
output "database_endpoint" { value = aws_db_instance.database.address }
output "runner_function_name" { value = try(aws_lambda_function.runner[0].function_name, null) }
