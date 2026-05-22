# Bloquer merge et commit (DevSecOps)

## Les deux barrières

| Barrière | Où | Bloque quoi | Configuration |
|----------|-----|-------------|---------------|
| **pre-commit** | Votre Mac | `git commit` | `pre-commit install` (local) |
| **CI GitHub Actions** | GitHub | Merge sur `main` | Branch protection + workflow valide |

GitHub **ne bloque pas** le merge tout seul : il faut activer les règles sur `main`.

---

## 1. pre-commit — bloquer le commit

```bash
cd ~/siniko
pre-commit install
```

Si un hook échoue → le commit est **refusé** (rien n’est enregistré).

Test sans commit :

```bash
pre-commit run --all-files
```

**Note** : pre-commit ne bloque **pas** `git push` ni le merge sur GitHub.

---

## 2. Branch protection — bloquer le merge si CI rouge

GitHub → repo **siniko** → **Settings** → **Branches** → **Add branch protection rule**

| Option | Réglage |
|--------|---------|
| Branch name pattern | `main` |
| Require a pull request before merging | ✅ |
| Require status checks to pass before merging | ✅ |
| Require branches to be up to date before merging | ✅ (recommandé) |

Dans **Status checks that are required**, après une CI verte, ajoutez :

- `CI — gate` (job `ci-success`)
- ou les jobs individuels : `Secrets (gitleaks)`, `Backend — lint & tests`, etc.

Sans cette étape, GitHub affiche **« Checks: 0 »** et le bouton **Merge** reste cliquable même si Actions échoue.

---

## 3. Pourquoi la PR #16 a pu merger

1. **Aucune règle** sur `main` (merge manuel autorisé).
2. La CI **ne s’est pas exécutée correctement** (workflow invalide → échec en 0 s, onglet Checks vide ou absent).

Corriger le fichier `.github/workflows/ci.yml` puis pousser sur `main` ; configurer la branch protection.

---

## 3. Workflow recommandé

```text
git commit   → pre-commit (local) ❌ = pas de commit
git push + PR → CI GitHub          ❌ = pas de merge (si protection activée)
```
