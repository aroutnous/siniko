# Infrastructure AWS — SINIKO

Provisionnement cible (CDC) :

- VPC, subnets public/privé, Security Groups
- ALB + ACM (HTTPS)
- ECS Fargate (api, frontend)
- RDS PostgreSQL
- IAM (moindre privilège)
- Secrets Manager
- CloudWatch Logs + metric filters + alarmes

## Supervision prod

| Composant | Rôle |
|-----------|------|
| **CloudWatch Logs** | Logs API/containers, filtres métriques (401, 5xx) |
| **CloudWatch Alarms** | Brute force, erreurs applicatives |
| **Wazuh (option)** | ECS **amd64** uniquement — pas sur Mac ARM |

## Commandes locales

```bash
cd infra/terraform
terraform init
terraform plan
```

Checkov est exécuté en CI (`.github/workflows/iac.yml`).
