# CareKosh AWS deployment plan

Status: proposed. Pricing checked against AWS regional on-demand rates on 19 November 2026.

## Scope

Build a dedicated AWS test environment using synthetic accounts and inventory. Keep day-to-day staging on Render, Neon, and Cloudflare. Use the AWS environment to rehearse releases, monitoring, rollback, and database recovery before deciding whether to move the production API. Cloudflare continues to host the web frontend and Expo EAS continues to build Android.

Use Mumbai (`ap-south-1`) for the lab. It is cheaper for the configuration below. Re-evaluate the production region against the location of the production database, network latency, and recurring cost before cutover.

## 1. Create the AWS test environment

1. **Account and budget.** Use a dedicated AWS sandbox account. Enable MFA, set up a separate administrative identity for everyday work, and create a $100 monthly cost budget with actual-spend alerts at 50%, 80%, and 100%. Tag resources `Project=CareKosh` and `Environment=aws-test`. Budget notifications can arrive after usage passes the threshold. [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)
2. **Network.** In **VPC → Create VPC → VPC and more**, create `carekosh-lab` across two Availability Zones with two public and two private subnets and zero NAT gateways. Place the internet-facing Application Load Balancer in the public subnets and restrict inbound HTTPS to the testers' public IPs. Assign the lab's Fargate task a public IPv4 address for outbound access. Allow inbound TCP `8000` to the task only from the load balancer security group. Allow TCP `5432` and `6379` to the private RDS and Valkey resources only from the task security group. [Fargate networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html) · [RDS VPC setup](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html)
3. **Data services.** Create private Single-AZ RDS PostgreSQL on `db.t4g.micro` with 20 GB gp3 storage and an initial `carekosh_lab` database. Match the PostgreSQL major version being rehearsed and enable automated backups. Create one private node-based ElastiCache for Valkey `cache.t4g.micro` with TLS and authentication. Create separate lab values for `DATABASE_URL`, `RATE_LIMIT_STORAGE_URI`, and `SECRET_KEY` in Secrets Manager. Configure the cache connection with certificate-verified `rediss://`. Use synthetic data. [RDS backup and restore](https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/managing-backup-restore.html) · [ElastiCache TLS](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/in-transit-encryption.html)
4. **Image registry, IAM, and logs.** Create a private ECR repository named `carekosh-api` and a CloudWatch log group named `/ecs/carekosh-lab` with seven-day retention. Give the ECS task execution role permissions to pull the image, write the logs, and read the lab secrets. Scope a separate GitHub Actions OIDC role to this repository and the lab environment. Make the first lab workflow manually triggered and record the tested image digest. Capture the infrastructure in Terraform so it can be recreated and reviewed. [ECS execution role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html) · [GitHub Actions OIDC for AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
5. **Health checks and migrations.** Before deploying the API, handle the ALB health probe on `/live`. The ALB uses the task's private IP and port in the `Host` header, which the current exact-host validation rejects. Rehearse a scoped health-check change that accepts the load balancer probe while preserving host checks for application traffic. The Docker entrypoint currently runs `alembic upgrade head` on each startup. Move the migration to a single release task and verify it completes before rolling out new service tasks. [ALB health probes](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-troubleshooting.html) · [API ingress validation](../../vitaltrack-backend/app/services/ingress.py) · [Docker startup](../../vitaltrack-backend/docker-entrypoint.sh)
6. **TLS and ECS service.** Use a dedicated lab hostname such as `aws-test-api.carekosh.com` and an ACM certificate in the lab region. Create an HTTPS listener and an IP target group forwarding to port `8000`. Run one Linux/x86 Fargate task with 0.5 vCPU and 1 GB RAM to start. Set an explicit lab ingress mode and allowed host. Verify `/live` as liveness and `/health` as readiness, including PostgreSQL connectivity. Point a separate test client at the lab hostname. [ACM certificates](https://docs.aws.amazon.com/acm/latest/userguide/acm-public-certificates.html) · [ALB target groups](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html)

### Monthly base cost

Planning estimates in USD for 730 hours, one Fargate task, one Single-AZ RDS instance, one Valkey node, and zero NAT gateways.

| Resource | Singapore `ap-southeast-1` | Mumbai `ap-south-1` |
| --- | ---: | ---: |
| Fargate, 0.5 vCPU and 1 GB RAM | $22.49 | $18.93 |
| Application Load Balancer, base hourly charge | $18.40 | $17.45 |
| RDS PostgreSQL `db.t4g.micro` | $18.25 | $15.33 |
| RDS storage, 20 GB gp3 | $2.76 | $2.62 |
| Valkey `cache.t4g.micro` | $14.02 | $11.68 |
| Three public IPv4 addresses | $10.95 | $10.95 |
| **Base total, from unrounded rates** | **$86.86** | **$76.96** |

Add usage charges for load-balancer capacity, data transfer, ECR, logs, Secrets Manager, backups beyond included allowances, and taxes. Reprice before provisioning. Scaling ECS to zero ends the task charge while the other resources continue to bill. When the rehearsal is complete, remove lab resources you no longer need and review retained snapshots, images, and logs. [AWS regional price lists](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-the-aws-price-list-bulk-api.html) · [AWS Pricing Calculator](https://calculator.aws/)

## 2. Complete the release rehearsal

- Deploy a reviewed image by digest. Record the source commit, image digest, migrations, deployed task revision, and logs.
- Verify login and inventory reads and writes with synthetic data. Run two tasks briefly to confirm that rate limits are shared. Monitor API errors, latency, unhealthy tasks, and cache memory and evictions.
- Test a failed deployment and rollback. Restore a database backup to a separate instance and verify sample records. Record the recovery time and recovery point.
- Validate public HTTPS, browser authentication and allowed origins, email links, and the installed Android client's API behavior before any production rollout.

## 3. Decide whether to move production

- Compare the rehearsed cost and recovery results with the current production deployment. Inspect the live Render revision, database migration head, and Cloudflare origin configuration before scheduling any change.
- If proceeding, move the API compute first while retaining the existing production PostgreSQL database. Keep `api.carekosh.com` as the public endpoint and switch the origin only after the AWS release and monitoring are ready. Validate TLS, origin protection, and both clients before and after cutover.
- Check the Render GitHub integration and the [existing GitHub Actions production job](../../.github/workflows/ci.yml) so a merge to `main` uses one intended release path. Keep the previous Render service available during the rollback window and document how to restore the previous origin.
- Consider moving production PostgreSQL to RDS as a separate release. Rehearse the data copy, validate row counts and important records, and define write handling and rollback before moving live data. [PostgreSQL migration to RDS](https://docs.aws.amazon.com/dms/latest/sbs/dm-postgresql-migration-overview.html)
