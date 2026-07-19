const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const DEFAULT_DATA = { boats: [], profiles: [] };
const STORE_NAME = 'cnh-marina-data';
const KEY = 'main';
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = new Set([
  'https://emplacements-cnh.netlify.app',
  'https://emplacements-cnh.vercel.app',
  'http://localhost:3000'
]);
const ALLOWED_STATUSES = ['actif', 'hivernage', 'maintenance', 'archive'];
const ALLOWED_ZONES = ['haut', 'milieu', 'bas'];

function getCorsOrigin(event) {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || '';
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  return null;
}

function jsonResponse(event, body, statusCode = 200) {
  const origin = getCorsOrigin(event);
  const baseHeaders = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'vary': 'Origin',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://emplacements-cnh.netlify.app https://emplacements-cnh.vercel.app; font-src 'self'; frame-ancestors 'none'"
  };
  if (origin) {
    baseHeaders['access-control-allow-origin'] = origin;
  }
  return {
    statusCode,
    headers: baseHeaders,
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
    if (!parsed.role) return null;
    if (!parsed.iat || Date.now() - parsed.iat > TOKEN_MAX_AGE_MS) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}
function getTokenFromEvent(event) {
  const headers = event.headers || {};
  const authHeader = headers.authorization || headers.Authorization || '';
  if (authHeader) {
    const bearer = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    if (bearer) return bearer;
  }
  if (event.queryStringParameters && event.queryStringParameters.token) {
    return String(event.queryStringParameters.token);
  }
  try {
    const body = JSON.parse(event.body || '{}');
    if (body && body.token) return String(body.token);
  } catch (_) {}
  return null;
}

function getBlobStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name: STORE_NAME, siteID, token });
  return getStore(STORE_NAME);
}

function sanitizeBoats(boats) {
  if (!Array.isArray(boats)) return [];
  return boats.filter(b => b && typeof b === 'object').map(b => {
    const slot = parseInt(b.slot, 10);
    if (isNaN(slot) || slot < 1 || slot > 46) return null;
    const status = ALLOWED_STATUSES.includes(b.status) ? b.status : 'actif';
    const zone = ALLOWED_ZONES.includes(b.zone) ? b.zone : 'haut';
    const safeStr = (v, max = 200) => String(v ?? '').slice(0, max);
    return {
      id: safeStr(b.id, 100),
      slot,
      zone,
      status,
      name: safeStr(b.name, 100),
      ownerName: safeStr(b.ownerName, 100),
      ownerPhone: safeStr(b.ownerPhone, 30),
      ownerEmail: safeStr(b.ownerEmail, 100),
      licenceNumber: safeStr(b.licenceNumber, 50),
      registrationNumber: safeStr(b.registrationNumber, 50),
      boatType: safeStr(b.boatType, 50),
      length: b.length ? String(b.length).slice(0, 10) : '',
      width: b.width ? String(b.width).slice(0, 10) : '',
      equipment: safeStr(b.equipment, 500),
      notes: safeStr(b.notes, 2000),
      cotisationAJour: b.cotisationAJour === true,
      descenteTracteur: b.descenteTracteur === true,
      photoData: typeof b.photoData === 'string' && b.photoData.startsWith('data:image/') && b.photoData.length < 800000 ? b.photoData : '',
      updatedAt: b.updatedAt ? safeStr(b.updatedAt, 50) : new Date().toISOString()
    };
  }).filter(Boolean);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse(event, { ok: false, error: 'CORS non autorisé' }, 403);
    }
    return jsonResponse(event, { ok: true });
  }

  const token = getTokenFromEvent(event);
  const auth = verifyToken(token);
  const allowedRead = ['lecture', 'manager', 'admin', 'debug'];
  const allowedWrite = ['manager', 'admin', 'debug'];

  let store;
  try {
    store = getBlobStore();
  } catch (error) {
    return jsonResponse(event, { ok: false, error: 'Netlify Blobs non configuré', message: error.message }, 500);
  }

  if (event.httpMethod === 'GET') {
    if (!auth || !allowedRead.includes(auth.role)) {
      return jsonResponse(event, { ok: false, error: 'Non authentifié' }, 401);
    }
    try {
      const saved = await store.get(KEY, { type: 'json' });
      return jsonResponse(event, { boats: Array.isArray(saved?.boats) ? saved.boats : [], profiles: Array.isArray(saved?.profiles) ? saved.profiles : [] });
    } catch (error) {
      return jsonResponse(event, { ok: false, error: 'Lecture Netlify Blobs impossible', message: error.message }, 500);
    }
  }

  if (event.httpMethod === 'POST') {
    if (!auth || !allowedWrite.includes(auth.role)) {
      return jsonResponse(event, { ok: false, error: 'Accès refusé' }, 403);
    }
    try {
      const data = JSON.parse(event.body || '{}');
      const clean = {
        boats: sanitizeBoats(data.boats),
        profiles: Array.isArray(data.profiles) ? data.profiles.slice(0, 100) : [],
        updatedAt: new Date().toISOString()
      };
      await store.setJSON(KEY, clean);
      return jsonResponse(event, { ok: true, updatedAt: clean.updatedAt });
    } catch (error) {
      return jsonResponse(event, { ok: false, error: 'Sauvegarde Netlify Blobs impossible', message: error.message }, 500);
    }
  }

  return jsonResponse(event, { ok: false, error: 'Méthode non autorisée' }, 405);
};
