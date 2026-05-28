# CNH Marina Manager

PWA professionnelle pour le **Club Nautique d'Hardelot Plage**.

Le branding et les informations club ont été alignés avec le site :
https://basedeglissehardelot.fr/activites/le-club-nautique-dhardelot/

## Nouveautés de cette version

- design plus premium et plus cohérent CNH
- vraie expérience **mobile-first**
- **navigation basse mobile**
- **barre rapide mobile** pour la place sélectionnée
- **bouton flottant** d’ajout
- **mode cartes ultra compact**
- **actions rapides par swipe** sur mobile dans la liste bateaux
- **fiche bateau pensée smartphone** (sections claires + actions fixes en bas)
- compte admin avec **changement de mot de passe au premier accès**
- rôles :
  - `admin`
  - `manager`
  - `viewer`
- mode **démo local** immédiat
- mode **synchronisation en ligne** avec **Supabase**
- configuration prête pour **Netlify**

---

## Mode démo immédiat

Le fichier `config.js` est actuellement en mode démo.

### Comptes de démo

- **Admin** : `admin@cnh.local` / `Admin1234!`
- **Équipe** : `equipe@cnh.local` / `Staff1234!`
- **Lecture** : `lecture@cnh.local` / `View1234!`

Le compte admin doit changer son mot de passe à la première connexion.

---

## Version en ligne finalisée avec Supabase

### Étape 1 — créer le projet Supabase
Créer un projet Supabase.

### Étape 2 — exécuter le SQL
Dans **SQL Editor**, exécuter :

- `supabase-schema.sql`

Ce fichier crée :
- la table `profiles`
- la table `boats`
- les rôles `admin / manager / viewer`
- les policies RLS
- la création automatique d’un profil lors d’un nouvel utilisateur Auth

### Étape 3 — créer le premier compte admin
Dans **Supabase Auth > Users**, créer un premier utilisateur.

Ensuite exécuter :

```sql
update public.profiles
set role = 'admin', must_change_password = true
where email = 'admin@votre-club.fr';
```

### Étape 4 — configurer l’application
Copier `config.example.js` en `config.js` puis renseigner :

```js
window.CNH_CONFIG = {
  appName: 'CNH Marina Manager',
  clubName: 'Club Nautique d\'Hardelot Plage',
  demoMode: false,
  supabaseUrl: 'https://VOTRE-PROJET.supabase.co',
  supabaseAnonKey: 'VOTRE_ANON_KEY_SUPABASE'
};
```

### Étape 5 — déployer sur Netlify
Le fichier `netlify.toml` est déjà prêt.

Publier le dossier `cnh-pwa` sur Netlify.

---

## Fichiers principaux

- `index.html` → interface
- `styles.css` → design premium + mobile-first
- `app.js` → logique applicative
- `config.js` → configuration locale
- `config.example.js` → modèle de configuration online
- `supabase-schema.sql` → base de données, rôles et sécurité
- `service-worker.js` → PWA hors ligne
- `manifest.webmanifest` → installation PWA
- `netlify.toml` → déploiement Netlify

---

## Remarque production

La version en ligne est prête avec Supabase REST/Auth.

Pour une version encore plus poussée ensuite, je recommande :
- stockage photo dans Supabase Storage
- création d’utilisateurs depuis l’interface admin
- historique des mouvements de bateaux
- audit des actions
- export PDF / Excel
