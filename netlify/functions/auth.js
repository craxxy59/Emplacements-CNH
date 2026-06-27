const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'cnh-marina-auth';
const KEY = 'password-record';

// Mots de passe par défaut stockés sous forme d'empreintes SHA-256.
const DEFAULT_HASHES = {
  readonly: '273ab832692e54bed7d1f368383fbce7ab6ed96d7483b1a043c4d129aea373e4',
  manager: '7ca7991ff7b32be24a58293e79e479b50089e87e140084bb861ff28d32d4aaeb',
  admin: 'cd057980c403b7ab2f03e22c1557e518270031a81487a6117acc19611dd72b6b'
};


// Les valeurs par défaut servent uniquement à initialiser l'écran admin.
// Elles ne sont pas envoyées dans app.js.
const DEFAULT_PASSWORDS = {
  readonly: 'CNH2026',
  manager: 'CNH',
  admin: 'CNHardelot'
};

// Mot de passe debug/super admin fixe, non modifiable par l'administrateur.
const DEBUG_HASH = 'c8104025419867191ab0ee142df9195d21d07675da50d9afe3e6f24d60104575';

function jsonResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization'
    },
    body: JSON.stringify(body)
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function getSecret() {
  return process.env.CNH_AUTH_SECRET || process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_SITE_ID || 'cnh-dev-secret';
}

function getEncryptionKey() {
  return crypto.createHash('sha256').update(getSecret(), 'utf8').digest();
}

function encryptText(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptText(value) {
  if (!value || typeof value !== 'string' || value.split('.').length !== 3) return '';
  const [ivB64, tagB64, encryptedB64] = value.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
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
    return parsed;
  } catch (_) {
    return null;
  }
}

function getBlobStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name: STORE_NAME, siteID, token });
  return getStore(STORE_NAME);
}

function buildRecordFromPasswords(passwords) {
  return {
    version: 2,
    hashes: {
      readonly: sha256(passwords.readonly),
      manager: sha256(passwords.manager),
      admin: sha256(passwords.admin)
    },
    encrypted: {
      readonly: encryptText(passwords.readonly),
      manager: encryptText(passwords.manager),
      admin: encryptText(passwords.admin)
    },
    updatedAt: new Date().toISOString()
  };
}

function decryptPasswords(record) {
  return {
    readonly: decryptText(record?.encrypted?.readonly),
    manager: decryptText(record?.encrypted?.manager),
    admin: decryptText(record?.encrypted?.admin)
  };
}

async function getPasswordRecord() {
  const store = getBlobStore();
  const saved = await store.get(KEY, { type: 'json' });

  if (saved?.hashes) {
    const passwords = decryptPasswords(saved);

    // Migration douce : si les mots de passe enregistrés correspondent aux valeurs par défaut,
    // on peut reconstituer l'affichage. Pour des anciens mots de passe personnalisés stockés
    // uniquement en hash, il faudra les ressaisir une fois.
    const migratedPasswords = {
      readonly: passwords.readonly || (saved.hashes.readonly === DEFAULT_HASHES.readonly ? DEFAULT_PASSWORDS.readonly : ''),
      manager: passwords.manager || (saved.hashes.manager === DEFAULT_HASHES.manager ? DEFAULT_PASSWORDS.manager : ''),
      admin: passwords.admin || (saved.hashes.admin === DEFAULT_HASHES.admin ? DEFAULT_PASSWORDS.admin : '')
    };

    return {
      version: saved.version || 1,
      hashes: {
        readonly: saved.hashes.readonly || DEFAULT_HASHES.readonly,
        manager: saved.hashes.manager || DEFAULT_HASHES.manager,
        admin: saved.hashes.admin || DEFAULT_HASHES.admin
      },
      passwords: migratedPasswords
    };
  }

  return {
    version: 2,
    hashes: { ...DEFAULT_HASHES },
    passwords: { ...DEFAULT_PASSWORDS }
  };
}

async function savePasswordRecordFromPasswords(passwords) {
  const store = getBlobStore();
  const record = buildRecordFromPasswords(passwords);
  await store.setJSON(KEY, record);
  return record;
}

function assertAdmin(token) {
  const auth = verifyToken(token);
  return auth && ['admin', 'debug'].includes(auth.role) ? auth : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({ ok: true });
  if (event.httpMethod !== 'POST') return jsonResponse({ ok: false, error: 'Méthode non autorisée' }, 405);

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return jsonResponse({ ok: false, error: 'JSON invalide' }, 400);
  }

  if (body.action === 'login') {
    const hash = sha256(body.password || '');
    const record = await getPasswordRecord();
    const hashes = record.hashes;

    if (hash === DEBUG_HASH) {
      return jsonResponse({ ok: true, user: { name: 'Debug / Super admin', role: 'debug' }, token: createToken('debug') });
    }
    if (hash === hashes.readonly) {
      return jsonResponse({ ok: true, user: { name: 'Consultation CNH', role: 'lecture' }, token: createToken('lecture') });
    }
    if (hash === hashes.manager) {
      return jsonResponse({ ok: true, user: { name: 'Modification CNH', role: 'manager' }, token: createToken('manager') });
    }
    if (hash === hashes.admin) {
      return jsonResponse({ ok: true, user: { name: 'Administration CNH', role: 'admin' }, token: createToken('admin') });
    }
    return jsonResponse({ ok: false, error: 'Mot de passe incorrect' }, 401);
  }

  if (body.action === 'get-passwords') {
    const auth = assertAdmin(body.token || event.headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (!auth) return jsonResponse({ ok: false, error: 'Accès administrateur requis' }, 403);
    const record = await getPasswordRecord();
    return jsonResponse({ ok: true, passwords: record.passwords });
  }

  if (body.action === 'update-passwords') {
    const auth = assertAdmin(body.token || event.headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (!auth) return jsonResponse({ ok: false, error: 'Accès administrateur requis' }, 403);

    const current = await getPasswordRecord();
    const passwords = {
      readonly: String(body.passwords?.readonly || '').trim() || current.passwords.readonly,
      manager: String(body.passwords?.manager || '').trim() || current.passwords.manager,
      admin: String(body.passwords?.admin || '').trim() || current.passwords.admin
    };

    if (!passwords.readonly || !passwords.manager || !passwords.admin) {
      return jsonResponse({ ok: false, error: 'Impossible de conserver un ancien mot de passe non récupérable. Renseigne les 3 une fois.' }, 400);
    }
    if (passwords.readonly.length < 3 || passwords.manager.length < 3 || passwords.admin.length < 4) {
      return jsonResponse({ ok: false, error: 'Les mots de passe sont trop courts' }, 400);
    }

    const hashes = { readonly: sha256(passwords.readonly), manager: sha256(passwords.manager), admin: sha256(passwords.admin) };
    if (new Set([hashes.readonly, hashes.manager, hashes.admin, DEBUG_HASH]).size < 4) {
      return jsonResponse({ ok: false, error: 'Les mots de passe doivent être différents du debug et entre eux' }, 400);
    }

    await savePasswordRecordFromPasswords(passwords);
    return jsonResponse({ ok: true, passwords });
  }

  return jsonResponse({ ok: false, error: 'Action inconnue' }, 400);
};
