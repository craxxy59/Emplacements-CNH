# Déploiement CNH sur Netlify avec synchronisation gratuite

Cette version utilise :

- Netlify pour l’hébergement du site.
- Netlify Functions pour l’API de sauvegarde.
- Netlify Blobs pour stocker les données partagées entre les appareils.

Aucun compte Supabase n’est nécessaire.

---

## Arborescence essentielle

```txt
/
├── index.html
├── styles.css
├── app.js
├── config.js
├── data.json
├── plan-reference.png
├── plan emplacements.png
├── package.json
├── package-lock.json
├── netlify.toml
└── netlify/
    └── functions/
        └── data.js
```

Fichiers optionnels / non essentiels :

```txt
metadata.json
plan-reference-rotated.png
uploads/
README_DEPLOIEMENT.md
```

---

## Déploiement recommandé avec GitHub + Netlify

### 1. Créer un dépôt GitHub

1. Va sur GitHub.
2. Crée un nouveau repository, par exemple :

```txt
cnh-emplacements
```

3. Mets dedans les fichiers essentiels listés plus haut.

Important : le dossier `netlify/functions/data.js` doit bien être présent.

---

### 2. Connecter le projet à Netlify

1. Va sur Netlify.
2. Clique sur :

```txt
Add new site
```

3. Choisis :

```txt
Import an existing project
```

4. Connecte ton compte GitHub.
5. Sélectionne le dépôt `cnh-emplacements`.

---

### 3. Paramètres de build Netlify

Pour ce projet simple, tu peux mettre :

```txt
Build command : npm install
Publish directory : .
```

Le fichier `netlify.toml` indique déjà à Netlify où trouver les fonctions :

```txt
netlify/functions
```

---

### 4. Déployer

Clique sur :

```txt
Deploy site
```

Netlify va installer les dépendances, puis publier le site.

---

## Tester la synchronisation

Après déploiement :

1. Ouvre le site Netlify sur PC.
2. Connecte-toi.
3. Crée ou modifie une fiche bateau/emplacement.
4. Ouvre le même site sur téléphone.
5. Connecte-toi.
6. Les données doivent être récupérées depuis Netlify.

Sur PC, le bouton `Synchroniser` recharge les données partagées.

Sur mobile, comme demandé, l’interface affiche uniquement le plan aérien. Les données sont chargées au démarrage.

---

## Important

En local avec Live Server VS Code, la synchronisation Netlify ne fonctionne pas, car les fonctions Netlify ne sont pas lancées par Live Server.

En local :

```txt
localStorage seulement
```

Sur Netlify :

```txt
synchronisation entre appareils avec Netlify Blobs
```

---

## Si tu veux tester les fonctions en local

Tu peux utiliser Netlify CLI :

```bash
npm install
npx netlify dev
```

Puis ouvrir l’adresse indiquée par Netlify CLI, souvent :

```txt
http://localhost:8888
```

Contrairement à Live Server, `netlify dev` lance aussi les fonctions.

---

## Fichier de données partagé

La fonction :

```txt
/.netlify/functions/data
```

sert à :

- lire les données avec `GET`,
- sauvegarder les données avec `POST`.

Les données sont stockées dans Netlify Blobs, dans le store :

```txt
cnh-marina-data
```

avec la clé :

```txt
main
```
