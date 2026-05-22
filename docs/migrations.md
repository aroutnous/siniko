# Migrations base de données (Alembic)

## C’est quoi ?

Une **migration** = un fichier Python qui décrit une **évolution du schéma** PostgreSQL (créer une table `users`, ajouter une colonne, etc.).

**Alembic** applique ces fichiers **dans l’ordre**, comme Git pour la structure de la BDD.

Exemple : avant d’utiliser la table `students`, une migration `create_students_table` doit avoir été appliquée.

## Pourquoi c’est nécessaire ?

Sans migrations, le backend démarrerait alors que les **tables n’existent pas** → erreurs SQL au premier appel API.

## Comment c’est fait dans SINIKO (simplifié)

Il n’y a **plus de conteneur `migrations` séparé**.

Au démarrage de **`siniko-backend`** :

1. `alembic upgrade head` (met la BDD à jour)
2. puis `uvicorn` (l’API)

Fichier : `backend/docker-entrypoint.sh`

## Quand vous ajouterez des tables (prompts futurs)

Sur votre Mac, après génération d’un modèle SQLAlchemy :

```bash
cd backend
source .venv/bin/activate
alembic revision --autogenerate -m "add users table"
# vérifier le fichier dans alembic/versions/
docker compose up -d --build backend
```

La migration s’appliquera au prochain redémarrage du backend.

## Commande manuelle (optionnel)

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend alembic current
```
