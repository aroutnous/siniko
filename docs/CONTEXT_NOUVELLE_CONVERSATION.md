# KALANKO — Contexte pour nouvelle conversation IA

> Coller ce fichier en début de conversation pour reprendre le projet sans perte de contexte.
> Dernière mise à jour : juin 2026.

---

## 1. Description projet (5 lignes)

KALANKO est une plateforme SaaS multi-tenant de gestion scolaire pour établissements maliens (préscolaire et fondamental). Chaque établissement (tenant) dispose de son espace isolé : élèves, enseignants, pédagogie, finance, reporting. L'administration globale est réservée au `platform_owner`. Approche DevSecOps Shift Left : sécurité intégrée (RLS, permissions granulaires, audit, CI).

---

## 2. Stack technique

- **Backend** : FastAPI 3.12, SQLAlchemy, Alembic, Pydantic, slowapi (rate limit Redis)
- **Frontend** : React 18, Vite, TypeScript, TailwindCSS, shadcn/ui, Zustand, TanStack Query, Axios
- **BDD** : PostgreSQL 16 + Row Level Security (`app.current_tenant`)
- **Cache** : Redis 7 (sessions rate limit)
- **Auth** : JWT HS256 (15 min), bcrypt cost=12, sessions hashées
- **Infra** : Docker Compose (dev), Terraform (infra/ — AWS prévu)
- **CI/CD** : GitHub Actions — Gitleaks, Bandit, Semgrep, Safety, npm audit, Trivy
- **Tests** : pytest backend (~95 tests), pas de suite E2E frontend automatisée

---

## 3. État d'avancement par module

| Module | Backend | Frontend | Tests | Notes |
|--------|---------|----------|-------|-------|
| M1 Auth & Accès | ✅ Complet | ✅ Complet | ✅ test_auth, test_permissions | Login slug, platform owner, permissions dynamiques |
| M2 Établissement | ✅ Complet | ✅ Complet | ✅ test_etablissement | Migration 009 : classes=niveau, salles=division ; wizard 7 étapes |
| M3 Élèves | ✅ Complet | ✅ Complet | ✅ test_eleve | Inscription, dossier, absences, documents PDF |
| M4 Pédagogie | ✅ Complet | ✅ Complet | ✅ test_pedagogie | Notes batch, bulletins, résultats |
| M5 Finance | ✅ Complet | ✅ Complet | ✅ test_finance | Paiements immuables, caisse, webhook Mobile Money |
| M6 Reporting | ✅ Complet | ✅ Complet | ✅ test_reporting | KPIs, exports, impressions PDF |
| Enseignants | ✅ Complet | ✅ Complet | ✅ test_enseignant | CRUD + affectations matières/salles |
| Platform | ✅ Complet | ✅ Complet | ✅ test_platform | Tenants, plans, abonnements, factures, valeurs système |
| Infra prod | 🟡 Partiel | — | — | Terraform présent, deploy staging/prod commenté en CI |

**V1 fonctionnelle** : tous les modules métier listés sont implémentés côté API et UI tenant + platform.

---

## 4. Architecture clés

### Multi-tenant

```
JWT (sub, tenant_id) → TenantMiddleware → request.state.tenant_id
→ get_db() → SET app.current_tenant → RLS PostgreSQL
```

- Toute table métier a `tenant_id` (UUID).
- `utilisateurs` : **pas de RLS** (isolation applicative).
- `valeurs_systeme`, `plans_abonnement` : globales sans tenant.

### Permissions dynamiques

- Table `utilisateur_permissions` (tenant_id, utilisateur_id, permission).
- Enum `Permission` : **44 valeurs** dans `backend/app/models/enums.py`.
- `PermissionService` : promoteur = bypass `*`, platform_owner = `platform.admin` seul.
- Décorateur `require_permission()` sur chaque endpoint sensible.
- Frontend : `authStore.fetchPermissions()` → `hasPermission()` + hooks `useMenuAccess`, etc.

### Sémantique établissement (post-009)

| Concept | Table | Ancien nom |
|---------|-------|------------|
| Niveau scolaire (1ère Année…) | `classes` | `niveaux` |
| Division physique (Salle A…) | `salles` | `classes` |
| Inscription élève | `inscriptions.classe_id` → **salles.id** | — |

---

## 5. Décisions architecturales importantes

| Décision | Justification |
|----------|---------------|
| RLS PostgreSQL + tenant_id | Isolation forte même en cas de bug applicatif |
| Permissions par utilisateur (pas par rôle seul) | Flexibilité fine (secrétaire vs comptable) |
| Promoteur bypass permissions | Propriétaire établissement = contrôle total |
| Paiements immuables | Conformité comptable, traçabilité |
| Routes établissement sans préfixe `/etablissement` | Historique API ; frontend utilise `/etablissement/*` |
| Login URL dédiée `/login/:slug` | UX multi-tenant, header `X-Tenant-Slug` |
| `GET /auth/tenant/{slug}` public | Branding login sans JWT |
| Valeurs système globales | Seed cycles/classes/périodes standardisés Mali |
| Wizard POST `/wizard` atomique | Configuration initiale en une transaction |
| `CyclesPage` non routée | Cycles gérés via wizard ; page orpheline |

---

## 6. Refactorings majeurs effectués

1. **Permissions dynamiques** (migrations 004–005) : remplacement logique rôle-only.
2. **Module enseignants** (migration 006) : tables + API + UI.
3. **Platform** (migration 007) : statut abonnement `resilie`, notifications émetteur.
4. **Valeurs système** (migration 008) : table + seed + UI platform.
5. **Renommage établissement** (migration 009) : niveaux→classes, classes→salles ; refactor complet backend + frontend.
6. **Navigation établissement** : sidebar unique + `EtablissementLayout` à 7 onglets.
7. **EstablishmentManager** : permission `etablissement.configurer` (plus `classes.gerer`).
8. **DELETE périodes / années scolaires** : endpoints + UI.
9. **Middleware tenant** : chemins publics `/auth/tenant/*` via `_is_public_path()`.

---

## 7. Diagrammes

| Diagramme | Emplacement | État |
|-----------|-------------|------|
| Architecture globale | — | **Absent** — à créer si besoin |
| ERD base de données | `backend/docs/ARCHITECTURE.md` §3 | **À jour** (texte) |
| Flux auth multi-tenant | — | **À créer** |
| Fichiers .mmd/.puml | Aucun dans le repo | — |

Seuls favicon/vite.svg présents comme assets graphiques.

---

## 8. Migrations Alembic (001→009)

| # | ID | Contenu |
|---|-----|---------|
| 001 | `001_initial` | Schéma complet + ENUMs + RLS 21 tables |
| 002 | `002_audit_nullable` | audit_logs.tenant_id nullable |
| 003 | `003_finance_statut` | statut_paiement enum, contrainte unique paiements |
| 004 | `004_utilisateur_permissions` | Table permissions + RLS + seed |
| 005 | `005_update_permissions` | Reset référentiel permissions |
| 006 | `006_enseignants` | Enseignants + affectations + RLS |
| 007 | `007_platform_resilie` | Abonnement resilie, emetteur_id notifications |
| 008 | `008_valeurs_systeme` | Valeurs système + seed Mali |
| 009 | `009_renommage_etablissement` | classes/salles renommage + FK inscriptions |

Commande : `cd backend && alembic upgrade head`

---

## 9. Prochaines actions prioritaires

1. **Tests** : couvrir `GET /auth/tenant/{slug}` (endpoint public récent).
2. **Nettoyage** : supprimer ou router `CyclesPage.tsx` (orpheline).
3. **CI** : activer deploy staging + ZAP DAST quand infra prête.
4. **Documentation** : diagrammes ERD/flux auth (optionnel).
5. **E2E** : Playwright/Cypress pour parcours login + wizard.
6. **Production** : secrets AWS, HTTPS, désactivation `/docs`.

---

## 10. Règles permanentes du projet

Voir `.cursorrules` — résumé :

1. Jamais de SQL brut (ORM SQLAlchemy uniquement).
2. Jamais de secrets en dur (variables d'environnement).
3. Validation Pydantic sur toutes les entrées API.
4. `@require_permission` sur endpoints sensibles.
5. **Toujours** filtrer `tenant_id` sur tables métier.
6. Mots de passe bcrypt cost=12.
7. JWT expire 15 minutes.
8. Logger actions sensibles dans `audit_logs`.
9. Pas de stack traces en production.
10. Paiements : pas de UPDATE/DELETE métier.

Conventions : Python snake_case + type hints ; TS camelCase + interfaces ; commits `feat/fix/sec/chore/docs`.

---

## 11. Informations pratiques

### URLs (Docker Compose)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:80 |
| API | http://localhost:8000 |
| Swagger (dev) | http://localhost:8000/docs |
| Adminer | http://localhost:8080 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### Credentials dev (docker-compose)

- DB : `kalanko` / user `kalanko_user` / pass `kalanko_dev_password`
- `DATABASE_URL` : `postgresql://kalanko_user:kalanko_dev_password@db:5432/kalanko`

### Credentials tests (pytest conftest)

- Mot de passe test : `Password123!`
- Tenant slug généré : `ecole-test-{uuid8}`
- Email : `directeur@ecole-test.ml` (variable selon fixture)

### Variables d'environnement critiques

```
DATABASE_URL, REDIS_URL, JWT_SECRET
JWT_EXPIRE_MINUTES=15
ALLOWED_ORIGINS=http://localhost:5173
VITE_API_URL=http://localhost:8000  # frontend
MOBILE_MONEY_WEBHOOK_SECRET
```

### Commandes

```bash
# Stack complète
docker compose up -d

# Backend local
cd backend && alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Tests backend
cd backend && pytest tests/ -v

# Frontend local
cd frontend && npm run dev    # :5173
cd frontend && npm run build
```

### Fichiers documentation

- `backend/docs/ARCHITECTURE.md` — doc technique backend complète
- `frontend/docs/ARCHITECTURE.md` — doc technique frontend complète
- Ce fichier — contexte IA

### Structure routers API

| Préfixe | Fichier |
|---------|---------|
| `/auth` | `routers/auth.py` |
| racine (cycles, classes, salles, wizard…) | `routers/etablissement.py` |
| `/eleves` | `routers/eleve.py` |
| `/enseignants` | `routers/enseignant.py` |
| `/pedagogie` | `routers/pedagogie.py` |
| `/finance` | `routers/finance.py` |
| `/reporting` | `routers/reporting.py` |
| `/platform` | `routers/platform.py` |

### Rôles utilisateurs

`platform_owner`, `promoteur`, `directeur`, `secretaire`, `comptable`

### Permissions (44)

Groupes : Établissement (2), Élèves (3), Enseignants (2), Classes (2), Absences (2), Pédagogie (6), Paiements (5), Finance (8), Documents (7), Rapports (4), Utilisateurs (2), Platform (1).

Liste complète : `backend/app/models/enums.py` + `frontend/src/lib/permissions.ts`

### Routes frontend clés

- Login générique : `/login`
- Login tenant : `/login/:slug`
- Platform : `/admin` → `/platform/*`
- Établissement : `/etablissement/*` (wizard, années, périodes, classes, salles, matières, notation)
- Legacy redirects : `/classes` → `/etablissement/classes`, `/reporting/*` → `/rapports`

### Fichiers récemment modifiés (contexte session)

- `backend/app/middleware/tenant.py` — PUBLIC_PATHS + `_is_public_path()`
- `backend/app/routers/auth.py` — GET `/auth/tenant/{slug}`
- `backend/app/routers/etablissement.py` — DELETE périodes/années, EstablishmentManager
- `frontend/src/router.tsx` — routes imbriquées établissement
- `frontend/src/components/layout/AppLayout.tsx` — menu établissement unique
- `frontend/src/components/etablissement/EtablissementLayout.tsx` — 7 onglets
- `frontend/src/pages/auth/LoginPage.tsx`, `LoginPageGeneric.tsx`

### Points d'attention pour l'IA

- Ne pas confondre **Classe** (niveau) et **Salle** (division physique).
- API legacy : `/niveaux` → classes, `/divisions` → salles (deprecated).
- `inscriptions.classe_id` pointe vers `salles.id`.
- Permission config établissement : `etablissement.configurer` (pas `classes.gerer`).
- `platform_owner` ne doit pas accéder aux routes tenant (redirect automatique).
- Build frontend : `npm run build` ne doit pas être cassé par les changements doc.

---

*Fin du contexte — ~200 lignes. Référencer `backend/docs/ARCHITECTURE.md` et `frontend/docs/ARCHITECTURE.md` pour le détail exhaustif.*
