#!/usr/bin/env bash
# =============================================================================
# Kalanko — Provisioning VPS Ubuntu 24.04 LTS
# =============================================================================
# Usage (en root sur le VPS) :
#   curl -fsSL ... -o /root/provision.sh && chmod +x /root/provision.sh
#   sudo /root/provision.sh
#
# Idempotent : relançable sans casser l'existant.
# Aucun secret en dur — remplir /opt/kalanko/.env.prod après provisioning.
# =============================================================================

set -euo pipefail

# --- Configuration (non secrète) ---------------------------------------------
readonly KALANKO_USER="kalanko"
readonly KALANKO_HOME="/home/${KALANKO_USER}"
readonly KALANKO_ROOT="/opt/kalanko"
readonly KALANKO_APP="${KALANKO_ROOT}/app"
readonly KALANKO_DATA="${KALANKO_ROOT}/data"
readonly KALANKO_BACKUPS="${KALANKO_ROOT}/backups"
readonly KALANKO_SCRIPTS="${KALANKO_ROOT}/scripts"
readonly GIT_REPO="https://github.com/aroutnous/siniko"
readonly VPS_IP="72.61.106.104"
readonly DOMAIN="kalanko.tech"
readonly API_DOMAIN="api.${DOMAIN}"
readonly TZ_UTC="UTC"

# Conteneur PostgreSQL Docker (nom par défaut du docker-compose du repo)
readonly POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-kalanko_db}"
readonly POSTGRES_DB="${POSTGRES_DB:-kalanko}"
readonly POSTGRES_USER="${POSTGRES_USER:-kalanko_user}"

# Clé SSH publique optionnelle (fichier ou variable d'environnement)
readonly PROVISION_SSH_PUBKEY_FILE="${PROVISION_SSH_PUBKEY_FILE:-}"
readonly PROVISION_SSH_PUBKEY="${PROVISION_SSH_PUBKEY:-}"

# --- Utilitaires ---------------------------------------------------------------
log()  { printf '\n[provision] %s\n' "$*"; }
warn() { printf '\n[provision][WARN] %s\n' "$*" >&2; }
die()  { printf '\n[provision][ERROR] %s\n' "$*" >&2; exit 1; }

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "Ce script doit être exécuté en root (sudo /root/provision.sh)."
  fi
}

require_ubuntu_2404() {
  if [[ ! -f /etc/os-release ]]; then
    die "Impossible de détecter la distribution."
  fi
  # shellcheck source=/dev/null
  source /etc/os-release
  if [[ "${ID:-}" != "ubuntu" ]] || [[ "${VERSION_ID:-}" != "24.04" ]]; then
    warn "Ce script cible Ubuntu 24.04 LTS (détecté : ${PRETTY_NAME:-inconnu})."
    warn "Poursuite à vos risques."
  fi
}

apt_install() {
  local packages=("$@")
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${packages[@]}"
}

# =============================================================================
# 1. SÉCURISATION INITIALE
# =============================================================================
section_system_hardening() {
  log "=== 1. Sécurisation initiale ==="

  log "Mise à jour du système..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get upgrade -y -qq
  apt-get autoremove -y -qq

  log "Timezone → ${TZ_UTC}"
  if [[ -f /usr/share/zoneinfo/${TZ_UTC} ]]; then
    ln -sf "/usr/share/zoneinfo/${TZ_UTC}" /etc/localtime
  fi
  if command -v timedatectl >/dev/null 2>&1; then
    timedatectl set-timezone "${TZ_UTC}" || true
  fi

  log "Création utilisateur ${KALANKO_USER}..."
  if ! id "${KALANKO_USER}" &>/dev/null; then
    useradd -m -s /bin/bash "${KALANKO_USER}"
  fi

  # Sudo sans mot de passe (idempotent)
  local sudoers_file="/etc/sudoers.d/${KALANKO_USER}"
  if [[ ! -f "${sudoers_file}" ]] || ! grep -q 'NOPASSWD:ALL' "${sudoers_file}" 2>/dev/null; then
    echo "${KALANKO_USER} ALL=(ALL) NOPASSWD:ALL" > "${sudoers_file}"
    chmod 440 "${sudoers_file}"
    visudo -cf /etc/sudoers >/dev/null
  fi

  log "Configuration SSH pour ${KALANKO_USER}..."
  local ssh_dir="${KALANKO_HOME}/.ssh"
  install -d -m 700 -o "${KALANKO_USER}" -g "${KALANKO_USER}" "${ssh_dir}"
  touch "${ssh_dir}/authorized_keys"
  chown "${KALANKO_USER}:${KALANKO_USER}" "${ssh_dir}/authorized_keys"
  chmod 600 "${ssh_dir}/authorized_keys"

  # Préserver l'accès admin : copier les clés root existantes
  if [[ -f /root/.ssh/authorized_keys ]]; then
    while IFS= read -r line || [[ -n "${line}" ]]; do
      [[ -z "${line}" || "${line}" =~ ^# ]] && continue
      grep -qxF "${line}" "${ssh_dir}/authorized_keys" 2>/dev/null || echo "${line}" >> "${ssh_dir}/authorized_keys"
    done < /root/.ssh/authorized_keys
    chown "${KALANKO_USER}:${KALANKO_USER}" "${ssh_dir}/authorized_keys"
    chmod 600 "${ssh_dir}/authorized_keys"
  fi

  # Clé publique fournie explicitement (fichier ou env)
  local pubkey=""
  if [[ -n "${PROVISION_SSH_PUBKEY}" ]]; then
    pubkey="${PROVISION_SSH_PUBKEY}"
  elif [[ -n "${PROVISION_SSH_PUBKEY_FILE}" && -f "${PROVISION_SSH_PUBKEY_FILE}" ]]; then
    pubkey="$(tr -d '\n\r' < "${PROVISION_SSH_PUBKEY_FILE}")"
  fi
  if [[ -n "${pubkey}" ]]; then
    grep -qxF "${pubkey}" "${ssh_dir}/authorized_keys" 2>/dev/null || echo "${pubkey}" >> "${ssh_dir}/authorized_keys"
  fi

  # Paire de clés locale pour l'utilisateur (déploiements git, etc.) si absente
  if [[ ! -f "${ssh_dir}/id_ed25519" ]]; then
    sudo -u "${KALANKO_USER}" ssh-keygen -t ed25519 -f "${ssh_dir}/id_ed25519" -N "" -C "${KALANKO_USER}@${DOMAIN}"
    log "Clé SSH générée : ${ssh_dir}/id_ed25519 (privée) / id_ed25519.pub"
    grep -qxF "$(cat "${ssh_dir}/id_ed25519.pub")" "${ssh_dir}/authorized_keys" 2>/dev/null \
      || cat "${ssh_dir}/id_ed25519.pub" >> "${ssh_dir}/authorized_keys"
    chown "${KALANKO_USER}:${KALANKO_USER}" "${ssh_dir}/authorized_keys"
    chmod 600 "${ssh_dir}/authorized_keys"
  fi

  log "Durcissement SSH (sshd)..."
  install -d -m 755 /etc/ssh/sshd_config.d
  cat > /etc/ssh/sshd_config.d/99-kalanko-hardening.conf <<'EOF'
# Kalanko — durcissement SSH (géré par provision.sh)
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
UsePAM yes
X11Forwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

  if ! grep -qE '^Include\s+/etc/ssh/sshd_config\.d/\*\.conf' /etc/ssh/sshd_config 2>/dev/null; then
    echo "Include /etc/ssh/sshd_config.d/*.conf" >> /etc/ssh/sshd_config
  fi

  if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
    sshd -t
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  fi
}

# =============================================================================
# 2. FIREWALL UFW
# =============================================================================
section_ufw() {
  log "=== 2. Firewall UFW ==="

  if ! command -v ufw >/dev/null 2>&1; then
    apt_install ufw
  fi

  ufw default deny incoming
  ufw default allow outgoing
  ufw allow OpenSSH comment 'SSH' 2>/dev/null || ufw allow 22/tcp comment 'SSH'
  ufw allow 80/tcp comment 'HTTP'
  ufw allow 443/tcp comment 'HTTPS'
  ufw --force enable
  ufw status verbose || true
}

# =============================================================================
# 3. FAIL2BAN
# =============================================================================
section_fail2ban() {
  log "=== 3. Fail2ban ==="

  if ! command -v fail2ban-client >/dev/null 2>&1; then
    apt_install fail2ban
  fi

  install -d -m 755 /etc/fail2ban
  cat > /etc/fail2ban/jail.local <<'EOF'
# Kalanko — protection SSH
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 3
backend  = systemd

[sshd]
enabled = true
port    = ssh
filter  = sshd
maxretry = 3
bantime  = 3600
EOF

  systemctl enable fail2ban
  systemctl restart fail2ban
}

# =============================================================================
# 4. DOCKER
# =============================================================================
section_docker() {
  log "=== 4. Docker Engine + Compose plugin ==="

  if ! command -v docker >/dev/null 2>&1; then
    apt-get update -qq
    apt_install ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
      chmod a+r /etc/apt/keyrings/docker.asc
    fi
  # shellcheck source=/dev/null
  . /etc/os-release
    local arch
    arch="$(dpkg --print-architecture)"
    local docker_list="/etc/apt/sources.list.d/docker.list"
    if [[ ! -f "${docker_list}" ]]; then
      echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
        > "${docker_list}"
    fi
    apt-get update -qq
    apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    log "Docker déjà installé, vérification du plugin Compose..."
    if ! docker compose version >/dev/null 2>&1; then
      apt-get update -qq
      apt_install docker-compose-plugin
    fi
  fi

  systemctl enable docker
  systemctl start docker

  if id "${KALANKO_USER}" &>/dev/null; then
    usermod -aG docker "${KALANKO_USER}" || true
  fi
}

# =============================================================================
# 5. CADDY (reverse proxy HTTPS)
# =============================================================================
section_caddy() {
  log "=== 5. Caddy (HTTPS) ==="

  if ! command -v caddy >/dev/null 2>&1; then
    apt_install debian-keyring debian-archive-keyring apt-transport-https curl
    if [[ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]]; then
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    fi
    if [[ ! -f /etc/apt/sources.list.d/caddy-stable.list ]]; then
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    fi
    apt-get update -qq
    apt_install caddy
  fi

  cat > /etc/caddy/Caddyfile <<EOF
# Kalanko — reverse proxy (géré par provision.sh)
# Frontend React (nginx dans Docker, port hôte 80)
${DOMAIN} {
    encode gzip zstd
    reverse_proxy localhost:80
}

# API FastAPI (Docker, port hôte 8000)
${API_DOMAIN} {
    encode gzip zstd
    reverse_proxy localhost:8000
}

# Grafana (monitoring — à activer manuellement)
# grafana.kalanko.tech → localhost:3001 (à activer manuellement)
EOF

  systemctl enable caddy
  caddy validate --config /etc/caddy/Caddyfile
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
}

# =============================================================================
# 6. STRUCTURE DU PROJET
# =============================================================================
section_project_layout() {
  log "=== 6. Structure /opt/kalanko ==="

  install -d -m 755 "${KALANKO_ROOT}"
  install -d -m 750 "${KALANKO_DATA}/postgres" "${KALANKO_DATA}/redis"
  install -d -m 750 "${KALANKO_BACKUPS}"
  install -d -m 755 "${KALANKO_SCRIPTS}"

  if [[ -d "${KALANKO_APP}/.git" ]]; then
    log "Dépôt déjà présent — git pull..."
    git -C "${KALANKO_APP}" fetch --all --prune || warn "git fetch a échoué"
    git -C "${KALANKO_APP}" pull --ff-only || warn "git pull a échoué (conflits ?)"
  else
    if [[ -d "${KALANKO_APP}" && -n "$(ls -A "${KALANKO_APP}" 2>/dev/null)" ]]; then
      warn "${KALANKO_APP} existe mais n'est pas un dépôt git — clone ignoré."
    else
      rm -rf "${KALANKO_APP}" 2>/dev/null || true
      git clone "${GIT_REPO}" "${KALANKO_APP}"
    fi
  fi

  if [[ ! -f "${KALANKO_ROOT}/.env.prod" ]]; then
    cat > "${KALANKO_ROOT}/.env.prod" <<'EOF'
# =============================================================================
# Kalanko — variables de production
# Renseigner les valeurs puis lier/copier vers /opt/kalanko/app/.env pour Docker.
# Ne jamais commiter ce fichier.
# =============================================================================

# PostgreSQL (service Docker "db")
# DATABASE_URL=postgresql://USER:PASSWORD@db:5432/kalanko

# Redis (service Docker "redis")
# REDIS_URL=redis://redis:6379

# JWT — générer : openssl rand -hex 32
# JWT_SECRET=

# Durée de vie des tokens (minutes)
# JWT_EXPIRE_MINUTES=15

# Origines CORS autorisées (séparées par des virgules)
# ALLOWED_ORIGINS=https://kalanko.tech,https://www.kalanko.tech

# URL API injectée au build du frontend (Vite)
# VITE_API_URL=https://api.kalanko.tech

# Secret webhook Mobile Money
# MOBILE_MONEY_WEBHOOK_SECRET=

# Monitoring Grafana (docker-compose service grafana)
# GRAFANA_PASSWORD=
EOF
    chmod 600 "${KALANKO_ROOT}/.env.prod"
    log "Créé ${KALANKO_ROOT}/.env.prod (template commenté)"
  else
    log "${KALANKO_ROOT}/.env.prod existe déjà — conservé"
  fi

  chown -R "${KALANKO_USER}:${KALANKO_USER}" "${KALANKO_ROOT}"
  chmod 750 "${KALANKO_DATA}" "${KALANKO_BACKUPS}"
}

# =============================================================================
# 7. SCRIPT DE BACKUP POSTGRESQL + CRON
# =============================================================================
section_backup() {
  log "=== 7. Backup PostgreSQL + cron ==="

  cat > "${KALANKO_SCRIPTS}/backup.sh" <<'BACKUP_EOF'
#!/usr/bin/env bash
# Backup PostgreSQL Kalanko — pg_dump via Docker
set -euo pipefail

KALANKO_BACKUPS="/opt/kalanko/backups"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-kalanko_db}"
POSTGRES_DB="${POSTGRES_DB:-kalanko}"
POSTGRES_USER="${POSTGRES_USER:-kalanko_user}"
RETENTION_DAYS=7
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${KALANKO_BACKUPS}/kalanko_${TIMESTAMP}.sql.gz"

mkdir -p "${KALANKO_BACKUPS}"

if ! docker ps --format '{{.Names}}' | grep -qx "${POSTGRES_CONTAINER}"; then
  echo "[backup][ERROR] Conteneur ${POSTGRES_CONTAINER} introuvable ou arrêté." >&2
  exit 1
fi

docker exec -t "${POSTGRES_CONTAINER}" \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-acl \
  | gzip -9 > "${BACKUP_FILE}"

chmod 640 "${BACKUP_FILE}"
echo "[backup] Sauvegarde : ${BACKUP_FILE}"

# Rotation : conserver les 7 derniers fichiers
mapfile -t OLD_BACKUPS < <(ls -1t "${KALANKO_BACKUPS}"/kalanko_*.sql.gz 2>/dev/null || true)
if ((${#OLD_BACKUPS[@]} > RETENTION_DAYS)); then
  for old in "${OLD_BACKUPS[@]:RETENTION_DAYS}"; do
    rm -f "${old}"
    echo "[backup] Supprimé (rotation) : ${old}"
  done
fi
BACKUP_EOF

  chmod 750 "${KALANKO_SCRIPTS}/backup.sh"
  chown "${KALANKO_USER}:${KALANKO_USER}" "${KALANKO_SCRIPTS}/backup.sh"

  local cron_line="0 2 * * * ${KALANKO_SCRIPTS}/backup.sh >> /var/log/kalanko-backup.log 2>&1"
  local cron_file="/etc/cron.d/kalanko-backup"
  if [[ ! -f "${cron_file}" ]] || ! grep -qF "${KALANKO_SCRIPTS}/backup.sh" "${cron_file}" 2>/dev/null; then
    cat > "${cron_file}" <<EOF
# Kalanko — backup PostgreSQL quotidien (02:00 UTC)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
${cron_line}
EOF
    chmod 644 "${cron_file}"
  fi

  touch /var/log/kalanko-backup.log
  chmod 640 /var/log/kalanko-backup.log
}

# =============================================================================
# 8. RÉSUMÉ FINAL
# =============================================================================
section_summary() {
  log "=== 8. Résumé ==="

  cat <<EOF

╔══════════════════════════════════════════════════════════════════════════╗
║                    PROVISIONING KALANKO TERMINÉ                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║  IP VPS        : ${VPS_IP}
║  Domaine       : https://${DOMAIN}
║  API           : https://${API_DOMAIN}
║  Utilisateur   : ${KALANKO_USER} (sudo NOPASSWD, groupe docker)
║  Application   : ${KALANKO_APP}
║  Config prod   : ${KALANKO_ROOT}/.env.prod
║  Backups       : ${KALANKO_BACKUPS}/ (cron 02:00 UTC, rétention 7)
╚══════════════════════════════════════════════════════════════════════════╝

Prochaines étapes manuelles :
  1. DNS : enregistrements A pour ${DOMAIN} et ${API_DOMAIN} → ${VPS_IP}
  2. Renseigner ${KALANKO_ROOT}/.env.prod (JWT_SECRET, mots de passe DB, etc.)
  3. Copier/lier .env.prod vers ${KALANKO_APP}/.env et adapter docker-compose
     pour la production (volumes sous ${KALANKO_DATA}, pas de ports DB/Redis exposés)
  4. Build & démarrage :
       cd ${KALANKO_APP}
       docker compose build
       docker compose up -d
  5. Migrations : docker compose exec backend alembic upgrade head
  6. Vérifier HTTPS : curl -I https://${DOMAIN} && curl -I https://${API_DOMAIN}/health
  7. Tester la connexion SSH : ssh ${KALANKO_USER}@${VPS_IP}
  8. Sauvegarder la clé privée ${KALANKO_HOME}/.ssh/id_ed25519 en lieu sûr

Sécurité :
  - Root SSH et authentification par mot de passe sont désactivés.
  - Assurez-vous que votre clé publique est dans ${KALANKO_HOME}/.ssh/authorized_keys
    avant de fermer la session root.

EOF
}

# =============================================================================
# MAIN
# =============================================================================
main() {
  require_root
  require_ubuntu_2404

  log "Démarrage provisioning Kalanko — $(date -u +%Y-%m-%dT%H:%M:%SZ) UTC"

  section_system_hardening
  section_ufw
  section_fail2ban
  section_docker
  section_caddy
  section_project_layout
  section_backup
  section_summary

  log "Provisioning terminé avec succès."
}

main "$@"
