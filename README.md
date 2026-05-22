# SINIKO

Application SaaS de gestion scolaire — stage DevSecOps (HESTIM / THL Technologie).

## Stack

| Couche | Technologie |
|--------|-------------|
| Backend | FastAPI, Python 3.12, SQLAlchemy, Alembic |
| Frontend | React 18, Vite, TypeScript |
| BDD | PostgreSQL 16 |
| Conteneurs | Docker Compose (ARM64 / Mac M4) |
| CI/CD | GitHub Actions |
| Supervision locale | Loki + Grafana + Promtail |
| Supervision prod | AWS CloudWatch (+ Wazuh optionnel sur ECS amd64) |
| IaC | Terraform + Checkov |

## Démarrage rapide (Mac ARM64)

Guide détaillé : **[docs/demarrage.md](docs/demarrage.md)** · Workflow : **[docs/workflow-dev.md](docs/workflow-dev.md)** · **Pipeline sécurité : [docs/pipeline-securite.md](docs/pipeline-securite.md)** · Prompts : **[docs/prompts-granulaires.md](docs/prompts-granulaires.md)**

```bash
cp .env.example .env
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| API | http://localhost:8000/docs |
| Frontend | http://localhost:8080 |
| pgAdmin | http://localhost:5050 |
| Grafana | http://localhost:3000 |

## Workflow DevSecOps

Voir [docs/devsecops-workflow.md](docs/devsecops-workflow.md) et [docs/supervision.md](docs/supervision.md).

## Secrets GitHub (CI)

| Secret | Usage |
|--------|--------|
| `SNYK_TOKEN` | Scan dépendances (optionnel si Dependabot seul) |
| `SONAR_TOKEN` | SonarCloud |
| `AWS_*` | Déploiement CD (phase AWS) |

## Licence

Projet de stage — usage académique et client THL.
