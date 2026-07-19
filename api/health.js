function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async (_req, res) => {
  return jsonResponse(res, 200, {
    ok: true,
    api: 'vercel',
    blob: {
      hasBlobReadWriteToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      hasOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN),
      hasBlobStoreId: Boolean(process.env.BLOB_STORE_ID),
      ready: Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID))
    },
    auth: {
      hasCnhAuthSecret: Boolean(process.env.CNH_AUTH_SECRET)
    }
  });
};
