# SINIKO — Architecture Frontend

## 1. Vue d'ensemble

### Stack

| Couche | Technologie |
|--------|-------------|
| Framework | React 18 |
| Build | Vite |
| Langage | TypeScript |
| Styles | TailwindCSS |
| Composants UI | shadcn/ui (Radix + CVA) |
| Routing | React Router v6 (`createBrowserRouter`) |
| État global | Zustand (`authStore`, `toastStore`) |
| Data fetching | TanStack Query (React Query) |
| HTTP | Axios (`lib/api.ts`) |
| Icônes | lucide-react |

### Structure `src/`

```
frontend/src/
├── main.tsx                 # Point d'entrée React
├── App.tsx                  # RouterProvider
├── router.tsx               # Définition des routes
├── index.css                # Styles globaux Tailwind
├── assets/                  # Images statiques
├── components/
│   ├── auth/                # TenantPermissionGuard
│   ├── etablissement/       # EtablissementLayout, FormModal, StatusBadge
│   ├── eleves/              # Formulaires, cartes, modales élèves
│   ├── enseignants/         # EnseignantForm, AffectationModal
│   ├── finance/             # FinanceLayout, graphiques, formulaires
│   ├── layout/              # AppLayout, PlatformLayout, sidebars
│   ├── pedagogie/           # PedagogieLayout, NotesGrid, bulletins
│   ├── reporting/           # KpiGrid, ExportButton, charts
│   ├── utilisateurs/        # Modales permissions / édition
│   └── ui/                  # shadcn (button, card, dialog, DataTable…)
├── hooks/                   # Accès permissions par domaine
├── lib/                     # API clients, constants, permissions, utils
├── pages/                   # Pages par module
├── stores/                  # Zustand stores
└── types/                   # Interfaces TypeScript partagées
```

---

## 2. Pages et routes

### Authentification (hors layout)

| Route | Composant | Permissions | Description |
|-------|-----------|-------------|-------------|
| `/login` | `LoginPageGeneric` | Public | Saisie slug → redirect `/login/:slug` |
| `/login/:slug` | `LoginPage` | Public | Connexion tenant dédié (header `X-Tenant-Slug`) |
| `/admin` | `AdminLoginPage` | Public | Connexion platform_owner |

### Tenant (`TenantRoute` → `AppLayout`)

| Route | Composant | Permissions | Description |
|-------|-----------|-------------|-------------|
| `/` | redirect | JWT | → `/dashboard` |
| `/dashboard` | `DashboardPage` | JWT | Tableau de bord tenant |
| `/etablissement` | redirect | `showEtablissement` | → `/etablissement/wizard` |
| `/etablissement/wizard` | `WizardEtablissementPage` | `showEtablissement` | Wizard configuration (7 étapes) |
| `/etablissement/annees` | `AnneesPage` | `showEtablissement` | Années scolaires |
| `/etablissement/periodes` | `PeriodesPage` | `showEtablissement` | Périodes |
| `/etablissement/classes` | `ClassesPage` | `showEtablissement` | Niveaux scolaires |
| `/etablissement/salles` | `SallesPage` | `showEtablissement` | Salles physiques |
| `/etablissement/matieres` | `MatieresPage` | `showEtablissement` | Matières |
| `/etablissement/config-notation` | `ConfigNotationPage` | `showEtablissement` | Notation |
| `/etablissement/niveaux` | redirect | — | → `/etablissement/classes` |
| `/classes`, `/salles` | redirect | — | Alias legacy → établissement |
| `/eleves` | `ElevesListPage` | `showEleves` | Liste élèves |
| `/eleves/inscrire` | `InscriptionPage` | `eleves.inscrire` | Inscription |
| `/eleves/absences` | `AbsencesPage` | `showAbsences` | Absences |
| `/eleves/:eleveId/dossier` | `EleveDossierPage` | `showEleves` | Dossier élève |
| `/enseignants` | `EnseignantsPage` | `showEnseignants` | Gestion enseignants |
| `/absences` | `AbsencesPage` | `showAbsences` | Alias absences |
| `/paiements` | `PaiementsPage` | `showPaiements` | Paiements (vue simplifiée) |
| `/documents` | `HubDocumentairePage` | `showDocuments` | Hub documentaire |
| `/pedagogie/notes` | `SaisieNotesPage` | `showPedagogie` | Saisie notes |
| `/pedagogie/bulletins` | `BulletinsPage` | `showPedagogie` | Bulletins |
| `/pedagogie/resultats` | `ResultatsClassePage` | `showPedagogie` | Résultats classe |
| `/pedagogie/historique` | `HistoriqueNotesPage` | `showPedagogie` | Historique notes |
| `/finance/paiements` | `FinancePaiementsPage` | `showPaiements` | Paiements détaillés |
| `/finance/frais` | `FraisScolairesPage` | `showFinance` | Frais scolaires |
| `/finance/impayes` | `ImpayesPage` | `showPaiements` | Impayés |
| `/finance/transactions` | `TransactionsPage` | `showPaiements` | Historique |
| `/finance/depenses` | `DepensesPage` | `showFinance` | Dépenses |
| `/finance/salaires` | `SalairesPage` | `showFinance` | Salaires |
| `/finance/caisse` | `CaissePage` | `showFinance` | Caisse |
| `/finance/tableau-bord` | `TableauBordFinancierPage` | `showFinance` | Tableau de bord finance |
| `/rapports` | `RapportsPage` | `showRapports` | Rapports et statistiques |
| `/reporting/*` | redirect | — | → `/rapports` |
| `/utilisateurs` | `UtilisateursListPage` | `showUtilisateurs` | Utilisateurs tenant |
| `/profil` | `ProfilPage` | JWT | Profil utilisateur |

### Platform (`PlatformRoute` → `PlatformLayout`)

| Route | Composant | Permissions | Description |
|-------|-----------|-------------|-------------|
| `/platform` | `PlatformDashboardPage` | `platform.admin` | Dashboard plateforme |
| `/platform/tenants` | `TenantsListPage` | `platform.admin` | Liste tenants |
| `/platform/tenants/nouveau` | `TenantCreatePage` | `platform.admin` | Créer tenant |
| `/platform/tenants/:tenantId/utilisateurs` | `TenantUtilisateursPage` | `platform.admin` | Utilisateurs d'un tenant |
| `/platform/abonnements` | `AbonnementsPage` | `platform.admin` | Abonnements |
| `/platform/facturation` | `FacturationPage` | `platform.admin` | Facturation |
| `/platform/notifications` | `NotificationsPage` | `platform.admin` | Notifications |
| `/platform/statistiques` | `StatistiquesPage` | `platform.admin` | Statistiques globales |
| `/platform/plans` | `PlansPage` | `platform.admin` | Plans abonnement |
| `/platform/audit` | `AuditLogsPage` | `platform.admin` | Journal d'audit |
| `/platform/valeurs-systeme` | `ValeursSystemePage` | `platform.admin` | Valeurs système |
| `/platform/profil` | `ProfilPage` | `platform.admin` | Profil |

### Pages non routées

- `CyclesPage.tsx` — existe mais **non montée** dans le router (cycles gérés via wizard et API).

---

## 3. Système d'authentification frontend

### `authStore` (Zustand — `stores/authStore.ts`)

| State | Type | Description |
|-------|------|-------------|
| `user` | `User \| null` | Profil courant |
| `token` | `string \| null` | JWT (localStorage) |
| `tenant` | `{ slug } \| null` | Slug tenant (sessionStorage) |
| `permissions` | `string[]` | Permissions chargées |
| `permissionsLoaded` | `boolean` | Chargement terminé |
| `isAuthenticated` | `boolean` | Présence token |

| Action | Description |
|--------|-------------|
| `login(payload)` | POST `/auth/login` + header `X-Tenant-Slug` si slug fourni |
| `logout()` | POST `/auth/logout`, purge storage |
| `refreshToken()` | POST `/auth/refresh` |
| `fetchProfile()` | GET `/auth/me` |
| `fetchPermissions()` | Charge permissions selon rôle |
| `hasPermission(p)` | Vérifie permission (promoteur → true) |
| `hydrate()` | Restaure token/slug au démarrage |

### `fetchPermissions()`

1. **promoteur** → `permissions = ["*"]`
2. **platform_owner** → `["platform.admin"]`
3. **Autres** → GET `/auth/me/permissions` puis `normalizePermissionList()`

### `hasPermission(permission)`

- `promoteur` : toujours `true`
- `"*"` dans permissions : `true`
- Sinon : `permissions.includes(permission)`

### Login par tenant

- `/login` : saisie slug → navigation vers `/login/:slug`
- `/login/:slug` : charge tenant via GET `/auth/tenant/{slug}`, login avec `tenant_slug`
- Lien copiable depuis pages platform (TenantsList, UtilisateursList)

### Login Platform Owner

- Route `/admin` → `AdminLoginPage`
- Login sans `tenant_slug` (email platform_owner uniquement)
- Redirect post-login → `/platform`

---

## 4. Navigation conditionnelle

### `useMenuAccess()` (`hooks/useMenuAccess.ts`)

Flags sidebar (`showXxx`) :

| Flag | Permissions (OR) |
|------|------------------|
| `showEtablissement` | `etablissement.acceder`, `etablissement.configurer` |
| `showEleves` | `eleves.inscrire`, `eleves.dossiers`, `eleves.consulter` |
| `showEnseignants` | `enseignants.consulter`, `enseignants.gerer` |
| `showClasses` | `classes.consulter`, `classes.gerer` |
| `showAbsences` | `absences.consulter`, `absences.gerer` |
| `showPedagogie` | notes, bulletins, resultats (6 permissions) |
| `showPaiements` | paiements.* (5 permissions) |
| `showFinance` | frais, salaires, depenses, caisse (8 permissions) |
| `showDocuments` | documents.* (7 permissions) |
| `showRapports` | statistiques.*, rapports.* (4 permissions) |
| `showUtilisateurs` | `utilisateurs.consulter`, `utilisateurs.gerer` |

Objet `can` : flags granulaires (`etablissementConfigurer`, `elevesInscrire`, `notesSaisir`, etc.).

Promoteur : tous les `showXxx` et `can.*` sont `true`.

### `TenantPermissionGuard`

- Enveloppe le contenu dans `AppLayout`
- Attend `permissionsLoaded` + `user`
- Vérifie `canAccessPath(pathname, menuAccess, hasPermission)` (`lib/route-access.ts`)
- Redirige vers `/dashboard` si accès refusé

### `TenantRoute` / `PlatformRoute`

| Guard | Condition | Redirect si échec |
|-------|-----------|-------------------|
| `TenantRoute` | JWT + rôle ≠ platform_owner | `/login` ou `/platform` |
| `PlatformRoute` | JWT + rôle = platform_owner | `/admin` ou `/dashboard` |

### Onglets Établissement (`EtablissementLayout`)

Configuration (wizard), Années, Périodes, Classes, Salles, Matières, Notation — visibles si `showEtablissement`. Actions CRUD conditionnées par `can.etablissementConfigurer`.

---

## 5. Hooks personnalisés

| Hook | Fichier | Permissions vérifiées | Retour |
|------|---------|----------------------|--------|
| `useHasPermission` | `hooks/useHasPermission.ts` | Toutes (callback) | `(p: string) => boolean` |
| `useMenuAccess` | `hooks/useMenuAccess.ts` | Agrégation sidebar | `showXxx`, `can.*` |
| `useEstablishmentAccess` | `hooks/useEstablishmentAccess.ts` | `etablissement.*`, `classes.*` | `canRead`, `canManage`, `canEditConfig` |
| `useElevesAccess` | `hooks/useElevesAccess.ts` | `eleves.*`, `absences.*`, `documents.*` | `canRead`, `canManage`, `canManageAbsences`, `canDelete`, `canPrint` |
| `useFinanceAccess` | `hooks/useFinanceAccess.ts` | `paiements.*`, `frais.*`, `depenses.*`, `salaires.*`, `caisse.*` | 12 flags d'accès finance |
| `usePedagogieAccess` | `hooks/usePedagogieAccess.ts` | `notes.*`, `bulletins.*`, `resultats.*` | 10 flags pédagogie |
| `useReportingAccess` | `hooks/useReportingAccess.ts` | `statistiques.*`, `rapports.*`, `documents.*` | 4 flags reporting |
| `useUtilisateursAccess` | `hooks/useUtilisateursAccess.ts` | `utilisateurs.*` | `canManageUsers`, `canViewUsers` |

---

## 6. Composants réutilisables

| Composant | Description |
|-----------|-------------|
| `AppLayout` | Sidebar tenant + header + `TenantPermissionGuard` |
| `PlatformLayout` | Sidebar platform owner |
| `EtablissementLayout` | Onglets horizontaux établissement |
| `FinanceLayout` | Onglets module finance |
| `PedagogieLayout` | Onglets module pédagogie |
| `TenantPermissionGuard` | Garde d'accès par route |
| `PageHeader` | Titre + actions de page |
| `DataTable` | Table générique tri/filtre |
| `LoadingSpinner` | Indicateur chargement |
| `FormModal` | Modale formulaire établissement |
| `PermissionsModal` | Édition permissions utilisateur |
| `NotesGrid` | Grille saisie notes |
| `BulletinCard` | Carte bulletin |
| `PaiementForm` | Formulaire paiement |
| `EnseignantForm` | Formulaire enseignant |
| `AffectationModal` | Affectation matière/classe |
| `KpiGrid` / `StatCard` | KPIs dashboard |
| `ExportButton` / `PrintButton` | Exports et impressions |
| `Toast` | Notifications toast (via `toastStore`) |
| UI shadcn | `button`, `card`, `dialog`, `input`, `select`, `tabs`, `badge`, `checkbox` |

---

## 7. Appels API par module

Clients définis dans `lib/*-api.ts`, exécutés via `api` (Axios).

### Auth / Utilisateurs

- `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/me`, `/auth/me/permissions`
- `/auth/tenant/{slug}`, `/auth/change-password`
- `/auth/utilisateurs/*` (CRUD, permissions, reset MDP)

### Établissement (`etablissement-api.ts`)

- `/valeurs/cycles`, `/valeurs/classes`, `/valeurs/periodes`, `/valeurs/annees-scolaires`
- `/wizard`, `/cycles`, `/classes`, `/salles`, `/annees-scolaires`, `/periodes`, `/matieres`
- `/config-notation`, `/etablissement/structure`

### Élèves (`eleves-api.ts`)

- `/eleves`, `/eleves/inscrire`, `/eleves/{id}`, `/eleves/{id}/dossier`
- `/eleves/{id}/absences`, `/eleves/absences/{id}/justifier`
- `/eleves/{id}/carte-scolaire`, `/attestation`, `/certificat`

### Enseignants (`enseignants-api.ts`)

- `/enseignants`, `/enseignants/{id}`, affectations matières/classes

### Pédagogie (`pedagogie-api.ts`)

- `/pedagogie/notes/batch`, `/pedagogie/notes/{eleveId}`
- `/pedagogie/bulletins/generer`, `/pedagogie/bulletins/{id}`
- `/pedagogie/bulletins/{id}/valider`, `/publier`
- `/pedagogie/classes/{id}/resultats`

### Finance (`finance-api.ts`)

- `/finance/frais`, `/finance/paiements`, `/finance/paiements/{id}/valider`
- `/finance/impayes`, `/finance/transactions`, `/finance/depenses`
- `/finance/salaires`, `/finance/caisse`, `/finance/situation`

### Reporting (`reporting-api.ts`)

- `/reporting/tableau-bord`, `/reporting/statistiques`
- `/reporting/exports/*`, `/reporting/impressions/*`

### Platform (`platform-api.ts`)

- `/platform/stats`, `/platform/tenants/*`, `/platform/plans/*`
- `/platform/abonnements/*`, `/platform/factures/*`, `/platform/notifications/*`
- `/platform/audit-logs`, `/platform/valeurs-systeme/*`

---

## 8. Wizard Établissement

Page : `WizardEtablissementPage` — route `/etablissement/wizard`

### 7 étapes

| # | Étape | Description | Données |
|---|-------|-------------|---------|
| 1 | Année | Sélection année scolaire | Valeurs système `/valeurs/annees-scolaires` |
| 2 | Périodes | Activation + dates par période | `/valeurs/periodes` |
| 3 | Cycles | Sélection cycles (préscolaire, 1er/2ème cycle) | `/valeurs/cycles` |
| 4 | Classes | Sélection niveaux par cycle | `/valeurs/classes` |
| 5 | Salles | Création salles par classe (nom, capacité) | State local `salles` |
| 6 | Matières | Matières par classe (nom, coefficient) | State local `matieres` |
| 7 | Notation | note_max, note_passage, arrondi | State local |

### State local

- `step` (0–6), `anneeScolaire`, `periodes`, `cyclesSelectionnes`
- `classesSelectionnees`, `salles`, `matieres`
- `noteMax`, `notePassage`, `arrondi`, `stepError`

### Soumission

- Mutation POST `ETABLISSEMENT_API.wizard` → `/wizard`
- Payload : `WizardEtablissementData` (agrégation des 7 étapes)
- Succès → toast + navigation vers dashboard ou structure établissement

### Permission requise

Backend : `etablissement.configurer` (`EstablishmentManager`).
Frontend : actions visibles via `useMenuAccess().can.etablissementConfigurer`.

---

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `VITE_API_URL` | `http://localhost:8000` | URL API backend |

## Commandes utiles

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # Production build
npm run lint
```
