const crypto = require('crypto');
const { list, put, get } = require('@vercel/blob');

const DEFAULT_DATA = { boats: [], profiles: [] };
const KEY = 'cnh-marina-data/main.json';
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = [
  'https://emplacements-cnh.vercel.app',
  'https://emplacements-cnh.netlify.app',
  'https://enplacement-cnh.netlify.app',
  'http://localhost:5500',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5173'
];

function getCorsOrigin(req) {
  const origin = req.headers.origin || req.headers.Origin || '';
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.endsWith('.vercel.app') || origin.endsWith('.netlify.app')) return origin;
  return ALLOWED_ORIGINS[0];
}

function jsonResponse(res, status, body, req) {
  const origin = req ? getCorsOrigin(req) : ALLOWED_ORIGINS[0];
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,authorization');
  res.setHeader('vary', 'Origin');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(body));
}

function getSecret() {
  return process.env.CNH_AUTH_SECRET || process.env.BLOB_READ_WRITE_TOKEN || 'cnh-vercel-dev-secret';
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
function getTokenFromRequest(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  if (authHeader) {
    const bearer = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    if (bearer) return bearer;
  }
  if (req.query && req.query.token) return String(req.query.token);
  try {
    const url = new URL(req.url || '', 'http://localhost');
    const t = url.searchParams.get('token');
    if (t) return t;
  } catch (_) {}
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (body && body.token) return String(body.token);
  } catch (_) {}
  return null;
}

function blobOptions(extra = {}) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const storeId = process.env.BLOB_STORE_ID;
  return {
    ...extra,
    ...(token ? { token } : {}),
    ...(oidcToken && storeId ? { oidcToken, storeId } : {})
  };
}

async function readJsonBlob() {
  const result = await list(blobOptions({ prefix: KEY, limit: 1 }));
  const blob = result.blobs.find((item) => item.pathname === KEY) || result.blobs[0];
  if (!blob) return DEFAULT_DATA;
  const blobData = await get(KEY, blobOptions({ access: 'private' })).catch(async () => get(blob.url || KEY, blobOptions({ access: 'public' })));
  if (blobData?.stream) {
    const response = new Response(blobData.stream);
    return response.json();
  }
  if (blob.url) {
    const response = await fetch(`${blob.url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return DEFAULT_DATA;
    return response.json();
  }
  return DEFAULT_DATA;
}

// Validation stricte des données (F3)
const ALLOWED_STATUSES = ['actif', 'hivernage', 'maintenance', 'archive'];
const ALLOWED_ZONES = ['haut', 'milieu', 'bas'];
function sanitizeBoats(boats) {
  if (!Array.isArray(boats)) return [];
  return boats.filter(b => b && typeof b === 'object').map(b => {
    const slot = parseInt(b.slot, 10);
    if (isNaN(slot) || slot < 1 || slot > 46) return null;
    const status = ALLOWED_STATUSES.includes(b.status) ? b.status : 'actif';
    const zone = ALLOWED_ZONES.includes(b.zone) ? b.zone : 'haut';
    // Limite tailles pour éviter payload énorme
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

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return jsonResponse(res, 200, { ok: true }, req);

  const token = getTokenFromRequest(req);
  const auth = verifyToken(token);
  const allowedRead = ['lecture', 'manager', 'admin', 'debug'];
  const allowedWrite = ['manager', 'admin', 'debug'];

  if (req.method === 'GET') {
    if (!auth || !allowedRead.includes(auth.role)) {
      return jsonResponse(res, 401, { ok: false, error: 'Non authentifié' }, req);
    }
    try {
      const saved = await readJsonBlob();
      return jsonResponse(res, 200, {
        boats: Array.isArray(saved?.boats) ? saved.boats : [],
        profiles: Array.isArray(saved?.profiles) ? saved.profiles : []
      }, req);
    } catch (error) {
      return jsonResponse(res, 500, { ok: false, error: 'Lecture Vercel Blob impossible', message: error.message }, req);
    }
  }

  if (req.method === 'POST') {
    if (!auth || !allowedWrite.includes(auth.role)) {
      return jsonResponse(res, 403, { ok: false, error: 'Accès refusé' }, req);
    }
    try {
      const data = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const clean = {
        boats: sanitizeBoats(data.boats),
        profiles: Array.isArray(data.profiles) ? data.profiles.slice(0, 100) : [],
        updatedAt: new Date().toISOString()
      };
      await put(KEY, JSON.stringify(clean), blobOptions({
        access: 'private',
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: 'application/json',
        cacheControlMaxAge: 60
      }));
      return jsonResponse(res, 200, { ok: true, updatedAt: clean.updatedAt }, req);
    } catch (error) {
      return jsonResponse(res, 500, { ok: false, error: 'Sauvegarde Vercel Blob impossible', message: error.message }, req);
    }
  }

  return jsonResponse(res, 405, { ok: false, error: 'Méthode non autorisée' }, req);
};
