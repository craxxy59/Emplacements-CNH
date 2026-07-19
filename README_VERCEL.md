# Déployer aussi sur Vercel sans dépendre de Netlify

Cette version contient un backend Vercel indépendant :

```txt
api/data.js
api/auth.js
vercel.json
```

Sur Vercel, l'application utilise :

```txt
/api/data
/api/auth
```

et stocke ses données dans Vercel Blob.

Sur Netlify, l'application continue d'utiliser :

```txt
/.netlify/functions/data
/.netlify/functions/auth
```

et stocke ses données dans Netlify Blobs.

Les deux hébergements sont donc indépendants. Les données Netlify et Vercel ne sont pas automatiquement partagées.

---

## Important : données séparées

Si tu déploies sur Vercel, tu auras une deuxième base de données.

```txt
Netlify Blobs ≠ Vercel Blob
```

Pour copier les données de Netlify vers Vercel :

1. Sur le site Netlify, connecte-toi en admin.
2. Exporte le JSON.
3. Ouvre le site Vercel.
4. Connecte-toi en admin.
5. Importe le JSON.

---

## Variables à configurer sur Vercel

Dans ton projet Vercel :

```txt
Settings > Storage
```

Crée/connecte un stockage :

```txt
Vercel Blob
```

Vercel ajoutera normalement automatiquement :

```txt
BLOB_READ_WRITE_TOKEN
```

Ajoute aussi une variable pour sécuriser les tokens et le chiffrement :

```txt
CNH_AUTH_SECRET
```

Valeur : mets une longue phrase secrète, par exemple générée aléatoirement.

Ne change plus cette variable ensuite, sinon les mots de passe chiffrés déjà stockés ne pourront plus être relus.

---

## Paramètres de build Vercel

Framework preset :

```txt
Other
```

Build command :

```txt
echo "No build needed"
```

Output directory :

```txt
.
```

Install command :

```txt
npm install
```

---

## Mots de passe par défaut côté Vercel

Les valeurs par défaut sont configurées dans :

```txt
api/auth.js
```

Les mots de passe actuels par défaut sont :

```txt
Read : CNH
Edit : CNH2026
Admin : CNH@rdelot
Debug : Ght10CD9
```

Ils sont stockés dans le code uniquement sous forme de hash SHA-256, sauf les valeurs par défaut utilisées pour l'affichage initial administrateur côté serveur.

---

## Tester Vercel

Après déploiement, ouvre :

```txt
https://TON-SITE.vercel.app/api/data
```

Tu dois obtenir :

```json
{"boats":[],"profiles":[]}
```

Puis ouvre :

```txt
https://TON-SITE.vercel.app
```

Connecte-toi et teste la création d'une fiche.
