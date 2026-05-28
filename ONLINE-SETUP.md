# Activer la version online — CNH Marina Manager

Ce guide explique **pas à pas** comment passer la PWA CNH du mode démo au mode **en ligne avec synchronisation Supabase**.

---

## 1. Créer le projet Supabase

1. Aller sur https://supabase.com/
2. Cliquer sur **Start your project**
3. Créer un compte si besoin
4. Cliquer sur **New project**
5. Choisir l’organisation
6. Donner un nom au projet, par exemple :
   - `cnh-marina-manager`
7. Choisir un mot de passe de base de données
8. Choisir la région la plus proche (Europe)
9. Cliquer sur **Create new project**

Attendre que le projet soit prêt.

---

## 2. Créer les tables et la sécurité

1. Dans Supabase, ouvrir le projet
2. Aller dans **SQL Editor**
3. Cliquer sur **New query**
4. Ouvrir le fichier local :
   - `cnh-pwa/supabase-schema.sql`
5. Copier tout le contenu
6. Coller dans l’éditeur SQL
7. Cliquer sur **Run**

Ce script crée :
- la table `profiles`
- la table `boats`
- les rôles `admin / manager / viewer`
- les règles de sécurité (RLS)
- la création automatique d’un profil quand un utilisateur est créé dans Supabase Auth

---

## 3. Créer le premier compte administrateur

1. Dans Supabase, aller dans **Authentication**
2. Ouvrir l’onglet **Users**
3. Cliquer sur **Add user**
4. Entrer l’email admin du club, par exemple :
   - `admin@cnhardelot.fr`
5. Entrer un mot de passe temporaire
6. Créer l’utilisateur

Ensuite :

1. Retourner dans **SQL Editor**
2. Créer une nouvelle requête
3. Exécuter la requête suivante en remplaçant l’email si besoin :

```sql
update public.profiles
set role = 'admin', must_change_password = true
where email = 'admin@cnhardelot.fr';
```

Résultat :
- ce compte devient **admin**
- au premier login, il devra **changer son mot de passe**

---

## 4. Récupérer les clés Supabase

1. Aller dans **Project Settings**
2. Ouvrir **API**
3. Copier :
   - **Project URL**
   - **anon public key**

Tu en auras besoin pour `config.js`.

---

## 5. Configurer l’application

Dans le dossier `cnh-pwa/` :

1. Ouvrir le fichier `config.js`
2. Remplacer son contenu par quelque chose comme ceci :

```js
window.CNH_CONFIG = {
  appName: 'CNH Marina Manager',
  clubName: 'Club Nautique d\'Hardelot Plage',
  demoMode: false,
  supabaseUrl: 'https://TON-PROJET.supabase.co',
  supabaseAnonKey: 'TA_CLE_ANON_SUPABASE'
};
```

### Important
- `demoMode: false` active le vrai mode online
- `supabaseUrl` = URL du projet
- `supabaseAnonKey` = clé publique anon

---

## 6. Tester en local avant mise en ligne

Le plus simple est d’utiliser un petit serveur local.

### Option simple avec Python

Depuis le dossier `cnh-pwa/`, lancer :

```bash
python3 -m http.server 8080
```

Puis ouvrir :

- http://localhost:8080

### Que tester ?

1. Connexion avec le compte admin Supabase
2. Demande de changement de mot de passe au premier accès
3. Création d’une fiche bateau
4. Modification d’une fiche
5. Suppression d’une fiche
6. Déconnexion / reconnexion
7. Vérifier dans Supabase > Table Editor > `boats` que les données arrivent bien

---

## 7. Déployer sur Netlify

### Méthode la plus simple

1. Aller sur https://www.netlify.com/
2. Se connecter
3. Cliquer sur **Add new site**
4. Choisir **Deploy manually**
5. Glisser-déposer le dossier `cnh-pwa`

Le fichier `netlify.toml` est déjà prêt.

### Méthode propre recommandée

- mettre le projet dans GitHub
- connecter GitHub à Netlify
- laisser Netlify publier automatiquement

---

## 8. Vérifier la version online

Une fois publié :

1. Ouvrir l’URL Netlify
2. Se connecter avec l’admin créé dans Supabase
3. Changer le mot de passe
4. Créer un bateau test
5. Recharger la page
6. Vérifier que la donnée reste bien enregistrée

---

## 9. Créer d’autres utilisateurs

### Création des comptes

Dans la version actuelle :
- les comptes sont créés dans **Supabase Auth**
- ensuite leurs rôles sont gérés dans l’application admin

### Procédure

1. Aller dans **Authentication > Users**
2. Créer un utilisateur
3. L’utilisateur apparaîtra dans `profiles`
4. Dans l’application CNH, un admin peut ensuite lui donner un rôle :
   - `admin`
   - `manager`
   - `viewer`

---

## 10. Rôle de chaque profil

### Admin
- gère les bateaux
- gère les profils
- peut changer les rôles
- voit l’onglet administration

### Manager
- gère les bateaux
- ne gère pas les profils admin

### Viewer
- consultation seule
- pas de modification

---

## 11. Si quelque chose ne marche pas

### Problème : connexion impossible
Vérifier :
- email / mot de passe
- compte bien créé dans Supabase Auth
- `config.js` bien rempli

### Problème : aucune donnée ne s’enregistre
Vérifier :
- SQL bien exécuté
- table `boats` bien créée
- RLS bien créée
- `demoMode` bien à `false`
- URL / clé Supabase correctes

### Problème : compte admin sans droits
Réexécuter :

```sql
update public.profiles
set role = 'admin', must_change_password = true
where email = 'admin@cnhardelot.fr';
```

---

## 12. Recommandation pour la suite

Pour une vraie version production encore meilleure, la prochaine étape serait :

- stocker les photos dans **Supabase Storage**
- permettre la **création de comptes depuis l’admin**
- ajouter un **historique des mouvements de bateaux**
- ajouter un **export PDF / Excel**
- renommer les zones avec les vrais noms du CNH
