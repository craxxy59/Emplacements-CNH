const crypto = require('crypto');
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
      'access-control-allow-headers': 'content-type,authorization'
    },
    body: JSON.stringify(body)
  };
}

function getSecret() {
  return process.env.CNH_AUTH_SECRET || process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_SITE_ID || 'cnh-dev-secret';
}
function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}
function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (sign(payload) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed && parsed.role ? parsed : null;
  } catch (_) {
    return null;
  }
}
function getTokenFromEvent(event) {
  const headers = event.headers || {};
  const authHeader =
    headers.authorization ||
    headers.Authorization ||
    headers['authorization'] ||
    headers['Authorization'] ||
    '';
  if (authHeader) {
    const bearer = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    if (bearer) return bearer;
  }
  // queryStringParameters
  if (event.queryStringParameters && event.queryStringParameters.token) {
    return String(event.queryStringParameters.token);
  }
  // body token fallback
  try {
    const body = JSON.parse(event.body || '{}');
    if (body && body.token) return String(body.token);
  } catch (_) {}
  return null;
}

function getBlobStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) {
    return getStore({ name: STORE_NAME, siteID, token });
  }
  return getStore(STORE_NAME);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({ ok: true });

  // Sécurité : exiger un token valide
  const token = getTokenFromEvent(event);
  const auth = verifyToken(token);
  const allowedRead = ['lecture', 'manager', 'admin', 'debug'];
  const allowedWrite = ['manager', 'admin', 'debug'];

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
    if (!auth || !allowedRead.includes(auth.role)) {
      return jsonResponse({ ok: false, error: 'Non authentifié', message: 'Token manquant ou invalide. Connecte-toi avec le mot de passe CNH.' }, 401);
    }
    try {
      const saved = await store.get(KEY, { type: 'json' });
      return jsonResponse({ boats: Array.isArray(saved?.boats) ? saved.boats : [], profiles: Array.isArray(saved?.profiles) ? saved.profiles : [] });
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: 'Lecture Netlify Blobs impossible',
        message: error.message
      }, 500);
    }
  }

  if (event.httpMethod === 'POST') {
    if (!auth || !allowedWrite.includes(auth.role)) {
      return jsonResponse({ ok: false, error: 'Accès refusé', message: 'Rôle modification/admin requis. Le rôle lecture ne peut pas enregistrer.' }, 403);
    }
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
