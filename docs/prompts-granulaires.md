# SINIKO — Prompts granulaires & guide DevSecOps

Document de référence pour le stage **HESTIM / THL** — développement pas à pas (vibe coding maîtrisé).

**Usage** : copiez **un seul** bloc « Prompt à envoyer » dans le chat, validez, committez, PR, merge — puis passez au suivant.

---

## Table des matières

1. [Contexte projet](#1-contexte-projet)
2. [Stack & architecture](#2-stack--architecture)
3. [Workflow Git & branches](#3-workflow-git--branches)
4. [Pipeline DevSecOps (shift left)](#4-pipeline-devsecops-shift-left)
5. [Environnement local (100 % Docker)](#5-environnement-local-100--docker)
6. [Protection de branche (repo public)](#6-protection-de-branche-repo-public)
7. [Convention des prompts](#7-convention-des-prompts)
8. [Phase 0 — Fondations (fait / rappel)](#phase-0--fondations)
9. [Phase 1 — Auth & utilisateurs](#phase-1--auth--utilisateurs)
10. [Phase 2 — Élèves](#phase-2--élèves)
11. [Phase 3 — Notes](#phase-3--notes)
12. [Phase 4 — Comptabilité (MVP)](#phase-4--comptabilité-mvp)
13. [Phase 5 — Frontend par module](#phase-5--frontend-par-module)
14. [Phase 6 — DevSecOps (renforcement)](#phase-6--devsecops-renforcement)
15. [Phase 7 — AWS & IaC](#phase-7--aws--iac)
16. [Phase 8 — Supervision](#phase-8--supervision)
17. [Phase 9 — Tests offensifs & rapport](#phase-9--tests-offensifs--rapport)
18. [Phase 10 — Optionnels (CDC+)](#phase-10--optionnels)
19. [Index rapide des prompts](#index-rapide-des-prompts)

---

## 1. Contexte projet

| Élément | Détail |
|---------|--------|
| **Produit** | SaaS de gestion scolaire (école cliente) |
| **Objectif stage** | App fonctionnelle + chaîne **DevSecOps** + déploiement **AWS** + supervision + pentest |
| **Méthode** | Vibe coding (IA) avec relecture humaine, SAST/SCA, CI bloquante |
| **Référentiel sécu** | OWASP Top 10, bonnes pratiques ASVS L1 (rapport) |
| **Périmètre MVP** | Users/RBAC, élèves, notes, compta simple — Mobile Money **option** |
| **Hors scope** | Maintenance post-stage, intégration SI tiers école |

### Rôles métier (CDC)

| Rôle | Périmètre |
|------|-----------|
| **Administrateur** | Système, utilisateurs, configuration |
| **Directeur** | Consultation globale, rapports, validation |
| **Secrétariat** | Inscriptions, élèves, classes, documents |
| **Comptabilité** | Paiements, reçus, suivi financier |

---

## 2. Stack & architecture

| Couche | Technologie |
|--------|-------------|
| Backend | FastAPI 3.12, Pydantic, SQLAlchemy 2, Alembic |
| Frontend | React 18, Vite, TypeScript, Tailwind (ou shadcn plus tard) |
| BDD | PostgreSQL 16 |
| Auth | JWT access + refresh, bcrypt |
| Conteneurs | Docker Compose (Mac M4 ARM64) |
| CI/CD | GitHub Actions |
| Registre | GHCR / ECR (phase AWS) |
| Supervision locale | Loki + Grafana + Promtail |
| Supervision prod | CloudWatch (+ Wazuh amd64 optionnel) |
| IaC | Terraform + Checkov |
| DAST | OWASP ZAP, Burp Community |

Monorepo :

```text
siniko/
├── backend/          # API FastAPI
├── frontend/         # React
├── infra/terraform/  # AWS
├── monitoring/       # Loki/Grafana
├── docs/             # documentation
└── .github/workflows/
```

---

## 3. Workflow Git & branches

### Boucle par prompt

```text
git checkout main && git pull
git checkout -b feat/<id>-<court-resume>
    ↓
[Prompt IA → code ciblé]
    ↓
Vérification locale (Docker, Swagger, pgAdmin, tests)
    ↓
git add … && git commit -m "feat(scope): description"   ← pre-commit
git push -u origin feat/…
    ↓
PR sur GitHub (site web) → CI verte → merge main
```

### Conventions

| Élément | Format |
|---------|--------|
| Branche | `feat/auth-login`, `fix/ci-workflow`, `chore/deps` |
| Commit | `feat(auth): …`, `fix(docker): …`, `test(students): …` |
| PR | Une PR par prompt ou groupe cohérent (pas tout l’app) |

### Commandes Git (rappel)

```bash
git status
git add chemin/fichier.py    # ou git add -A
git diff --staged
git commit -m "feat(auth): modèles User et Role"
git push -u origin feat/auth-models
# PR : bandeau jaune « Compare & pull request » sur GitHub
```

### Vibe coding (rapport de stage)

- Noter ce qui a été **généré par IA** vs **relu/corrigé** par vous.
- Taux COMPILATIO : citer les outils de contrôle (pre-commit, CI).

---

## 4. Pipeline DevSecOps (shift left)

> **Objectif de chaque étape (détaillé)** : voir **[pipeline-securite.md](pipeline-securite.md)**

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ SHIFT LEFT                                                              │
├─────────────────────────────────────────────────────────────────────────┤
│ 1. IDE + IA (Cursor)     → génération code                              │
│ 2. pre-commit (Mac)      → gitleaks, hadolint, ruff  ❌ bloque commit   │
│ 3. Tests locaux          → pytest, vitest (optionnel avant commit)      │
│ 4. git push + PR         → GitHub Actions CI        ❌ bloque merge*    │
│ 5. Merge main            → build images, préparation CD                 │
│ 6. Terraform + Checkov   → infra AWS (phase 7)                          │
│ 7. Deploy AWS (ECS/RDS)  → phase 7                                        │
│ 8. CloudWatch / Loki     → supervision                                    │
│ 9. OWASP ZAP / Burp      → DAST, rapport vulnérabilités                   │
└─────────────────────────────────────────────────────────────────────────┘
* Merge bloqué si : repo public + branch protection + check « CI — gate » requis
```

### pre-commit (local)

```bash
pre-commit install
pre-commit run --all-files   # vérification complète avant grosse PR
```

| Hook | Fichiers concernés |
|------|-------------------|
| gitleaks | Tout le repo |
| hadolint | `Dockerfile` modifiés |
| ruff / ruff-format | `backend/**/*.py` modifiés |

Si seuls des `.md` ou `.yml` changent → ruff/hadolint **skipped** (normal).

### CI GitHub (`.github/workflows/ci.yml`)

| Job | Outil | Rôle |
|-----|-------|------|
| Secrets (gitleaks) | Gitleaks | Secrets dans Git |
| Backend — lint & tests | Ruff, Bandit, pip-audit, pytest | Python ≥ 80 % coverage |
| Frontend — lint & tests | ESLint, Vitest | JS/TS |
| SAST (Semgrep OWASP) | Semgrep | OWASP Top 10 |
| SCA (Snyk) | Snyk | Si variable `ENABLE_SNYK=true` + secret `SNYK_TOKEN` |
| SonarCloud | Sonar | Si `ENABLE_SONAR=true` + `SONAR_TOKEN` |
| Docker — Hadolint & Trivy | Hadolint, Trivy | Images Docker |
| **CI — gate** | Agrégation | **Check à exiger sur `main`** |

### IaC (`.github/workflows/iac.yml`)

Terraform `fmt` / `validate` + **Checkov** sur `infra/terraform/`.

### CD (`.github/workflows/cd.yml`)

Activé plus tard via variable `AWS_DEPLOY_ENABLED=true`.

### Secrets GitHub (Settings → Secrets)

| Secret | Usage |
|--------|--------|
| `SNYK_TOKEN` | Snyk (optionnel) |
| `SONAR_TOKEN` | SonarCloud (optionnel) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Déploiement AWS |

Variables (Settings → Variables) : `ENABLE_SNYK`, `ENABLE_SONAR` = `true` quand prêt.

---

## 5. Environnement local (100 % Docker)

```bash
cd ~/siniko
cp .env.example .env   # éditer secrets (APP_SECRET_KEY, JWT, Grafana, pgAdmin)
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| API Swagger | http://localhost:8000/docs |
| Frontend | http://localhost:8080 |
| pgAdmin | http://localhost:5050 — host Postgres : **`postgres`** |
| Grafana | http://localhost:3000 |

| Conteneur | Nom fixe |
|-----------|----------|
| Postgres | `siniko-postgres` |
| API | `siniko-backend` |
| Front | `siniko-frontend` |

Migrations : **automatiques** au démarrage de `siniko-backend` (`alembic upgrade head`).

```bash
docker compose up -d --build backend
docker compose logs backend | tail -20
docker compose exec backend pytest
curl http://localhost:8000/health
```

Docs : [demarrage.md](demarrage.md), [migrations.md](migrations.md), [troubleshooting.md](troubleshooting.md).

---

## 6. Protection de branche (repo public)

1. **Settings → Branches → Add classic branch protection rule**
2. **Branch name pattern** : `main`
3. Cocher **Require a pull request before merging**
4. Cocher **Require status checks to pass**
5. **+ Add checks** → **`CI — gate`**
6. Décocher bypass administrateur si vous voulez vous bloquer vous-même
7. **Save**

Sans check ajouté → merge possible même si CI rouge.

---

## 7. Convention des prompts

Chaque prompt ci-dessous contient :

- **ID** : référence pour la branche (`feat/P1-03-…`)
- **Prérequis** : prompts à avoir terminés
- **Prompt à envoyer** : texte à copier-coller
- **Done** : critères de validation
- **Vérif** : commandes / URLs

Vous pouvez ajouter vos propres prompts en fin de fichier ou entre les phases.

---

## Phase 0 — Fondations

| ID | Statut | Sujet |
|----|--------|-------|
| P0-01 | ✅ | Bootstrap monorepo, Docker, pre-commit, CI |
| P0-02 | ✅ | Repo public + branch protection |
| P0-03 | ⬜ | CI verte stable sur `main` (corriger jobs rouges restants) |

### P0-03 — Stabiliser la CI sur main

**Branche** : `fix/ci-green`

**Prompt à envoyer** :

```text
Analyse les échecs de la dernière CI GitHub Actions sur siniko (jobs gitleaks, backend, frontend, docker) et corrige le minimum pour obtenir une CI verte sur main. Ne touche pas au métier. Documente la cause dans docs/troubleshooting.md si pertinent.
```

**Done** : workflow Actions vert sur `main` ; check « CI — gate » disponible.

**Vérif** : GitHub → Actions → dernier run `main` = Success.

---

## Phase 1 — Auth & utilisateurs

### P1-01 — Modèles User, Role, association

**Branche** : `feat/P1-01-models-user-role`

**Prérequis** : P0-03

**Prompt à envoyer** :

```text
Étape auth 1/7 — Backend uniquement.

Créer les modèles SQLAlchemy :
- Role : id, name (enum : admin, directeur, secretariat, comptabilite), description optionnelle
- User : id, email unique, password_hash, full_name, is_active, created_at, updated_at
- Table d’association user_roles (many-to-many)

Générer la migration Alembic autogenerate. Pas d’endpoints API encore.
Respecter : docstrings, pas de secret en dur, conventions du repo siniko.
```

**Done** : tables en BDD après `docker compose up -d --build backend` ; visible dans pgAdmin.

**Vérif** : `\dt` ou pgAdmin ; `alembic current` dans le conteneur backend.

---

### P1-02 — Hash mot de passe (bcrypt)

**Branche** : `feat/P1-02-password-hash`

**Prérequis** : P1-01

**Prompt à envoyer** :

```text
Étape auth 2/7 — Sécurité mots de passe.

Ajouter un service backend/app/services/password.py :
- hash_password(plain) avec bcrypt
- verify_password(plain, hash)

Tests unitaires pytest. Pas d’API publique encore.
```

**Done** : tests passent ; cost factor bcrypt documenté (OWASP).

---

### P1-03 — JWT access + refresh

**Branche** : `feat/P1-03-jwt-tokens`

**Prérequis** : P1-02

**Prompt à envoyer** :

```text
Étape auth 3/7 — JWT.

Implémenter backend/app/services/jwt.py :
- create_access_token(sub, roles)
- create_refresh_token(sub)
- decode_token avec gestion d’erreurs

Utiliser JWT_SECRET_KEY et durées depuis Settings (.env).
Tests unitaires. Pas de routes encore.
```

**Done** : tests JWT verts ; expiration courte access (15 min CDC).

---

### P1-04 — POST /auth/login et /auth/refresh

**Branche** : `feat/P1-04-auth-endpoints`

**Prérequis** : P1-03

**Prompt à envoyer** :

```text
Étape auth 4/7 — Endpoints authentification.

- POST /api/v1/auth/login (email, password) → access + refresh JSON
- POST /api/v1/auth/refresh (refresh_token) → nouveau access
- Réponses 401 génériques (pas de user enumeration)
- Rate limiting simple en mémoire ou middleware (option basique)

Schémas Pydantic, tests httpx. Seed optionnel : un admin de test via migration ou script documenté (.env.example).
```

**Done** : Swagger login fonctionne ; logs JSON sur échec login.

**Vérif** : http://localhost:8000/docs

---

### P1-05 — Middleware RBAC

**Branche** : `feat/P1-05-rbac`

**Prérequis** : P1-04

**Prompt à envoyer** :

```text
Étape auth 5/7 — RBAC.

- Dépendance FastAPI get_current_user (Bearer JWT)
- Décorateur ou dépendance require_roles("admin", …)
- Route exemple GET /api/v1/auth/me protégée

Tests : 401 sans token, 403 mauvais rôle, 200 bon rôle.
```

**Done** : `/auth/me` protégé et testé.

---

### P1-06 — CRUD utilisateurs (admin)

**Branche** : `feat/P1-06-users-crud`

**Prérequis** : P1-05

**Prompt à envoyer** :

```text
Étape auth 6/7 — Gestion utilisateurs (admin uniquement).

Endpoints sous /api/v1/users :
- GET list (pagination), GET by id
- POST create (hash password), PATCH update, DELETE soft (is_active=false)
- Attribution / révocation rôles

RBAC : admin seulement. Validation Pydantic stricte.
```

**Done** : admin peut créer un user secrétariat via Swagger.

---

### P1-07 — Journal d’audit admin

**Branche** : `feat/P1-07-audit-log`

**Prérequis** : P1-06

**Prompt à envoyer** :

```text
Étape auth 7/7 — Audit.

- Modèle AuditLog : actor_id, action, resource, ip, payload_json, created_at
- Migration Alembic
- Enregistrer automatiquement : création user, changement rôle, désactivation
- GET /api/v1/audit-logs (admin, pagination)

Logs structlog corrélés. Pas de données sensibles en clair dans les logs.
```

**Done** : action admin visible en BDD et via API.

---

## Phase 2 — Élèves

### P2-01 — Modèles Class, Student, Enrollment

**Branche** : `feat/P2-01-models-students`

**Prérequis** : P1-05 minimum

**Prompt à envoyer** :

```text
Module élèves 1/5 — Modèles.

- Class (nom, niveau, année scolaire)
- Student (infos personnelles, contacts parents, is_active)
- Enrollment (student ↔ class, année)

Migration Alembic. Relations SQLAlchemy propres. Pas d’API encore.
```

---

### P2-02 — CRUD élèves (secrétariat + admin)

**Branche** : `feat/P2-02-students-crud`

**Prompt à envoyer** :

```text
Module élèves 2/5 — API CRUD.

/api/v1/students : list avec filtres (classe, nom), create, get, patch, soft delete.
RBAC : secretariat, admin ; lecture seule directeur si pertinent.
Tests pytest.
```

---

### P2-03 — Affectation classe

**Branche** : `feat/P2-03-enrollment`

**Prompt à envoyer** :

```text
Module élèves 3/5 — Affectation.

POST /api/v1/students/{id}/enroll , PATCH changement de classe.
Historique : garder enrollments par année scolaire.
```

---

### P2-04 — Recherche avancée

**Branche** : `feat/P2-04-students-search`

**Prompt à envoyer** :

```text
Module élèves 4/5 — Recherche.

Query params : q (nom), class_id, level, year.
Index BDD si nécessaire. Pagination limit/offset.
```

---

### P2-05 — Export liste élèves (CSV)

**Branche** : `feat/P2-05-students-export`

**Prompt à envoyer** :

```text
Module élèves 5/5 — Export.

GET /api/v1/students/export?format=csv — RBAC secretariat/admin.
En-têtes CSV, pas de données inutiles (minimisation RGPD).
```

---

## Phase 3 — Notes

### P3-01 — Modèles Subject, Term, Grade

**Branche** : `feat/P3-01-models-grades`

**Prompt à envoyer** :

```text
Module notes 1/5 — Modèles.

Subject, Term (trimestre), Grade (student, subject, term, value, coefficient, teacher_id optionnel).
Contraintes : notes 0–20, unicité student+subject+term.
Migration Alembic.
```

---

### P3-02 — Saisie notes (secrétariat / enseignant selon RBAC)

**Branche** : `feat/P3-02-grades-crud`

**Prompt à envoyer** :

```text
Module notes 2/5 — Saisie.

CRUD /api/v1/grades avec RBAC adapté.
Validation Pydantic. Tests.
```

---

### P3-03 — Calcul moyennes

**Branche** : `feat/P3-03-averages`

**Prompt à envoyer** :

```text
Module notes 3/5 — Moyennes.

Service de calcul : moyenne par matière, moyenne générale (coefficients).
GET /api/v1/students/{id}/report-card?term=...
```

---

### P3-04 — Bulletin PDF ou HTML imprimable

**Branche** : `feat/P3-04-bulletin`

**Prompt à envoyer** :

```text
Module notes 4/5 — Bulletin.

Génération bulletin simple (HTML template ou PDF weasyprint) — endpoint GET.
Pas de design complexe, données correctes et RBAC.
```

---

### P3-05 — Tableau de bord résultats par classe

**Branche** : `feat/P3-05-class-dashboard-api`

**Prompt à envoyer** :

```text
Module notes 5/5 — Stats classe.

GET /api/v1/classes/{id}/grades/summary — moyennes, min, max, effectif.
RBAC directeur, secretariat.
```

---

## Phase 4 — Comptabilité (MVP)

### P4-01 — Modèle Payment

**Branche** : `feat/P4-01-models-payments`

**Prompt à envoyer** :

```text
Module compta 1/4 — Modèle.

Payment : student_id, amount, currency (MAD), paid_at, method (cash, transfer), reference, created_by.
Migration Alembic.
```

---

### P4-02 — Enregistrement paiements

**Branche** : `feat/P4-02-payments-crud`

**Prompt à envoyer** :

```text
Module compta 2/4 — API.

CRUD paiements RBAC comptabilite, admin.
Lien élève obligatoire. Tests.
```

---

### P4-03 — Reçu PDF simple

**Branche** : `feat/P4-03-receipt`

**Prompt à envoyer** :

```text
Module compta 3/4 — Reçu.

GET /api/v1/payments/{id}/receipt — PDF ou HTML imprimable avec numéro de reçu unique.
```

---

### P4-04 — Tableau impayés / encaissements

**Branche** : `feat/P4-04-finance-dashboard`

**Prompt à envoyer** :

```text
Module compta 4/4 — Dashboard financier.

GET /api/v1/finance/summary?year= — total encaissé, impayés (élèves sans paiement attendu — règle simple documentée).
RBAC comptabilite, directeur.
```

---

## Phase 5 — Frontend par module

> Une page / flux à la fois, branchée sur `VITE_API_BASE_URL`.

### P5-01 — Layout + auth (login, token storage)

**Branche** : `feat/P5-01-ui-auth`

**Prompt à envoyer** :

```text
Frontend 1 — Auth UI.

Page login, stockage token sécurisé (mémoire + refresh), intercepteur fetch vers API, déconnexion.
React Router, layout minimal SINIKO (français). Pas de autres modules.
```

---

### P5-02 — Shell navigation + garde routes par rôle

**Branche** : `feat/P5-02-ui-rbac-routes`

**Prompt à envoyer** :

```text
Frontend 2 — Navigation RBAC.

Menu selon rôle (admin, directeur, secretariat, comptabilite). Routes protégées, redirect si non autorisé.
```

---

### P5-03 à P5-06 — Écrans métier

| ID | Prompt court |
|----|----------------|
| P5-03 | UI liste + formulaire élèves (consomme API students) |
| P5-04 | UI saisie notes + affichage bulletin |
| P5-05 | UI paiements + reçu |
| P5-06 | UI admin utilisateurs + liste audit (lecture) |

*(Détailler chaque prompt sur le modèle P5-01 quand vous y arrivez.)*

---

## Phase 6 — DevSecOps (renforcement)

### P6-01 — Activer SonarCloud sur la CI

**Branche** : `chore/P6-01-sonar`

**Prompt à envoyer** :

```text
Configurer SonarCloud pour siniko : sonar-project.properties, secret GitHub, variable ENABLE_SONAR=true, documenter dans README. Quality Gate doit passer sur main.
```

---

### P6-02 — Activer Snyk (optionnel)

**Branche** : `chore/P6-02-snyk`

**Prompt à envoyer** :

```text
Activer Snyk dans la CI (ENABLE_SNYK, SNYK_TOKEN). Documenter dans docs/devsecops-workflow.md. Ne pas fail la CI si quota Snyk dépassé — proposer fallback pip-audit/npm audit.
```

---

### P6-03 — Workflow OWASP ZAP (DAST)

**Branche** : `chore/P6-03-zap-dast`

**Prompt à envoyer** :

```text
Ajouter un workflow GitHub Actions zap-baseline.yml déclenché manuellement ou sur schedule, ciblant l’URL de staging (variable ZAP_TARGET_URL). Documenter interprétation des alertes dans docs/.
```

---

### P6-04 — Dependabot : auto-merge ou groupement

**Branche** : `chore/P6-04-dependabot`

**Prompt à envoyer** :

```text
Revoir dependabot.yml : grouper les mises à jour mineures, ignorer les PR qui cassent la CI. Documenter la politique de mise à jour des dépendances pour le rapport de stage.
```

---

## Phase 7 — AWS & IaC

### P7-01 — Terraform VPC + RDS

**Branche** : `feat/P7-01-tf-vpc-rds`

**Prompt à envoyer** :

```text
Terraform : modules VPC (public/privé), security groups, RDS PostgreSQL (siniko), Secrets Manager pour DATABASE_URL. Checkov doit passer. Pas de ECS encore. Documenter dans infra/terraform/README.md.
```

---

### P7-02 — ECS Fargate + ALB

**Branche** : `feat/P7-02-tf-ecs`

**Prompt à envoyer** :

```text
Terraform : ECR ou GHCR, ECS Fargate services backend + frontend, ALB, target groups, healthcheck /health. IAM moindre privilège.
```

---

### P7-03 — CD GitHub Actions → AWS

**Branche** : `feat/P7-03-cd-aws`

**Prompt à envoyer** :

```text
Activer cd.yml : build push image, deploy ECS sur tag v* ou workflow_dispatch. Secrets AWS documentés. Pas de secrets en clair.
```

---

## Phase 8 — Supervision

### P8-01 — Logs JSON + champs sécurité CloudWatch

**Branche** : `feat/P8-01-cloudwatch-logs`

**Prompt à envoyer** :

```text
Configurer log driver / agrégation CloudWatch pour ECS. Metric filter sur status_code 401/403/5xx sur /api/v1/auth/login. Alarme SNS ou email (variable). Documenter dans docs/supervision.md.
```

---

### P8-02 — Règles alerte Grafana (local)

**Branche** : `feat/P8-02-grafana-alerts`

**Prompt à envoyer** :

```text
Ajouter règles d’alerte Loki/Grafana : brute force (401 login), pic 5xx. Fichiers provisioning dans monitoring/. Procédure de test documentée.
```

---

### P8-03 — Wazuh sur AWS amd64 (option CDC)

**Branche** : `feat/P8-03-wazuh-aws`

**Prompt à envoyer** :

```text
Documenter et fournir docker-compose ou Terraform optionnel pour Wazuh sur ECS amd64 uniquement (pas Mac ARM). Forward logs CloudWatch. Comparer avec Loki dans le rapport.
```

---

## Phase 9 — Tests offensifs & rapport

### P9-01 — Scénarios OWASP Top 10

**Branche** : `docs/P9-01-pentest-scenarios`

**Prompt à envoyer** :

```text
Rédiger docs/pentest-scenarios.md : 10 scénarios alignés OWASP Top 10 pour SINIKO (injection, broken auth, IDOR élèves/notes, etc.). Format : objectif, étapes, résultat attendu, preuve.
```

---

### P9-02 — Exécution ZAP + remédiation

**Branche** : `fix/P9-02-zap-findings`

**Prompt à envoyer** :

```text
Exécuter OWASP ZAP baseline sur l’environnement de démo. Pour chaque finding High/Medium : corriger le code ou documenter le risque accepté. Mettre à jour docs/pentest-report.md (template).
```

---

### P9-03 — Modèle de menaces (STRIDE léger)

**Branche** : `docs/P9-03-threat-model`

**Prompt à envoyer** :

```text
Créer docs/threat-model.md : acteurs, actifs (données élèves, notes, paiements), diagramme de flux, menaces STRIDE, contre-mesures liées aux contrôles DevSecOps déjà en place.
```

---

## Phase 10 — Optionnels

| ID | Sujet | Prompt résumé |
|----|--------|----------------|
| P10-01 | Mobile Money | Intégration Orange/Moov — uniquement si client confirme |
| P10-02 | Carte scolaire PDF | GET /students/{id}/card |
| P10-03 | Photo élève | Upload sécurisé, validation MIME, taille max |
| P10-04 | Multi-établissement | school_id tenant sur toutes les tables |
| P10-05 | Redis | Rate limit + cache si justifié |

---

## Index rapide des prompts

| ID | Titre |
|----|--------|
| P0-03 | CI verte sur main |
| P1-01 → P1-07 | Auth complet |
| P2-01 → P2-05 | Élèves |
| P3-01 → P3-05 | Notes |
| P4-01 → P4-04 | Compta MVP |
| P5-01 → P5-06 | Frontend |
| P6-01 → P6-04 | DevSecOps+ |
| P7-01 → P7-03 | AWS |
| P8-01 → P8-03 | Supervision |
| P9-01 → P9-03 | Pentest & doc |
| P10-xx | Optionnels |

---

## Prochain prompt recommandé

**P0-03** (si CI encore rouge) puis **P1-01**.

Copiez le bloc « Prompt à envoyer » dans le chat Cursor.

---

## Liens documentation

- [workflow-dev.md](workflow-dev.md)
- [devsecops-workflow.md](devsecops-workflow.md)
- [github-branch-protection.md](github-branch-protection.md)
- [demarrage.md](demarrage.md)
- [architecture.md](architecture.md)
- [supervision.md](supervision.md)

---

*Document vivant — ajoutez vos prompts utilisateur en fin de fichier.*

### Mes prompts additionnels

<!-- Exemple :
#### PX-01 — Titre
**Prompt à envoyer** : ...
-->
