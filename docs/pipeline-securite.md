# Pipeline de vérification sécurité — SINIKO

Ce document explique **l’objectif**, le **moment d’exécution** et la **valeur** de chaque étape de la chaîne DevSecOps du projet, du poste de développement jusqu’à la production.

Alignement : CDC HESTIM, OWASP Top 10, approche **shift left** (sécurité le plus tôt possible).

---

## Vue d’ensemble

```text
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ 1. Code      │ → │ 2. CI        │ → │ 3–5. Analyse │ → │ 6–8. Build   │ → │ 9. Supervision│
│    source    │   │    GitHub    │   │    code &    │   │    & déploi  │   │    runtime    │
│ + pre-commit │   │    Actions   │   │    deps      │   │              │   │               │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
     LOCAL              CLOUD              CLOUD              CLOUD              PROD
```

| Couche | Question répondue |
|--------|-------------------|
| **pre-commit** | « Est-ce que je m’apprête à committer un secret ou un Dockerfile dangereux ? » |
| **CI (PR)** | « Ce code et ces dépendances sont-ils sûrs et testés avant merge ? » |
| **IaC** | « L’infrastructure AWS est-elle configurée selon les bonnes pratiques ? » |
| **Runtime** | « L’application en prod se comporte-t-elle normalement ? Y a-t-il des attaques ? » |

---

## Étape 0 — Développement assisté par IA (vibe coding)

| | |
|--|--|
| **Outils** | Cursor, modèle IA |
| **Objectif** | Accélérer l’écriture du code métier et des tests |
| **Risque couvert** | Code incomplet, patterns non sécurisés, dépendances suggérées sans audit, secrets copiés-collés |
| **Contrôle** | **Relecture humaine obligatoire** — l’IA n’est pas une validation sécurité |
| **Livrable stage** | Mentionner dans le rapport ce qui a été généré vs validé manuellement |

L’IA **ne remplace aucune** étape ci-dessous ; elle augmente le débit, d’où l’intérêt d’automatiser les contrôles suivants.

---

## Étape 1 — Gestion du code source

| | |
|--|--|
| **Outils** | Git, GitHub (`aroutnous/siniko`) |
| **Objectif** | Versionner le code, tracer les changements, collaborer via **Pull Requests** |
| **Sécurité** | Historique auditable ; revue de code sur PR ; pas de push direct non contrôlé sur `main` (branch protection) |
| **Quand** | Chaque modification |
| **Bonnes pratiques SINIKO** | Branches `feat/*`, commits conventionnels, `.env` jamais commité (`.gitignore`) |

**Pourquoi c’est dans la pipeline sécurité ?**  
Sans versioning et PR, on ne peut pas lier un incident à un changement ni appliquer une CI bloquante avant merge.

---

## Étape 2 — Intégration continue (CI)

| | |
|--|--|
| **Outil** | GitHub Actions (workflows `.github/workflows/*.yml`) |
| **Objectif** | Exécuter **automatiquement** les contrôles à chaque `push` et chaque **Pull Request** |
| **Sécurité** | Même barrière pour tous les contributeurs ; pas de merge sur `main` si check **CI — gate** requis (repo public) |
| **Quand** | Push sur branche feature, PR vers `main`, push sur `main` après merge |
| **Workflow principal** | `ci.yml` — **CI DevSecOps** |

**Pourquoi ?**  
Le poste de dev peut être mal configuré ; la CI garantit un minimum identique pour tout le monde.

---

## Étape 3 — Analyse du code & qualité (SAST)

**SAST** = *Static Application Security Testing* : analyse du **code source sans l’exécuter**.

### 3a. Semgrep (CI)

| | |
|--|--|
| **Fichier** | `.github/workflows/ci.yml` — job `SAST (Semgrep OWASP)` |
| **Objectif** | Détecter des patterns de vulnérabilités connues (injection, mauvaise crypto, etc.) |
| **Règles** | `p/owasp-top-ten`, `p/python`, `p/typescript` |
| **OWASP** | A03 Injection, A02 Cryptographic Failures, A01 Broken Access Control (selon règles) |
| **Bloque** | Merge si findings de sévérité configurée en erreur |
| **Ne remplace pas** | Revue manuelle ni tests fonctionnels |

### 3b. Ruff + Bandit (CI backend + pre-commit)

| Outil | Objectif |
|-------|----------|
| **Ruff** | Style, erreurs Python, certaines règles de sécurité (imports, syntaxe) |
| **Bandit** | Patterns Python risqués (`eval`, `pickle`, SQL brut, etc.) |

### 3c. ESLint + TypeScript (CI frontend)

| | |
|--|--|
| **Objectif** | Qualité JS/TS, règles recommandées React, détection de patterns dangereux côté client |
| **Sécurité** | Réduit les failles côté front (XSS facilité, `dangerouslySetInnerHTML`, etc.) |

### 3d. SonarCloud (CI, optionnel)

| | |
|--|--|
| **Activation** | Secret `SONAR_TOKEN` + variable `ENABLE_SONAR=true` |
| **Objectif** | Qualité globale, duplications, **Security Hotspots**, couverture |
| **Intérêt stage** | Métrique « Quality Gate passed » pour le rapport et la soutenance |

---

## Étape 4 — Scan des dépendances (SCA)

**SCA** = *Software Composition Analysis* : 80 % des failles viennent souvent des **bibliothèques tierces**.

| Outil | Où | Objectif |
|-------|-----|----------|
| **pip-audit** | CI backend | CVE connues dans `requirements.txt` (Python) |
| **npm audit** | CI frontend (via install) | CVE dans l’écosystème npm |
| **Dependabot** | GitHub (`.github/dependabot.yml`) | PR automatiques de mise à jour des deps |
| **Snyk** | CI (optionnel) | SCA avancé si `SNYK_TOKEN` + `ENABLE_SNYK=true` |

| | |
|--|--|
| **Risque couvert** | Log4Shell-style, paquets abandonnés avec CVE Critical/High |
| **Bloque** | CI si seuil High/Critical (selon config job) |
| **Limite** | Ne voit pas les vulnérabilités **dans votre code métier** → complété par SAST |

---

## Étape 5 — Sécurité des conteneurs & images

| Outil | Où | Objectif |
|-------|-----|----------|
| **Hadolint** | pre-commit + CI | Vérifier que les `Dockerfile` suivent les bonnes pratiques (user non-root si possible, pas de `latest` aveugle, etc.) |
| **Trivy** | CI | Scanner l’image Docker **backend** buildée en CI : CVE OS (Alpine/Debian) + paquets installés |
| **Build Docker** | CI | S’assurer que l’image est **reproductible** avant push registre |

| | |
|--|--|
| **Risque couvert** | Image avec OpenSSL vulnérable, base image obsolète, configuration Docker laxiste |
| **Bloque** | CI sur CVE **Critical/High** non corrigées (config Trivy `exit-code: 1`) |
| **SINIKO** | Images `siniko-backend`, `siniko-frontend` — Mac ARM64 en local, CI sur `ubuntu-latest` amd64 |

---

## Étape 6 — Registre d’artefacts

| | |
|--|--|
| **Outils prévus** | GHCR (GitHub Container Registry), **ECR** (AWS, phase déploiement) |
| **Objectif** | Stocker uniquement des images **déjà scannées** par la CI ; traçabilité version ↔ commit |
| **Sécurité** | Pas de build manuel « sur le serveur » ; pas d’image non versionnée en prod |
| **Quand** | Après merge sur `main` / tag `v*` (workflow CD, phase 7) |

**Pourquoi ?**  
Évite de déployer une image locale jamais passée par Trivy.

---

## Étape 7 — Déploiement continu (CD)

| | |
|--|--|
| **Outils prévus** | Terraform, ECS Fargate, ALB, ACM (HTTPS) |
| **Fichier** | `.github/workflows/cd.yml` (activé plus tard) |
| **Objectif** | Déployer de façon **reproductible** la même image validée en CI |
| **Sécurité** | Séparation dev/prod ; secrets dans **AWS Secrets Manager**, pas dans le code |
| **Pas encore actif** | Variable `AWS_DEPLOY_ENABLED` — phase 7 du roadmap |

---

## Étape 8 — Gestion des secrets

| Contexte | Outil / méthode | Objectif |
|----------|-----------------|----------|
| **Dépôt Git** | **gitleaks** (pre-commit + CI) | Empêcher commit de clés API, mots de passe, tokens |
| **Runtime local** | `.env` (gitignored), `.env.example` sans secrets réels | Config dev sans fuite |
| **CI/CD** | GitHub **Secrets** (`SONAR_TOKEN`, `AWS_*`, etc.) | Credentials hors du code |
| **Production AWS** | **Secrets Manager** | `DATABASE_URL`, `JWT_SECRET_KEY`, clés tierces |

| | |
|--|--|
| **OWASP** | A02 Cryptographic Failures, A07 Identification and Authentication Failures |
| **Règle d’or** | Jamais de secret en dur dans `backend/` ou `frontend/` |

**HashiCorp Vault / SOPS** : hors scope MVP ; Secrets Manager suffit pour le stage.

---

## Étape 9 — Supervision, logs & sécurité (runtime)

Objectif global : **détecter** les comportements anormaux **en production** (ou en local pour la démo), pas seulement avant le déploiement.

### 9a. Logs applicatifs structurés (backend)

| | |
|--|--|
| **Outil** | `structlog` → JSON (`event`, `status_code`, `path`, `method`) |
| **Objectif** | Permettre recherche et alertes (brute force, erreurs 5xx) |
| **Fichier** | `backend/app/core/logging.py` |

### 9b. Loki + Grafana + Promtail (local)

| Composant | Objectif |
|-----------|----------|
| **Promtail** | Collecter les logs des conteneurs Docker |
| **Loki** | Stocker et indexer les logs |
| **Grafana** | Dashboards + alertes (ex. pics de 401 sur login) |

| | |
|--|--|
| **Pourquoi pas Wazuh en local ?** | Images Wazuh non adaptées Mac ARM64 — Wazuh optionnel sur **ECS amd64** |
| **Doc** | [supervision.md](supervision.md) |

### 9c. CloudWatch (production AWS)

| | |
|--|--|
| **Objectif** | Centraliser logs ECS/RDS ; **metric filters** ; alarmes (brute force, disponibilité) |
| **Phase** | P8 du roadmap |

### 9d. Wazuh (optionnel, prod amd64)

| | |
|--|--|
| **Objectif** | SIEM : corrélation d’événements, règles communautaires, détection d’intrusion |
| **Alternative livrable** | Loki + CloudWatch documentés comme équivalent fonctionnel |

---

## Outils transversaux (toute la chaîne)

| Outil | Type | Objectif | Quand (SINIKO) |
|-------|------|----------|----------------|
| **Terraform** | IaC | Décrire l’infra AWS en code versionné | Phase 7 |
| **Checkov** | IaC scan | Détecter SG ouverts, S3 public, RDS non chiffré, etc. | CI `iac.yml` sur `infra/**` |
| **Hadolint** | Conteneur | Lint Dockerfile | pre-commit + CI |
| **gitleaks** | Secrets | Scan Git | pre-commit + CI |
| **Semgrep** | SAST | Patterns vulnérabilités | CI |
| **OWASP ZAP** | DAST | Tester l’app **en marche** (HTTP réel) | Phase 6/9, post-déploiement |
| **Burp Suite** | DAST manuel | Scénarios complexes, validation rapport | Phase 9 |

**DAST vs SAST** :

| | SAST (Semgrep) | DAST (ZAP) |
|--|----------------|------------|
| **Cible** | Code source | Application déployée |
| **Exemple détecté** | Requête SQL concaténée | Cookie sans `Secure`, IDOR sur URL |

---

## pre-commit — barrière avant le commit (shift left maximal)

Exécuté **sur votre Mac**, uniquement sur les fichiers **stagés** (`git add`), sauf `pre-commit run --all-files`.

| Hook | Objectif | Bloque `git commit` ? |
|------|----------|------------------------|
| **gitleaks** | Secrets dans le commit | Oui |
| **hadolint** | Dockerfile modifiés | Oui |
| **ruff** | Python modifié dans `backend/` | Oui |
| **ruff-format** | Formatage Python | Oui |

| | |
|--|--|
| **Ne bloque pas** | `git push` ni merge GitHub |
| **Complément** | `pre-commit run --all-files` avant une grosse PR |

---

## Job « CI — gate » — porte finale

| | |
|--|--|
| **Rôle** | Agréger les jobs obligatoires ; échoue si l’un d’eux échoue |
| **Jobs requis** | gitleaks, backend-quality, frontend-quality, semgrep, docker-security |
| **Branch protection** | C’est ce check qu’il faut cocher sur `main` (**repo public**) |
| **Objectif** | Un seul statut GitHub clair : **merge autorisé ou non** |

---

## Tableau récapitulatif — OWASP Top 10 ↔ contrôles

| Risque OWASP (2021) | Contrôles SINIKO |
|---------------------|------------------|
| A01 Broken Access Control | RBAC (prompts P1), tests, ZAP IDOR |
| A02 Cryptographic Failures | bcrypt, JWT, HTTPS/ALB, secrets Manager |
| A03 Injection | SQLAlchemy ORM, Pydantic, Semgrep |
| A04 Insecure Design | Threat model (P9), revue PR |
| A05 Security Misconfiguration | Hadolint, Checkov, durcissement Docker |
| A06 Vulnerable Components | pip-audit, npm audit, Snyk, Dependabot, Trivy |
| A07 Auth Failures | Login, rate limit, logs 401, CloudWatch |
| A08 Software/Data Integrity | CI, images versionnées, GHCR/ECR |
| A09 Logging Failures | structlog, Loki, CloudWatch |
| A10 SSRF | Peu pertinent MVP ; Semgrep si endpoints externes |

---

## Ordre chronologique pour un développeur SINIKO

```text
1. Coder (IA + relecture)
2. git add / commit        → pre-commit (gitleaks, hadolint, ruff)
3. git push + PR         → CI (Semgrep, tests, Trivy, …)
4. Merge si CI — gate ✅  → (plus tard) build image → ECR
5. Terraform apply       → Checkov
6. Deploy ECS            → CloudWatch / Grafana
7. ZAP baseline          → rapport pentest
```

---

## Liens

- [devsecops-workflow.md](devsecops-workflow.md) — configuration pratique
- [prompts-granulaires.md](prompts-granulaires.md) — prompts par phase
- [github-branch-protection.md](github-branch-protection.md) — bloquer merge si CI rouge
- [workflow-dev.md](workflow-dev.md) — boucle Git quotidienne

---

*Document de référence pour le rapport de stage — section « Chaîne DevSecOps ».*
