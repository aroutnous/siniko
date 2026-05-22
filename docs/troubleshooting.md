# Dépannage — SINIKO

## 1. `pre-commit install` — « Is it installed, and are you in a Git repository? »

**Cause** : le dossier `siniko` n’est pas encore un dépôt Git.

**Correction** :

```bash
cd ~/siniko
git init
git add .
git commit -m "chore: initial commit bootstrap SINIKO"
pre-commit install
pre-commit run --all-files   # test optionnel
```

Ensuite, liez le dépôt GitHub :

```bash
git remote add origin https://github.com/VOTRE_USER/siniko.git
git push -u origin main
```

---

## 2. `docker compose up` — `context deadline exceeded`

**Cause** : téléchargement d’images interrompu (réseau lent, Wi‑Fi, VPN, registry Docker saturé). Souvent sur de grosses images (`grafana`, `pgadmin`, `postgres`).

**Corrections (dans l’ordre)** :

### A. Réessayer

```bash
docker compose pull
docker compose up -d --build
```

### B. Télécharger image par image

```bash
docker pull postgres:16-alpine
docker pull dpage/pgadmin4:8.14
docker pull grafana/grafana:11.4.0
docker pull grafana/loki:3.3.2
docker pull grafana/promtail:3.3.2
docker compose up -d --build
```

### C. Augmenter le délai (session terminal)

```bash
export COMPOSE_HTTP_TIMEOUT=300
export DOCKER_CLIENT_TIMEOUT=300
docker compose up -d --build
```

### D. Vérifier Docker Desktop

- Application **Docker Desktop** lancée (icône baleine active)
- **Settings → Resources** : assez de RAM (≥ 4 Go recommandé)
- Couper VPN/proxy le temps du pull si possible

### E. Images déjà partiellement téléchargées

```bash
docker compose down
docker system prune -f    # optionnel, libère l’espace
docker compose pull
docker compose up -d --build
```

---

## 3. `siniko-backend` / `siniko-frontend` arrêtés

```bash
docker compose logs backend
```

Reconstruire si besoin :

```bash
docker compose build --no-cache backend frontend
docker compose up -d
```

---

## 4. Noms des conteneurs (sans `-1`)

Les conteneurs utilisent `container_name` : `siniko-postgres`, `siniko-backend`, etc.

---

## 5. Service `backend` vs dossier `backend/`

- Dossier **`backend/`** = code source Python
- Service Docker **`backend`** = conteneur qui exécute ce code (anciennement nommé `api` dans le compose)

---

## 6. Grafana — « Invalid username or password »

**Cause** : au **premier** lancement, Grafana enregistre le mot de passe admin dans le volume `siniko_grafana_data`. Changer `.env` ensuite **ne met pas à jour** ce mot de passe.

**Solution A — réinitialiser le mot de passe (garde dashboards)** :

```bash
docker compose exec grafana grafana-cli admin reset-admin-password 'VOTRE_NOUVEAU_MDP'
```

Utilisez exactement la valeur de `GF_SECURITY_ADMIN_PASSWORD` dans `.env`, ou choisissez-en une nouvelle et mettez-la aussi dans `.env`.

**Solution B — repartir de zéro (efface réglages Grafana)** :

```bash
docker compose stop grafana
docker volume rm siniko_grafana_data
docker compose up -d grafana
```

Au redémarrage, Grafana relit `GF_SECURITY_ADMIN_USER` et `GF_SECURITY_ADMIN_PASSWORD` depuis `.env`.

Login : http://localhost:3000 — utilisateur **`admin`** (valeur de `GF_SECURITY_ADMIN_USER`, pas votre email).

---

## 7. pgAdmin — `Exited (1)` — email invalide

pgAdmin 8 refuse certains emails (ex. `admin@siniko.local`).

Dans `.env` :

```env
PGADMIN_DEFAULT_EMAIL=admin@siniko.dev
```

Puis : `docker compose up -d pgadmin`

---

## 8. Frontend — `Permission denied` sur nginx

Reconstruire l’image frontend après correction du Dockerfile :

```bash
docker compose build --no-cache frontend
docker compose up -d frontend
```

---

## 9. Vérifier que tout tourne

```bash
docker compose ps
curl -s http://localhost:8000/health
```

Attendu : `{"status":"ok","service":"siniko-api"}`

---

## 4. Ordre recommandé au premier lancement

```bash
cd ~/siniko
cp .env.example .env          # éditer les 4 secrets change-me
git init && git add . && git commit -m "chore: bootstrap"
pre-commit install
docker compose pull           # peut prendre plusieurs minutes
docker compose up -d --build
docker compose logs backend
```
