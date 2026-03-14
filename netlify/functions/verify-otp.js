const crypto = require('crypto');
const ALLOWED = ['getjusto.com','indriver.com','lindcorp.pe'];
const ok = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const sign = (value, secret) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return ok(405, { error: 'Method not allowed' });
  const { email, code, challenge } = JSON.parse(event.body || '{}');
  const domain = String(email || '').toLowerCase().split('@')[1];
  if (!ALLOWED.includes(domain)) return ok(400, { error: 'Dominio no permitido' });
  const AUTH_SECRET = process.env.AUTH_SECRET;
  if (!AUTH_SECRET) return ok(500, { error: 'Falta AUTH_SECRET' });
  const [payload, signature] = String(challenge || '').split('.');
  if (!payload || !signature || sign(payload, AUTH_SECRET) !== signature) return ok(401, { error: 'Challenge inválido' });
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (parsed.email !== email || parsed.code !== code || Date.now() > parsed.exp) return ok(401, { error: 'Código inválido o expirado' });
  const sessionPayload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url');
  const token = `${sessionPayload}.${sign(sessionPayload, AUTH_SECRET)}`;
  return ok(200, { token, ok: true });
};
