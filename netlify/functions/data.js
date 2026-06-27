const { getStore } = require('@netlify/blobs');

const DEFAULT_DATA = { boats: [], profiles: [] };
const STORE_NAME = 'cnh-marina-data';
const KEY = 'main';

function jsonResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type'
    },
    body: JSON.stringify(body)
  };
}

function getBlobStore() {
  // Sur certains sites Netlify, Blobs n'est pas auto-configuré dans les Functions.
  // On force donc la configuration avec SITE_ID + NETLIFY_AUTH_TOKEN.
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (siteID && token) {
    return getStore({ name: STORE_NAME, siteID, token });
  }

  // Fonctionne uniquement si Netlify a injecté automatiquement le contexte Blobs.
  return getStore(STORE_NAME);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({ ok: true });

  let store;
  try {
    store = getBlobStore();
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: 'Netlify Blobs non configuré',
      details: 'Ajoute les variables NETLIFY_SITE_ID et NETLIFY_AUTH_TOKEN dans Netlify.',
      message: error.message
    }, 500);
  }

  if (event.httpMethod === 'GET') {
    try {
      const saved = await store.get(KEY, { type: 'json' });
      return jsonResponse(saved || DEFAULT_DATA);
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: 'Lecture Netlify Blobs impossible',
        message: error.message
      }, 500);
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const data = JSON.parse(event.body || '{}');
      const clean = {
        boats: Array.isArray(data.boats) ? data.boats : [],
        profiles: Array.isArray(data.profiles) ? data.profiles : [],
        updatedAt: new Date().toISOString()
      };
      await store.setJSON(KEY, clean);
      return jsonResponse({ ok: true, updatedAt: clean.updatedAt });
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: 'Sauvegarde Netlify Blobs impossible',
        message: error.message
      }, 500);
    }
  }

  return jsonResponse({ ok: false, error: 'Méthode non autorisée' }, 405);
};
