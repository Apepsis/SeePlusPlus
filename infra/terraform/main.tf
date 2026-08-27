locals { name = "seeplusplus-${var.environment}" }

resource "random_password" "database" { length = 32, special = true, override_special = "!#$%&*+-=?" }

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.15.0"
  name = local.name
  cidr = "10.42.0.0/16"
  azs = ["${var.aws_region}a", "${var.aws_region}b"]
  private_subnets = ["10.42.1.0/24", "10.42.2.0/24"]
  public_subnets = ["10.42.101.0/24", "10.42.102.0/24"]
  enable_nat_gateway = true
  single_nat_gateway = var.environment != "prod"
}

resource "aws_s3_bucket" "traces" { bucket_prefix = "${local.name}-traces-"; force_destroy = var.environment != "prod" }
resource "aws_s3_bucket_versioning" "traces" { bucket = aws_s3_bucket.traces.id; versioning_configuration { status = "Enabled" } }
resource "aws_s3_bucket_server_side_encryption_configuration" "traces" { bucket = aws_s3_bucket.traces.id; rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } } }
resource "aws_s3_bucket_public_access_block" "traces" { bucket = aws_s3_bucket.traces.id; block_public_acls = true; block_public_policy = true; ignore_public_acls = true; restrict_public_buckets = true }
resource "aws_s3_bucket_lifecycle_configuration" "traces" { bucket = aws_s3_bucket.traces.id; rule { id = "expire-cache"; status = "Enabled"; expiration { days = var.environment == "prod" ? 90 : 14 } } }

resource "aws_ecr_repository" "images" { for_each = toset(["api", "web", "runner"]); name = "${local.name}-${each.key}"; image_scanning_configuration { scan_on_push = true }; encryption_configuration { encryption_type = "AES256" } }

resource "aws_db_subnet_group" "database" { name = local.name; subnet_ids = module.vpc.private_subnets }
resource "aws_security_group" "database" { name = "${local.name}-db"; vpc_id = module.vpc.vpc_id; egress { from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] } }
resource "aws_db_instance" "database" {
  identifier = local.name
  engine = "postgres"
  engine_version = "16.4"
  instance_class = var.environment == "prod" ? "db.t4g.small" : "db.t4g.micro"
  allocated_storage = 20
  max_allocated_storage = 100
  db_name = var.database_name
  username = var.database_username
  password = random_password.database.result
  db_subnet_group_name = aws_db_subnet_group.database.name
  vpc_security_group_ids = [aws_security_group.database.id]
  storage_encrypted = true
  backup_retention_period = var.environment == "prod" ? 7 : 1
  deletion_protection = var.environment == "prod"
  skip_final_snapshot = var.environment != "prod"
  publicly_accessible = false
}

resource "aws_ecs_cluster" "application" { name = local.name; setting { name = "containerInsights"; value = "enabled" } }
resource "aws_cloudwatch_log_group" "application" { for_each = toset(["api", "web", "runner"]); name = "/seeplusplus/${var.environment}/${each.key}"; retention_in_days = var.environment == "prod" ? 30 : 7 }

data "aws_iam_policy_document" "lambda_assume" { statement { actions = ["sts:AssumeRole"]; principals { type = "Service"; identifiers = ["lambda.amazonaws.com"] } } }
resource "aws_iam_role" "runner" { name = "${local.name}-runner"; assume_role_policy = data.aws_iam_policy_document.lambda_assume.json }
resource "aws_iam_role_policy_attachment" "runner_logs" { role = aws_iam_role.runner.name; policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" }
resource "aws_iam_role_policy" "runner_trace_prefix" {
  name = "trace-prefix-write"
  role = aws_iam_role.runner.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["s3:PutObject"], Resource = "${aws_s3_bucket.traces.arn}/runner/*" }] })
}

resource "aws_lambda_function" "runner" {
  count = var.runner_image_uri == "" ? 0 : 1
  function_name = "${local.name}-runner"
  role = aws_iam_role.runner.arn
  package_type = "Image"
  image_uri = var.runner_image_uri
  timeout = 30
  memory_size = 1024
  reserved_concurrent_executions = var.environment == "prod" ? 25 : 3
  environment { variables = { RUNNER_MAX_STEPS = "1000", RUNNER_MAX_OUTPUT_BYTES = "65536", TRACE_BUCKET = aws_s3_bucket.traces.id, TRACE_PREFIX = "runner/" } }
}
