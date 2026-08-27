# AWS foundation blueprint

This Terraform creates the private network, encrypted trace bucket, ECR
repositories, RDS Postgres, ECS cluster, log groups and a least-privilege Lambda
runner role/function. It intentionally does not invent production DNS, OIDC
deployment-role IDs or application image URIs.

Use an immutable digest for `runner_image_uri`. Add ALB/ECS task definitions only
after the account's certificate, domain, subnet cost policy and deployment roles
are known. Run `terraform plan` in an isolated test account first.

The Lambda design must repeat the hostile-code suite. If the platform cannot
prevent the user subprocess from observing Lambda credentials or metadata,
replace it with Firecracker-backed jobs or locked-down ECS tasks.
