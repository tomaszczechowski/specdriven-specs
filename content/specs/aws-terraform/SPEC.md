---
name: aws-terraform
description: "AWS infrastructure blueprint with VPC, ECS Fargate, RDS, and full CI/CD via Atlantis."
---

## What's included

A battle-tested AWS infrastructure blueprint covering networking, compute, data, and delivery. **VPC** provisions public and private subnets across three availability zones with NAT gateways, VPC flow logs shipped to CloudWatch, and a VPC endpoint for S3 to avoid NAT traffic costs. **ECS Fargate** runs containerised workloads with CPU/request-count auto-scaling and Application Load Balancer target groups. **RDS PostgreSQL 15** runs in Multi-AZ with automated daily backups (7-day retention), a read replica in a second AZ, and storage encrypted with a customer-managed KMS key. **ElastiCache Redis** (cluster mode disabled) provides session and response caching.

**Atlantis** manages Terraform plan and apply via pull request comments, enforcing the GitOps workflow — no `terraform apply` from local machines after initial bootstrap. State lives in **S3 with versioning enabled** and **DynamoDB locking** to prevent concurrent applies. A nightly **GitHub Actions** workflow runs `terraform plan` against each environment and posts a Slack alert on drift.

Security defaults throughout: security group rules reference resource IDs not CIDR ranges wherever possible; all ingress to the application tier flows through the ALB; no SSH ports open; no public IP assignment on Fargate tasks. **Checkov** runs in CI and blocks merges on HIGH and CRITICAL findings

## Architecture

**Modules are composable; environments are concrete.** `modules/` contains reusable building blocks with no environment-specific logic. `environments/` directories call those modules and supply variable values. A module never knows which environment is calling it.

```hcl
# environments/staging/main.tf
module "vpc" {
  source             = "../../modules/vpc"
  name               = "staging"
  cidr               = "10.1.0.0/16"
  azs                = ["us-east-1a", "us-east-1b", "us-east-1c"]
  private_subnets    = ["10.1.0.0/20", "10.1.16.0/20", "10.1.32.0/20"]
  public_subnets     = ["10.1.48.0/24", "10.1.49.0/24", "10.1.50.0/24"]
  enable_nat_gateway = true
  enable_flow_logs   = true
}

module "app" {
  source             = "../../modules/ecs-service"
  name               = "api"
  cluster_arn        = module.ecs_cluster.arn
  image_uri          = var.image_uri
  cpu                = 512
  memory             = 1024
  desired_count      = 2
  target_group_arn   = module.alb.target_group_arn
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [module.security_groups.app_sg_id]
  secrets            = [{ name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn }]
}
```

**IAM follows least-privilege throughout.** ECS task roles are generated per service via the `iam` module and grant only the specific S3 prefixes and Secrets Manager paths each service needs — no wildcards. A `ReadOnly` IAM policy is deployed for developers; a `DeployRole` is assumed by CI only.

**All secrets go through Secrets Manager.** Database credentials are rotated automatically on a 30-day schedule via a Lambda rotation function included in the `rds` module. Application containers receive secrets as environment variables injected by ECS at task start — nothing in `.env` files, SSM Parameter Store, or image layers.

## File structure

```
modules/
├── vpc/                  VPC, subnets, NAT gateways, flow logs, VPC endpoints
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
├── ecs-service/          Fargate service, task definition, auto-scaling
├── rds/                  PostgreSQL Multi-AZ, read replica, secret rotation
├── alb/                  Application Load Balancer, HTTPS listener, WAF ACL
├── iam/                  Per-service task roles, deploy roles, permission boundary
├── elasticache/          Redis cluster, subnet group, security group
└── atlantis/             Atlantis ECS service, GitHub webhook configuration

environments/
├── staging/
│   ├── main.tf           Module composition for staging
│   ├── variables.tf
│   ├── terraform.tfvars.example
│   └── backend.tf        S3 bucket + DynamoDB table references
└── production/
    ├── main.tf
    ├── variables.tf
    └── backend.tf

bootstrap/                One-time S3 + DynamoDB state backend setup
.github/
└── workflows/
    ├── drift-detection.yml   Nightly plan across all environments
    └── security-scan.yml     Checkov on every PR

atlantis.yaml             Repo-level Atlantis workflow config
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec aws-terraform

# 2. Bootstrap remote state (run once per AWS account/region)
cd bootstrap/
cp terraform.tfvars.example terraform.tfvars
# Set: aws_account_id, aws_region, state_bucket_name, lock_table_name
terraform init && terraform apply

# 3. Configure an environment
cd environments/staging/
cp terraform.tfvars.example terraform.tfvars
# Set: aws_account_id, aws_region, domain_name, image_uri, alert_email

# 4. Review and apply (local, first-time only)
terraform init
terraform plan    # review the proposed resources
terraform apply

# 5. Deploy Atlantis (after which all changes go via PR)
cd ../../modules/atlantis/
# Set ATLANTIS_GH_TOKEN and ATLANTIS_GH_WEBHOOK_SECRET in Secrets Manager first
terraform apply
# Configure the GitHub webhook URL output from this apply in your repo settings
```

After Atlantis is running: open a PR with any `.tf` change, comment `atlantis plan` to see the diff, then `atlantis apply` once the PR is approved. Direct `terraform apply` from local machines is no longer needed.

## Opinionated choices, with reasons

- **ECS Fargate over EKS.** Kubernetes is a force multiplier for ten-plus services with complex scheduling requirements; it is overhead for a handful. Fargate removes node management entirely. Graduate to EKS when you have a platform team and real scheduling constraints, not before.
- **Atlantis over Terraform Cloud.** Self-hosted, no per-resource billing, runs in your VPC so it can reach private state endpoints. Terraform Cloud is excellent but Atlantis is simpler to audit, cheaper at scale, and easier to extend with custom workflow steps. Migrate to Terraform Cloud when you need its team-collaboration features and the cost is justified.
- **One state file per environment, not per module.** Per-module state requires remote state lookups and `data` blocks for every cross-module reference, which creates fragile dependency chains. Environment-level state keeps the graph simple. Split only when a state file takes more than a few seconds to lock, which is rare in practice.
- **Checkov over tfsec or KICS.** Broader rule coverage including AWS resource policies, not only HCL syntax. The CI integration is a single `pip install checkov && checkov -d .`. Tune a `.checkov.baseline` file to suppress accepted findings rather than disabling rules globally.
- **Secrets Manager over Parameter Store for credentials.** Automatic rotation via Lambda hooks, fine-grained resource policies per secret, direct ECS secrets injection. Use Parameter Store for non-sensitive configuration (feature flags, app config). Never store credentials in Parameter Store SecureString — you lose the rotation capability.
- **Customer-managed KMS keys.** Lets you audit key usage in CloudTrail, restrict key access to specific IAM principals, and revoke access in an incident. AWS-managed keys work but give you no control over access.

## Testing strategy

**Module tests** use **Terratest** (Go). Each module has a `test/` directory with a `*_test.go` that applies the module with minimal variables, asserts the expected AWS resources exist by querying the AWS API, then destroys. Tests run in a dedicated sandbox AWS account to avoid polluting shared environments.

**Plan validation** in CI catches type errors, missing variables, and Checkov policy violations on every PR — no AWS credentials needed beyond `terraform validate` + `terraform plan -out=plan.tfplan` + Checkov.

**Drift detection** runs nightly as a cron GitHub Actions job against all environments. A non-zero diff posts a Slack message and creates a GitHub issue. Drift in production blocks the next deployment pipeline until resolved.

## Skills paired with this spec

- `security-auditor` — OWASP-grounded checks on IAM policies, security group rules, network ACLs, and S3 bucket policies
- `code-reviewer` — Terraform module code review tuned for correctness, cost, and security

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **Greenfield project with fewer than three services.** Start with a single ECS service module without Atlantis. Add the full blueprint when you have multiple environments and teams making concurrent infrastructure changes.
- **GCP or Azure infrastructure.** This spec is AWS-specific. The architectural patterns translate but the HCL does not.
- **Serverless-first architecture.** If your compute is primarily Lambda with no persistent container workloads, the ECS/ALB/RDS stack is the wrong shape. Consider AWS SAM or the Serverless Framework instead.
- **Kubernetes required from day one.** If service mesh, custom scheduling, or a platform team's tooling roadmap requires K8s, start with EKS rather than migrating from ECS later.
