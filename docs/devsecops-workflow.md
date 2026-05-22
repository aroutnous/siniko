# Workflow DevSecOps — SINIKO

Chaîne retenue (shift left → production), alignée CDC et stack validée.

> Explication détaillée de chaque étape (objectif, OWASP, limites) : **[pipeline-securite.md](pipeline-securite.md)**

## Vue d’ensemble

```text
[Mac M4 — pre-commit]     →  [GitHub Actions — CI]     →  [Terraform + Checkov]     →  [AWS prod]
 gitleaks, hadolint          Semgrep, Snyk, Trivy          IaC sécurisée               CloudWatch
 commit bloqué si KO         SonarCloud, pytest            ECS, RDS, Secrets           (+ Wazuh amd64 opt.)
                             ESLint, Vitest
```

## 1. Machine locale (avant `git push`)

| Outil | Rôle | Blocage |
|-------|------|---------|
| **gitleaks** | Détection secrets dans le staging | Commit refusé |
| **hadolint** | Bonnes pratiques Dockerfiles | Commit refusé |
| **ruff** | Lint Python | Commit refusé |

Installation :

```bash
pip install pre-commit
pre-commit install
pre-commit run --all-files
```

## 2. GitHub — chaque push / PR

Workflow : `.github/workflows/ci.yml`

| Étape | Outil | Seuil |
|-------|-------|-------|
| Secrets | gitleaks | 0 fuite |
| SAST | Semgrep (`p/owasp-top-ten`, Python, TS) | Pas de finding ERROR |
| SCA | Snyk (si `SNYK_TOKEN`) + pip-audit / npm | High/Critical |
| Qualité | SonarCloud (si `SONAR_TOKEN`) | Quality Gate |
| Tests | pytest (≥ 80 %), Vitest | 100 % pass |
| Lint | ruff, bandit, ESLint | 0 erreur |
| Conteneurs | Hadolint + Trivy | Pas de CVE Critical/High non corrigées |

## 3. Infrastructure

Workflow : `.github/workflows/iac.yml`

| Outil | Rôle |
|-------|------|
| **Terraform** | VPC, ECS, RDS, IAM, CloudWatch |
| **Checkov** | Bonnes pratiques sécurité IaC |

## 4. Déploiement

Workflow : `.github/workflows/cd.yml` (activé via `AWS_DEPLOY_ENABLED`)

Images validées → GHCR/ECR → ECS Fargate.

## 5. Validation offensive (post-déploiement)

| Outil | Usage |
|-------|--------|
| OWASP ZAP | DAST baseline + scénarios auth/IDOR |
| Burp Suite Community | Complément manuel |

## Secrets GitHub requis

- `SNYK_TOKEN` (optionnel si pip-audit/npm audit suffisent)
- `SONAR_TOKEN` + projet SonarCloud
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (phase CD)

## Vibe coding — règle

Code généré par IA → relecture humaine → pre-commit → PR → CI verte → merge.
