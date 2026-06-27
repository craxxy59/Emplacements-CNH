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
      'access-control-allow-headers': 'content-type,x-cnh-password'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({ ok: true });

  const store = getStore(STORE_NAME);

  if (event.httpMethod === 'GET') {
    const saved = await store.get(KEY, { type: 'json' });
    return jsonResponse(saved || DEFAULT_DATA);
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
      return jsonResponse({ ok: false, error: 'JSON invalide' }, 400);
    }
  }

  return jsonResponse({ ok: false, error: 'Méthode non autorisée' }, 405);
};
