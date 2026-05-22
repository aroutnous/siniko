# Supervision — SINIKO

Stratégie retenue : **pas de Wazuh sur Mac ARM64** en local.

## Environnements

| Environnement | Stack | Architecture |
|---------------|-------|----------------|
| **Local (Mac M4)** | Loki + Promtail + Grafana | `linux/arm64` — Docker Compose |
| **Production AWS** | CloudWatch Logs + Alarms | Natif AWS |
| **Option CDC** | Wazuh | **ECS/EC2 amd64 uniquement** (jamais en local ARM) |

## Local — Loki / Grafana / Promtail

Services dans `docker-compose.yml` :

| Service | Port | Rôle |
|---------|------|------|
| Loki | 3100 | Agrégation logs |
| Promtail | — | Collecte logs conteneurs Docker |
| Grafana | 3000 | Dashboards & exploration |

Logs API : JSON structuré (`structlog`) avec champs :

- `event` : `http_request`, `application_started`, …
- `method`, `path`, `status_code`, `client_host`
- `level`

### Requêtes LogQL utiles (Grafana)

```logql
{service="siniko"} |= "http_request"
```

```logql
{service="siniko"} | json | status_code >= 400
```

### Alertes à configurer (Grafana ou Loki Ruler)

| Scénario | Condition indicative |
|----------|----------------------|
| Brute force login | `status_code=401` sur `/api/v1/auth/login` > N / 5 min |
| Pic erreurs serveur | `status_code >= 500` > seuil |
| Accès admin anormal | combinaison `path` + `status_code` |

## Production — CloudWatch

| Ressource | Usage |
|-----------|--------|
| `aws_cloudwatch_log_group` | Logs ECS (/siniko/api) |
| **Metric filter** | Comptage 401, 5xx depuis logs JSON |
| **Alarm** | SNS / email — brute force, disponibilité |
| **Dashboard** | Vue ops + sécurité |

Exemple filtre (à affiner quand les routes auth existent) :

```text
{ $.status_code = 401 && $.path = "/api/v1/auth/login" }
```

## Wazuh (optionnel sur AWS)

Si le jury ou THL exigent Wazuh :

1. Déployer le manager Wazuh sur **ECS Fargate platform version LATEST** en **amd64**
2. Forwarder les logs CloudWatch ou agent sur les tasks API
3. Réutiliser les **mêmes règles métier** que Loki (brute force, 403 répétés)

Justification rapport : *images Wazuh non disponibles en ARM local → validation des règles via Loki, production via Wazuh amd64 ou CloudWatch selon coût/complexité.*

## Correspondance livrables CDC

| Exigence CDC | Implémentation |
|--------------|----------------|
| Centralisation logs | Loki (local) + CloudWatch (prod) |
| Détection activités suspectes | Alertes Grafana / CloudWatch Alarms |
| SIEM | Wazuh **option** prod amd64 ; Loki + CloudWatch = livrable principal |
