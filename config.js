// Configuration CNH : Vercel utilise /api, Netlify utilise /.netlify/functions.
// Permet d'utiliser le même code sur les deux hébergements sans dépendance entre eux.
window.CNH_CONFIG = {
  API_PREFIX: location.hostname.includes('netlify.app') ? '/.netlify/functions' : '/api'
};

