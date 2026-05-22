# Démarrer SINIKO — guide pas à pas

> **Mode retenu : 100 % Docker** — API, frontend, BDD, pgAdmin et supervision tournent en conteneurs.

## Backend « en local » (mode non retenu — référence)

| Élément | Où il tourne | Explication |
|---------|--------------|-------------|
| **Code source** | Dossier `backend/` sur votre Mac | Vous éditez dans Cursor ; ce n’est pas « dans » le conteneur |
| **Processus API** | **Votre Mac** (Python + uvicorn) | Le serveur FastAPI écoute sur `:8000` en dehors de Docker |
| **PostgreSQL** | **Conteneur Docker** | Données persistées ; accessible sur `localhost:5432` |
| **pgAdmin** | **Conteneur Docker** | Interface web sur http://localhost:5050 |
| **Migrations** | **Conteneur one-shot** | `alembic upgrade head` puis le conteneur s’arrête |
| **Grafana / Loki** | **Conteneurs Docker** | Supervision des logs |

Ce n’est donc **pas** « 100 % local » ni « 100 % Docker » : c’est le mode **hybride**, le plus confortable pour développer (rechargement auto du code, debug facile).

Le mode **100 % Docker** (API + front en conteneur) reste possible avec le profil `docker-app`.

---

## Mode 100 % Docker (retenu)

### Lancer tout le projet

```bash
cd /Users/aroutnous/siniko
cp .env.example .env    # une fois, puis éditer les secrets
docker compose up -d --build
docker compose logs migrations   # doit finir en succès
docker compose ps                # api, frontend, postgres, pgadmin, grafana… « running »
```

| Service | URL |
|---------|-----|
| API (Swagger) | http://localhost:8000/docs |
| Frontend | http://localhost:8080 |
| pgAdmin | http://localhost:5050 |
| Grafana | http://localhost:3000 |

### Après modification du code backend

```bash
docker compose up -d --build api          # rebuild + redémarrage API
docker compose run --rm migrations        # si nouvelle migration Alembic
```

### Après modification du frontend

```bash
docker compose up -d --build frontend
```

### pgAdmin

Host : **`postgres`** · Port : `5432` · DB / user / pass : `siniko`

---

## Prérequis (une seule fois)

- Docker Desktop
- Python 3.12
- Node 20
- Git + pre-commit (recommandé)

---

## Mode recommandé — Dev hybride

### 1. Configuration

```bash
cd /Users/aroutnous/siniko
cp .env.example .env
```

Éditez `.env` : changez au minimum `APP_SECRET_KEY`, `JWT_SECRET_KEY`, mots de passe Grafana/pgAdmin.

Pour le backend **sur le Mac**, ajoutez ou vérifiez :

```env
DATABASE_URL=postgresql+asyncpg://siniko:siniko@localhost:5432/siniko
ALEMBIC_DATABASE_URL=postgresql+psycopg2://siniko:siniko@localhost:5432/siniko
```

### 2. Infrastructure Docker (BDD + pgAdmin + migrations + logs)

```bash
docker compose up -d --build
```

Services démarrés par défaut :

| Service | URL / accès |
|---------|-------------|
| PostgreSQL | `localhost:5432` |
| pgAdmin | http://localhost:5050 |
| Grafana | http://localhost:3000 |
| Migrations | s’exécute une fois puis s’arrête (`docker compose ps -a` → `exited (0)`) |

Vérifier les migrations :

```bash
docker compose logs migrations
# doit finir sans erreur
```

### 3. pgAdmin — première connexion

1. Ouvrir http://localhost:5050  
2. Email / mot de passe : valeurs `PGADMIN_*` dans `.env` (défaut `admin@siniko.local` / `admin`)  
3. **Register → Server**  
   - **General** → Name : `SINIKO local`  
   - **Connection** → Host : `postgres` (depuis pgAdmin dans Docker) **ou** `host.docker.internal` si `postgres` ne répond pas  
   - Port : `5432`  
   - Database : `siniko`  
   - Username / Password : `siniko` / `siniko`

> Astuce : depuis pgAdmin dans le même réseau Compose, l’hôte est **`postgres`**, pas `localhost`.

### 4. Backend sur le Mac (code local, hot reload)

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt

# Depuis la racine du projet, charger les variables :
set -a && source ../.env && set +a

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

→ API : http://localhost:8000/docs  
→ Health : http://localhost:8000/health

Tests :

```bash
pytest
```

Migrations manuelles (si besoin après un nouveau modèle) :

```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
# ou :
docker compose run --rm migrations
```

### 5. Frontend sur le Mac

```bash
cd frontend
npm install
npm run dev
```

→ http://localhost:5173

### 6. Pre-commit (sécurité avant commit)

```bash
pip install pre-commit
pre-commit install
```

---

## Mode alternatif — Tout en Docker

API et frontend dans des conteneurs (pas de hot reload Python par défaut) :

```bash
docker compose --profile docker-app up -d --build
```

| Service | URL |
|---------|-----|
| API | http://localhost:8000/docs |
| Frontend (Nginx) | http://localhost:8080 |

pgAdmin et Postgres : identiques au mode hybride.

---

## Commandes utiles

```bash
# État des services
docker compose ps -a

# Relancer uniquement les migrations
docker compose run --rm migrations

# Arrêter (garder les données)
docker compose down

# Arrêter + effacer la BDD locale
docker compose down -v

# psql sans pgAdmin
docker compose exec postgres psql -U siniko -d siniko
```

---

## Résumé : que faire pour lancer le projet ?

**Ordre minimal (dev hybride) :**

1. `cp .env.example .env` et éditer les secrets  
2. `docker compose up -d --build`  
3. Vérifier `docker compose logs migrations`  
4. Terminal 1 : backend `uvicorn ... --reload`  
5. Terminal 2 : frontend `npm run dev`  
6. Navigateur : API docs, app React, pgAdmin si besoin SQL  

C’est tout pour travailler au quotidien.
