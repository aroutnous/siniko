# Architecture SINIKO

## Schéma logique

```text
[React SPA] ──HTTPS──► [ALB] ──► [ECS: API FastAPI]
                                      │
                                      ▼
                                 [RDS PostgreSQL]
                                      │
                    Secrets Manager ◄─┘
                    CloudWatch Logs ◄── logs JSON
```

## Monorepo

```text
siniko/
├── backend/       # FastAPI, SQLAlchemy, Alembic, pytest
├── frontend/      # React + Vite + TypeScript
├── infra/         # Terraform AWS
├── monitoring/    # Loki, Promtail, Grafana (local)
├── docker-compose.yml
└── .github/workflows/
```

## Sécurité applicative (MVP)

- Authentification JWT + refresh + bcrypt (à implémenter)
- RBAC : Admin, Directeur, Secrétariat, Comptabilité
- CORS restrictif, validation Pydantic
- Audit log actions administratives
- HTTPS terminé sur ALB (ACM)

## Références

- [devsecops-workflow.md](./devsecops-workflow.md)
- [supervision.md](./supervision.md)
- CDC DevSecOps HESTIM / THL
