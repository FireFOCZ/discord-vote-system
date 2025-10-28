export function requireKey(req, res, next) {
  const hdr = req.header('X-API-Key');
  const auth = req.header('Authorization'); // "Bearer <key>"
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

  const got  = (hdr ?? bearer ?? '').trim();
  const need = (process.env.API_KEY ?? '').trim();

  if (!got || !need || got !== need) {
    console.warn('Unauthorized: got=', got ? `present(len=${got.length})` : 'missing',
                 'need=', need ? `present(len=${need.length})` : 'missing');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
