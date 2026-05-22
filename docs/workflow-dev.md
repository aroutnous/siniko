# Workflow de développement — SINIKO

## Boucle quotidienne (granulaire)

```text
1. Prompt granulaire (vous)     →  une fonctionnalité / concept / sous-module
2. Génération + intégration (IA) →  code minimal, tests si pertinent
3. Vérification (vous)        →  Docker + tests manuels / Swagger / pgAdmin
4. Correction (si besoin)       →  nouveau prompt plus précis
5. Commit (vous)                →  pre-commit LOCAL (gitleaks, hadolint, ruff)
6. Push branche feature         →  CI GitHub sur la branche
7. Pull Request                 →  CI complète + relecture
8. Merge main                   →  CI sur main, image prête pour CD (plus tard)
```

## Qui fait quoi ?

| Étape | Où | Déclencheur |
|-------|-----|-------------|
| **pre-commit** | Votre Mac | `git commit` |
| **CI GitHub** | GitHub Actions | `git push` ou ouverture/mise à jour **PR** |
| **CD AWS** | GitHub Actions | Tag ou workflow manuel (phase ultérieure) |

Le pre-commit **ne remplace pas** la CI : il bloque tôt (secrets, Dockerfiles) ; la CI ajoute Semgrep, Snyk, Trivy, SonarCloud, pytest, etc.

## Branches recommandées

```bash
git checkout -b feat/auth-login-jwt
# … travail …
git add .
git commit -m "feat(auth): endpoint login JWT"
git push -u origin feat/auth-login-jwt
gh pr create   # ou via l’interface GitHub
```

- **`main`** : protégée, merge uniquement si CI verte  
- **`feat/*`** : une branche par prompt / fonctionnalité  

## Vérification en mode 100 % Docker

Après chaque changement :

```bash
docker compose up -d --build backend    # ou frontend, ou tout
# Migrations Alembic : automatiques au démarrage de siniko-backend
curl http://localhost:8000/health
# Tests API : http://localhost:8000/docs
# UI : http://localhost:8080
# SQL : http://localhost:5050 (pgAdmin)
```

Tests automatisés (optionnel en local avant commit) :

```bash
docker compose exec backend pytest
# ou depuis backend/ avec venv si vous préférez
```

## Règle vibe coding

Code généré → **vous validez** le comportement → commit avec message clair → PR.  
Documenter dans le rapport de stage ce qui a été généré vs relu manuellement.
