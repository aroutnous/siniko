# KALANKO — Architecture Backend

## 1. Vue d'ensemble

**KALANKO** est une plateforme SaaS multi-tenant de gestion scolaire pour les établissements maliens (préscolaire et fondamental).

### Stack technique

| Couche | Technologie |
|--------|-------------|
| API | FastAPI (Python 3.12) |
| ORM | SQLAlchemy 2.x |
| Migrations | Alembic |
| Base de données | PostgreSQL 16 + Row Level Security (RLS) |
| Cache / rate limit | Redis 7 |
| Auth | JWT (HS256) + sessions hashées en base |
| Mots de passe | bcrypt (cost=12) |
| Tests | pytest + httpx AsyncClient |
| Conteneurs | Docker + Docker Compose |

### Architecture multi-tenant

1. Chaque table métier porte un `tenant_id` (UUID).
2. Le JWT contient `sub` (user) et `tenant_id`.
3. `TenantMiddleware` extrait le tenant du JWT et le place dans `request.state.tenant_id`.
4. `get_db()` appelle `set_config('app.current_tenant', ...)` pour activer le RLS PostgreSQL.
5. Politique RLS `tenant_isolation` : `tenant_id = current_setting('app.current_tenant')::uuid`.

### DevSecOps Shift Left

- Sécurité intégrée dès le code : ORM uniquement, validation Pydantic, permissions par endpoint.
- Pipeline CI : Gitleaks, Bandit, Semgrep, Safety, npm audit, Trivy.
- Pre-commit : détection de secrets, format YAML/JSON.
- Audit logs sur actions sensibles (services + middleware HTTP).
- Pas de stack traces exposées en production.

---

## 2. Structure des fichiers

```
backend/
├── Dockerfile
├── alembic.ini
├── pytest.ini
├── requirements.txt
├── alembic/
│   ├── env.py                 # Contexte Alembic + metadata SQLAlchemy
│   └── versions/              # Migrations 001 → 009
├── app/
│   ├── main.py                # FastAPI app, middlewares, routers
│   ├── core/
│   │   ├── config.py          # Settings Pydantic (variables d'environnement)
│   │   ├── database.py        # Engine, session, set_tenant_context (RLS)
│   │   ├── security.py        # JWT, bcrypt, require_permission
│   │   └── redis_client.py    # Client Redis
│   ├── middleware/
│   │   ├── tenant.py          # Extraction JWT → tenant_id (chemins publics)
│   │   └── audit.py           # Journalisation HTTP → audit_logs
│   ├── models/                # Modèles SQLAlchemy
│   ├── schemas/               # Schémas Pydantic (entrée/sortie API)
│   ├── routers/               # Endpoints FastAPI par module
│   └── services/              # Logique métier
└── tests/
    ├── conftest.py            # Fixtures DB, client HTTP, seed auth
    ├── establishment_helpers.py
    ├── permission_helpers.py
    └── test_*.py              # Tests par module (M1–M6, platform)
```

| Dossier | Rôle |
|---------|------|
| `core/` | Configuration, DB, sécurité transversale |
| `middleware/` | Tenant JWT + audit HTTP |
| `models/` | Tables PostgreSQL (ORM) |
| `schemas/` | Validation et sérialisation API |
| `services/` | Règles métier, audit domaine |
| `routers/` | Routage HTTP, dépendances permissions |
| `tests/` | Tests d'intégration (95 tests au dernier run) |

---

## 3. Base de données

### Tables principales et relations

```
tenants ──┬── utilisateurs ──┬── sessions
          │                  └── utilisateur_permissions
          ├── abonnements ── factures_tenants
          ├── cycles ── classes (niveaux) ──┬── matieres
          │                                 └── salles ── inscriptions ── eleves
          ├── annees_scolaires ──┬── periodes
          │                      └── salles
          ├── notes, bulletins ── bulletin_lignes
          ├── frais_scolaires, paiements, depenses, salaires, caisse_journaliere
          └── enseignants ── enseignant_matieres / enseignant_classes

valeurs_systeme (global, sans tenant_id)
plans_abonnement (global)
audit_logs (tenant_id nullable)
```

### Sémantique post-migration 009

| Ancien nom | Nouveau nom | Signification |
|------------|-------------|---------------|
| `niveaux` | `classes` | Niveau scolaire (ex. 1ère Année) |
| `classes` | `salles` | Division physique (ex. Salle A) |

### Tables avec RLS actif (25)

`abonnements`, `factures_tenants`, `notifications_plateforme`, `audit_logs`, `cycles`, `classes`, `salles`, `annees_scolaires`, `periodes`, `matieres`, `config_notation`, `eleves`, `inscriptions`, `absences`, `notes`, `bulletins`, `frais_scolaires`, `paiements`, `depenses`, `salaires`, `caisse_journaliere`, `utilisateur_permissions`, `enseignants`, `enseignant_matieres`, `enseignant_classes`

### Tables sans RLS

`tenants`, `plans_abonnement`, `utilisateurs` (isolation applicative), `sessions`, `reset_tokens`, `bulletin_lignes`, `valeurs_systeme`

### Historique des migrations

| # | Revision | Fichier | Description |
|---|----------|---------|-------------|
| 001 | `001_initial` | `001_initial_schema_rls.py` | Schéma initial + ENUMs + RLS sur 21 tables tenant |
| 002 | `002_audit_nullable` | `002_audit_logs_tenant_nullable.py` | `audit_logs.tenant_id` nullable |
| 003 | `003_finance_statut` | `003_finance_statut_paiement.py` | Enum `statut_paiement`, mode `cheque`, contrainte unique paiements |
| 004 | `004_utilisateur_permissions` | `004_utilisateur_permissions.py` | Table `utilisateur_permissions` + RLS + seed permissions |
| 005 | `005_update_permissions` | `005_update_permissions.py` | Reset permissions utilisateur (nouveau référentiel) |
| 006 | `006_enseignants` | `006_enseignants.py` | Tables enseignants + affectations + RLS |
| 007 | `007_platform_resilie` | `007_platform_resilie_notification_emetteur.py` | Statut abonnement `resilie`, `emetteur_id` sur notifications |
| 008 | `008_valeurs_systeme` | `008_valeurs_systeme.py` | Table `valeurs_systeme` + seed (cycles, classes, périodes, années) |
| 009 | `009_renommage_etablissement` | `009_renommage_etablissement.py` | Renommage niveaux→classes, classes→salles, colonnes associées |

---

## 4. Modèles SQLAlchemy

Tous héritent de `BaseModel` : `id` (UUID PK), `created_at`, `updated_at`.

### Platform (`models/tenant.py`)

| Modèle | Table | tenant_id | RLS |
|--------|-------|-----------|-----|
| `Tenant` | `tenants` | Non | Non |
| `PlanAbonnement` | `plans_abonnement` | Non | Non |
| `Abonnement` | `abonnements` | Oui | Oui |
| `FactureTenant` | `factures_tenants` | Oui | Oui |
| `NotificationPlateforme` | `notifications_plateforme` | Nullable | Oui |

### Auth (`models/auth.py`)

| Modèle | Table | tenant_id | RLS |
|--------|-------|-----------|-----|
| `Utilisateur` | `utilisateurs` | Oui (requis) | Non (app) |
| `UtilisateurPermission` | `utilisateur_permissions` | Oui | Oui |
| `Session` | `sessions` | Non | Non |
| `AuditLog` | `audit_logs` | Nullable | Oui |
| `ResetToken` | `reset_tokens` | Non | Non |

### Établissement (`models/etablissement.py`)

| Modèle | Table | Colonnes clés | RLS |
|--------|-------|---------------|-----|
| `Cycle` | `cycles` | nom, description, ordre | Oui |
| `Classe` | `classes` | cycle_id, nom, ordre, valeur_systeme_ref | Oui |
| `Salle` | `salles` | classe_id, annee_scolaire_id, nom, nom_salle, capacite | Oui |
| `AnneeScolaire` | `annees_scolaires` | libelle, dates, est_active | Oui |
| `Periode` | `periodes` | annee_scolaire_id, nom, dates, ordre | Oui |
| `Matiere` | `matieres` | classe_id, nom, coefficient, est_active | Oui |
| `ConfigNotation` | `config_notation` | note_max, note_passage, arrondi | Oui |

### Élèves (`models/eleve.py`)

| Modèle | Table | FK notables | RLS |
|--------|-------|-------------|-----|
| `Eleve` | `eleves` | matricule unique par tenant | Oui |
| `Inscription` | `inscriptions` | eleve_id, **classe_id→salles**, annee_scolaire_id | Oui |
| `Absence` | `absences` | eleve_id, classe_id→salles | Oui |

### Enseignants (`models/enseignant.py`)

| Modèle | Table | RLS |
|--------|-------|-----|
| `Enseignant` | `enseignants` | Oui |
| `EnseignantMatiere` | `enseignant_matieres` | Oui |
| `EnseignantClasse` | `enseignant_classes` | Oui (classe_id→salles) |

### Pédagogie (`models/pedagogie.py`)

| Modèle | Table | RLS |
|--------|-------|-----|
| `Note` | `notes` | Oui |
| `Bulletin` | `bulletins` | Oui |
| `BulletinLigne` | `bulletin_lignes` | Non (via bulletin) |

### Finance (`models/finance.py`)

| Modèle | Table | RLS |
|--------|-------|-----|
| `FraisScolaire` | `frais_scolaires` | Oui |
| `Paiement` | `paiements` | Oui (immuable — pas de UPDATE/DELETE métier) |
| `Depense` | `depenses` | Oui |
| `Salaire` | `salaires` | Oui |
| `CaisseJournaliere` | `caisse_journaliere` | Oui |

### Système (`models/valeur_systeme.py`)

| Modèle | Table | tenant_id | RLS |
|--------|-------|-----------|-----|
| `ValeurSysteme` | `valeurs_systeme` | Non | Non |

---

## 5. Système de permissions

### Architecture

- Permissions stockées dans `utilisateur_permissions` (granulaires, par utilisateur).
- Enum `Permission` dans `models/enums.py` (44 valeurs).
- `PermissionService` centralise lecture/écriture/vérification.
- Décorateur factory `require_permission()` dans `core/security.py`.

### Logique PermissionService

| Rôle | Comportement |
|------|--------------|
| `promoteur` | Bypass total (`verifier_permission` → toujours `True`, `get_permissions` → `["*"]`) |
| `platform_owner` | Uniquement `platform.admin` |
| Autres rôles | Permissions explicites en base ; `"*"` si toutes accordées |

### Liste des permissions (44)

| Permission | Description |
|------------|-------------|
| `etablissement.acceder` | Accéder au module établissement (lecture) |
| `etablissement.configurer` | Configurer structure, wizard, CRUD complet |
| `eleves.inscrire` | Inscrire des élèves |
| `eleves.dossiers` | Gérer les dossiers élèves |
| `eleves.consulter` | Consulter les élèves |
| `enseignants.consulter` | Consulter les enseignants |
| `enseignants.gerer` | CRUD enseignants et affectations |
| `classes.consulter` | Consulter classes/salles (legacy nommage) |
| `classes.gerer` | Gérer classes/salles |
| `absences.consulter` | Consulter les absences |
| `absences.gerer` | Enregistrer/justifier absences |
| `notes.saisir` | Saisir les notes |
| `notes.consulter` | Consulter les notes |
| `bulletins.generer` | Générer les bulletins |
| `bulletins.valider` | Valider les bulletins |
| `bulletins.publier` | Publier les bulletins |
| `resultats.consulter` | Consulter résultats de classe |
| `paiements.enregistrer` | Enregistrer paiements |
| `paiements.consulter` | Consulter paiements |
| `paiements.valider` | Valider paiements |
| `paiements.suivre_retard` | Suivre impayés |
| `paiements.historique` | Historique transactions |
| `frais.consulter` | Consulter frais scolaires |
| `frais.gerer` | Gérer frais scolaires |
| `salaires.consulter` | Consulter salaires |
| `salaires.gerer` | Gérer salaires |
| `depenses.consulter` | Consulter dépenses |
| `depenses.gerer` | Gérer dépenses |
| `caisse.consulter` | Consulter caisse |
| `caisse.gerer` | Gérer caisse |
| `documents.bulletins` | Imprimer bulletins |
| `documents.recus` | Imprimer reçus |
| `documents.cartes_scolaires` | Imprimer cartes scolaires |
| `documents.attestations` | Imprimer attestations |
| `documents.certificats` | Imprimer certificats |
| `documents.listes_classe` | Imprimer listes de classe |
| `documents.rapports` | Imprimer rapports |
| `statistiques.pedagogie` | Statistiques pédagogiques |
| `statistiques.finance` | Statistiques financières |
| `rapports.financiers` | Rapports financiers |
| `rapports.imprimer` | Impressions rapports |
| `utilisateurs.consulter` | Consulter utilisateurs tenant |
| `utilisateurs.gerer` | Gérer utilisateurs et permissions |
| `platform.admin` | Administration plateforme globale |

### Dépendances routers courantes

| Alias | Permissions |
|-------|-------------|
| `EstablishmentReader` | `etablissement.acceder` OU `classes.consulter` OU `classes.gerer` |
| `EstablishmentManager` | `etablissement.configurer` |
| `StudentsReader` | `eleves.consulter` OU `eleves.inscrire` OU `eleves.dossiers` |
| `StudentsWriter` | `eleves.inscrire` OU `eleves.dossiers` OU `absences.gerer` |
| `PlatformAdmin` | `platform.admin` |

---

## 6. Endpoints API

Préfixes routers : `/auth`, `/eleves`, `/enseignants`, `/pedagogie`, `/finance`, `/reporting`, `/platform`.
Établissement : **sans préfixe** (routes à la racine API).

Légende permissions : **Public** | **JWT** | **Permission** | **Alias** (voir §5)

### Auth (`/auth`)

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| GET | `/auth/tenant/{slug}` | Public | Infos publiques tenant (login dédié) |
| POST | `/auth/login` | Public (rate limit 5/10min) | Connexion multi-tenant |
| POST | `/auth/logout` | JWT | Déconnexion |
| POST | `/auth/refresh` | JWT | Renouvellement token |
| POST | `/auth/reset-password/request` | Public | Demande reset mot de passe |
| POST | `/auth/reset-password/confirm` | Public | Confirmation reset |
| GET | `/auth/me` | JWT | Profil utilisateur |
| GET | `/auth/me/permissions` | JWT | Permissions courantes |
| GET | `/auth/utilisateurs` | `utilisateurs.gerer` | Liste utilisateurs tenant |
| POST | `/auth/utilisateurs` | `utilisateurs.gerer` | Créer utilisateur |
| PUT | `/auth/utilisateurs/{id}` | `utilisateurs.gerer` | Modifier utilisateur |
| DELETE | `/auth/utilisateurs/{id}` | `utilisateurs.gerer` | Supprimer utilisateur |
| POST | `/auth/utilisateurs/{id}/reset-password` | `utilisateurs.gerer` | Reset MDP utilisateur |
| PUT | `/auth/utilisateurs/{id}/statut` | `utilisateurs.gerer` | Activer/désactiver |
| GET | `/auth/utilisateurs/{id}/permissions` | `utilisateurs.consulter` | Lire permissions |
| PUT | `/auth/utilisateurs/{id}/permissions` | `utilisateurs.gerer` | Définir permissions |
| POST | `/auth/change-password` | JWT | Changer son mot de passe |

### Établissement (racine API)

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| GET | `/valeurs/cycles` | JWT | Valeurs système cycles |
| GET | `/valeurs/classes` | JWT | Classes prédéfinies par cycle |
| GET | `/valeurs/periodes` | JWT | Périodes prédéfinies |
| GET | `/valeurs/annees-scolaires` | JWT | Années scolaires prédéfinies |
| POST | `/wizard` | EstablishmentManager | Wizard configuration complète |
| GET/POST/PUT/DELETE | `/cycles`, `/cycles/{id}` | Reader/Manager | CRUD cycles |
| GET/POST/PUT/DELETE | `/classes`, `/classes/{id}` | Reader/Manager | CRUD niveaux scolaires |
| GET/POST/PUT/DELETE | `/salles`, `/salles/{id}` | Reader/Manager | CRUD salles physiques |
| GET | `/salles/{id}/effectif` | EstablishmentReader | Effectif salle |
| GET/POST/PUT/DELETE | `/niveaux/*` | Reader/Manager | Alias legacy → classes |
| GET/POST | `/divisions/*` | Reader/Manager | Alias deprecated → salles |
| GET/POST/PUT/DELETE | `/annees-scolaires/*` | Reader/Manager | Années scolaires |
| POST | `/annees-scolaires/{id}/activer` | EstablishmentManager | Activer année |
| GET/POST/PUT/DELETE | `/periodes/*` | Reader/Manager | Périodes |
| GET/POST/PUT/DELETE | `/matieres/*` | Reader/Manager | Matières |
| GET/PUT | `/config-notation` | Reader/Manager | Configuration notation |
| GET | `/etablissement/structure` | EstablishmentReader | Structure complète |
| POST | `/etablissement/dupliquer` | EstablishmentManager | Dupliquer structure |

### Élèves (`/eleves`)

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| POST | `/eleves/inscrire` | StudentsWriter | Inscription élève |
| GET | `/eleves` | StudentsReader | Liste élèves |
| GET/PUT | `/eleves/{id}` | StudentsReader/Writer | Détail / modification |
| GET | `/eleves/{id}/dossier` | StudentsReader | Dossier complet |
| POST | `/eleves/{id}/transferer` | StudentsWriter | Transfert |
| POST/GET | `/eleves/{id}/absences` | StudentsWriter/Reader | Absences |
| PUT | `/eleves/absences/{id}/justifier` | StudentsWriter | Justifier absence |
| GET | `/eleves/classes/{id}/absences` | StudentsReader | Absences par salle |
| GET | `/eleves/{id}/carte-scolaire` | StudentsReader | PDF carte |
| GET | `/eleves/{id}/attestation` | StudentsReader | PDF attestation |
| GET | `/eleves/{id}/certificat` | StudentsReader | PDF certificat |

### Enseignants (`/enseignants`)

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| GET | `/enseignants` | `enseignants.consulter` | Liste |
| POST | `/enseignants` | `enseignants.gerer` | Créer |
| GET/PUT/DELETE | `/enseignants/{id}` | consulter/gerer | CRUD |
| GET | `/enseignants/classe/{id}` | `enseignants.consulter` | Par salle |
| GET | `/enseignants/matiere/{id}` | `enseignants.consulter` | Par matière |
| POST/DELETE | `/enseignants/{id}/matieres/*` | `enseignants.gerer` | Affectations matières |
| POST/DELETE | `/enseignants/{id}/classes/*` | `enseignants.gerer` | Affectations salles |

### Pédagogie (`/pedagogie`)

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| POST | `/pedagogie/notes/batch` | `notes.saisir` | Saisie notes en lot |
| GET | `/pedagogie/notes/{eleve_id}` | `notes.consulter` | Historique notes |
| POST | `/pedagogie/bulletins/generer` | `bulletins.generer` | Générer bulletins |
| GET | `/pedagogie/bulletins/{id}` | `bulletins.generer` | Détail bulletin |
| PUT | `/pedagogie/bulletins/{id}/valider` | `bulletins.valider` | Valider |
| PUT | `/pedagogie/bulletins/{id}/publier` | `bulletins.publier` | Publier |
| GET | `/pedagogie/classes/{id}/resultats` | `resultats.consulter` | Résultats classe |

### Finance (`/finance`)

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| GET/POST | `/finance/frais` | consulter/gerer | Frais scolaires |
| GET/POST | `/finance/paiements` | consulter/enregistrer | Paiements |
| PUT | `/finance/paiements/{id}/valider` | `paiements.valider` | Valider paiement |
| GET | `/finance/impayes` | `paiements.suivre_retard` | Impayés |
| GET | `/finance/transactions` | `paiements.historique` | Historique |
| GET/POST | `/finance/depenses` | consulter/gerer | Dépenses |
| GET/POST | `/finance/salaires` | consulter/gerer | Salaires |
| GET/POST | `/finance/caisse` | consulter/gerer | Caisse journalière |
| GET | `/finance/situation` | FinanceReader | Situation financière |
| GET | `/finance/eleves/{id}/situation` | FinanceReader | Situation élève |
| POST | `/finance/webhook/mobile-money` | Public (secret webhook) | Webhook Mobile Money |

### Reporting (`/reporting`)

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| GET | `/reporting/tableau-bord` | ReportsDashboard | KPIs tableau de bord |
| GET | `/reporting/statistiques` | ReportsReader | Statistiques globales |
| GET | `/reporting/exports/rapport-financier` | ReportsReader | Export financier |
| GET | `/reporting/exports/resultats-classe` | ReportsReader | Export résultats |
| GET | `/reporting/impressions/*` | ReportsImpressions | PDF bulletins, reçus, listes, attestations |

### Platform (`/platform`)

Tous les endpoints : `platform.admin`

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/platform/stats`, `/dashboard`, `/statistiques` | KPIs plateforme |
| CRUD | `/platform/tenants/*` | Gestion tenants |
| CRUD | `/platform/plans/*` | Plans abonnement |
| CRUD | `/platform/abonnements/*` | Abonnements |
| GET/POST/PUT | `/platform/factures/*` | Facturation |
| CRUD | `/platform/notifications/*` | Notifications |
| GET | `/platform/audit-logs` | Journal audit |
| CRUD | `/platform/tenants/{id}/utilisateurs/*` | Utilisateurs tenant |
| CRUD | `/platform/valeurs-systeme/*` | Valeurs système globales |

### Health

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| GET | `/health` | Public | Sonde disponibilité |

---

## 7. Sécurité

| Mesure | Implémentation |
|--------|----------------|
| JWT | Expiration 15 min (`JWT_EXPIRE_MINUTES`), payload `sub` + `tenant_id` |
| Sessions | Hash SHA-256 du token en table `sessions` |
| bcrypt | Cost 12 (`security.py`) |
| RLS | `app.current_tenant` via `set_tenant_context()` |
| Rate limiting | `POST /auth/login` : 5 req / 10 min / IP (slowapi + Redis) |
| Audit | `AuditMiddleware` + `audit_service.log_audit` |
| Tenant middleware | Chemins publics : `/health`, `/auth/login`, `/auth/tenant/*`, reset password, webhook |
| Production | `/docs` désactivé, pas de stack trace, validation errors sanitized |

### Variables d'environnement requises

| Variable | Obligatoire | Défaut |
|----------|-------------|--------|
| `DATABASE_URL` | Oui | — |
| `REDIS_URL` | Oui | — |
| `JWT_SECRET` | Oui | — |
| `JWT_ALGORITHM` | Non | `HS256` |
| `JWT_EXPIRE_MINUTES` | Non | `15` |
| `ENVIRONMENT` | Non | `development` |
| `DEBUG` | Non | `false` |
| `ALLOWED_ORIGINS` | Non | `["http://localhost:5173"]` |
| `MOBILE_MONEY_WEBHOOK_SECRET` | Non | dev secret |

---

## 8. Pipeline CI/CD

Fichier : `.github/workflows/ci-devsecops.yml`

| Étape | Outil | Statut |
|-------|-------|--------|
| 1 Secrets | Gitleaks | Actif |
| 2 SAST | Bandit + Semgrep | Actif |
| 3 SCA | Safety + npm audit | Actif |
| 4 Container scan | Trivy | Actif |
| Deploy staging | — | Commenté |
| DAST (ZAP) | — | Commenté |
| Production | — | Commenté |

### Pre-commit (`.pre-commit-config.yaml`)

- Gitleaks
- trailing-whitespace, end-of-file-fixer
- check-yaml, check-json, check-merge-conflict, detect-private-key

---

## 9. Commandes utiles

### Docker Compose

```bash
docker compose up -d          # Démarrer stack complète
docker compose logs -f backend
```

### Local (backend)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Tests

```bash
cd backend
pytest tests/ -v
```

### Interfaces

| Service | URL |
|---------|-----|
| API | http://localhost:8000 |
| Swagger (dev) | http://localhost:8000/docs |
| Frontend | http://localhost:80 |
| Adminer | http://localhost:8080 |
| PostgreSQL | localhost:5432 (kalanko/kalanko_user) |
| Redis | localhost:6379 |
