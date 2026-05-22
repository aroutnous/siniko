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

## 3. Vérifier que tout tourne

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
docker compose logs migrations
```
