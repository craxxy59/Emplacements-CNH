const crypto = require('crypto');
const { list, put, get } = require('@vercel/blob');

const KEY = 'cnh-marina-auth/password-record.json';
const DEFAULT_HASHES = {
  readonly: '273ab832692e54bed7d1f368383fbce7ab6ed96d7483b1a043c4d129aea373e4',
  manager: '7ca7991ff7b32be24a58293e79e479b50089e87e140084bb861ff28d32d4aaeb',
  admin: 'cd057980c403b7ab2f03e22c1557e518270031a81487a6117acc19611dd72b6b'
};
const DEBUG_HASH = 'c8104025419867191ab0ee142df9195d21d07675da50d9afe3e6f24d60104575';
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const ALLOWED_ORIGINS = [
  'https://emplacements-cnh.vercel.app',
  'https://emplacements-cnh.netlify.app',
  'https://enplacement-cnh.netlify.app',
  'http://localhost:5500',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5173'
];

// Rate limiting simple en mémoire
const attempts = new Map(); // ip -> { count, firstAt, blockedUntil }

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}
function checkRateLimit(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec) {
    attempts.set(ip, { count: 0, firstAt: now, blockedUntil: 0 });
    return { allowed: true };
  }
  if (rec.blockedUntil && rec.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((rec.blockedUntil - now) / 1000) };
  }
  // Reset après 5 min
  if (now - rec.firstAt > 5 * 60 * 1000) {
    rec.count = 0;
    rec.firstAt = now;
  }
  if (rec.count >= 8) {
    rec.blockedUntil = now + 15 * 60 * 1000;
    return { allowed: false, retryAfter: 900 };
  }
  return { allowed: true };
}
function recordFail(ip) {
  const rec = attempts.get(ip) || { count: 0, firstAt: Date.now(), blockedUntil: 0 };
  rec.count += 1;
  attempts.set(ip, rec);
}
function recordSuccess(ip) {
  attempts.delete(ip);
}

function getCorsOrigin(req) {
  const origin = req.headers.origin || req.headers.Origin || '';
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Autorise sous-domaines vercel/netlify en preview
  if (origin.endsWith('.vercel.app') || origin.endsWith('.netlify.app')) return origin;
  return ALLOWED_ORIGINS[0];
}

function jsonResponse(res, status, body, req) {
  const origin = req ? getCorsOrigin(req) : ALLOWED_ORIGINS[0];
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-methods', 'POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,authorization');
  res.setHeader('vary', 'Origin');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(body));
}

function sha256Legacy(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}
function hashSecure(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}
function verifySecure(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  // Nouveau format salt:hash
  if (stored.includes(':')) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    try {
      const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
      const a = Buffer.from(hash, 'hex');
      const b = Buffer.from(derived, 'hex');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (_) {
      return false;
    }
  }
  // Legacy SHA256
  return sha256Legacy(password) === stored;
}

function getSecret() {
  return process.env.CNH_AUTH_SECRET || process.env.BLOB_READ_WRITE_TOKEN || 'cnh-vercel-dev-secret';
}
function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}
function createToken(role) {
  const payload = Buffer.from(JSON.stringify({ role, iat: Date.now() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (sign(payload) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.role) return null;
    if (!parsed.iat || Date.now() - parsed.iat > TOKEN_MAX_AGE_MS) return null; // expiré
    return parsed;
  } catch (_) {
    return null;
  }
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
  try {
    const result = await list(blobOptions({ prefix: KEY, limit: 1 }));
    const blob = result.blobs.find((item) => item.pathname === KEY) || result.blobs[0];
    if (!blob) return null;
    const blobData = await get(KEY, blobOptions({ access: 'private' })).catch(async () => get(blob.url || KEY, blobOptions({ access: 'public' })));
    if (blobData?.stream) {
      const response = new Response(blobData.stream);
      return response.json();
    }
    if (blob.url) {
      const response = await fetch(`${blob.url}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return null;
      return response.json();
    }
    return null;
  } catch (_) {
    return null;
  }
}

async function getPasswordRecord() {
  const saved = await readJsonBlob();
  if (saved?.hashes) {
    return {
      hashes: {
        readonly: saved.hashes.readonly || DEFAULT_HASHES.readonly,
        manager: saved.hashes.manager || DEFAULT_HASHES.manager,
        admin: saved.hashes.admin || DEFAULT_HASHES.admin
      }
    };
  }
  return { hashes: { ...DEFAULT_HASHES } };
}

async function savePasswordRecord(hashes) {
  const record = {
    version: 3,
    hashes,
    updatedAt: new Date().toISOString()
  };
  await put(KEY, JSON.stringify(record), blobOptions({
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 60
  }));
}

function assertAdmin(token) {
  const auth = verifyToken(token);
  return auth && ['admin', 'debug'].includes(auth.role) ? auth : null;
}

function getTokenFromBodyOrHeader(body, req) {
  if (body.token) return String(body.token);
  const h = req.headers.authorization || req.headers.Authorization || '';
  if (h) return String(h).replace(/^Bearer\s+/i, '').trim();
  return null;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return jsonResponse(res, 200, { ok: true }, req);
  if (req.method !== 'POST') return jsonResponse(res, 405, { ok: false, error: 'Méthode non autorisée' }, req);

  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return jsonResponse(res, 429, { ok: false, error: 'Trop de tentatives', message: `Réessaie dans ${rl.retryAfter}s` }, req);
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (_) {
    return jsonResponse(res, 400, { ok: false, error: 'JSON invalide' }, req);
  }

  if (body.action === 'login') {
    const pwd = String(body.password || '');
    // Vérif debug en legacy SHA256 (fixe)
    if (sha256Legacy(pwd) === DEBUG_HASH) {
      recordSuccess(ip);
      return jsonResponse(res, 200, { ok: true, user: { name: 'Debug / Super admin', role: 'debug' }, token: createToken('debug') }, req);
    }
    const record = await getPasswordRecord();
    // Vérif chaque rôle avec support legacy + scrypt
    if (verifySecure(pwd, record.hashes.readonly)) {
      recordSuccess(ip);
      return jsonResponse(res, 200, { ok: true, user: { name: 'Consultation CNH', role: 'lecture' }, token: createToken('lecture') }, req);
    }
    if (verifySecure(pwd, record.hashes.manager)) {
      recordSuccess(ip);
      return jsonResponse(res, 200, { ok: true, user: { name: 'Modification CNH', role: 'manager' }, token: createToken('manager') }, req);
    }
    if (verifySecure(pwd, record.hashes.admin)) {
      recordSuccess(ip);
      return jsonResponse(res, 200, { ok: true, user: { name: 'Administration CNH', role: 'admin' }, token: createToken('admin') }, req);
    }
    recordFail(ip);
    return jsonResponse(res, 401, { ok: false, error: 'Mot de passe incorrect' }, req);
  }

  if (body.action === 'validate' || body.action === 'me') {
    const token = getTokenFromBodyOrHeader(body, req);
    const auth = verifyToken(token);
    if (!auth) return jsonResponse(res, 401, { ok: false, error: 'Session expirée' }, req);
    const names = { lecture: 'Consultation CNH', manager: 'Modification CNH', admin: 'Administration CNH', debug: 'Debug / Super admin' };
    return jsonResponse(res, 200, { ok: true, user: { name: names[auth.role] || auth.role, role: auth.role } }, req);
  }

  if (body.action === 'get-passwords') {
    const token = getTokenFromBodyOrHeader(body, req);
    if (!assertAdmin(token)) return jsonResponse(res, 403, { ok: false, error: 'Accès administrateur requis' }, req);
    // Ne jamais renvoyer les mots de passe en clair (F1 critique)
    return jsonResponse(res, 200, { ok: true, passwords: { readonly: '', manager: '', admin: '' }, message: 'Les mots de passe sont hachés et non récupérables. Utilise la réinitialisation.' }, req);
  }

  if (body.action === 'update-passwords') {
    const token = getTokenFromBodyOrHeader(body, req);
    if (!assertAdmin(token)) return jsonResponse(res, 403, { ok: false, error: 'Accès administrateur requis' }, req);

    const current = await getPasswordRecord();
    // On ne garde que les nouveaux mots de passe fournis, sinon on conserve l'ancien hash
    const input = body.passwords || {};
    const newHashes = { ...current.hashes };

    const toUpdate = {};
    if (String(input.readonly || '').trim()) toUpdate.readonly = String(input.readonly).trim();
    if (String(input.manager || '').trim()) toUpdate.manager = String(input.manager).trim();
    if (String(input.admin || '').trim()) toUpdate.admin = String(input.admin).trim();

    if (Object.keys(toUpdate).length === 0) {
      return jsonResponse(res, 400, { ok: false, error: 'Renseigne au moins un nouveau mot de passe à réinitialiser.' }, req);
    }

    if (toUpdate.readonly && toUpdate.readonly.length < 3) return jsonResponse(res, 400, { ok: false, error: 'Mot de passe consultation trop court' }, req);
    if (toUpdate.manager && toUpdate.manager.length < 3) return jsonResponse(res, 400, { ok: false, error: 'Mot de passe modification trop court' }, req);
    if (toUpdate.admin && toUpdate.admin.length < 4) return jsonResponse(res, 400, { ok: false, error: 'Mot de passe administration trop court' }, req);

    // Vérif unicité et différence avec debug
    const plainList = [toUpdate.readonly, toUpdate.manager, toUpdate.admin].filter(Boolean);
    if (plainList.some(p => sha256Legacy(p) === DEBUG_HASH)) {
      return jsonResponse(res, 400, { ok: false, error: 'Les mots de passe ne doivent pas être égaux au mot de passe debug' }, req);
    }
    if (new Set(plainList).size !== plainList.length) {
      return jsonResponse(res, 400, { ok: false, error: 'Les nouveaux mots de passe doivent être différents entre eux' }, req);
    }

    if (toUpdate.readonly) newHashes.readonly = hashSecure(toUpdate.readonly);
    if (toUpdate.manager) newHashes.manager = hashSecure(toUpdate.manager);
    if (toUpdate.admin) newHashes.admin = hashSecure(toUpdate.admin);

    await savePasswordRecord(newHashes);
    return jsonResponse(res, 200, { ok: true, message: 'Mots de passe réinitialisés avec hachage sécurisé. Sessions précédentes invalidées.' }, req);
  }

  return jsonResponse(res, 400, { ok: false, error: 'Action inconnue' }, req);
};
