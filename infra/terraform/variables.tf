variable "aws_region" { type = string, default = "us-east-1" }
variable "environment" { type = string, default = "test" }
variable "database_name" { type = string, default = "seeplusplus" }
variable "database_username" { type = string, default = "seeplusplus" }
variable "runner_image_uri" { type = string, default = "", description = "Immutable ECR runner URI with digest; empty skips Lambda creation." }
variable "allowed_origin" { type = string, default = "https://apepsis.github.io" }
