const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ALLOWED = ['getjusto.com','indriver.com','lindcorp.pe'];
const ok = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const sign = (value, secret) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

exports.handler = async (event) => {
  const AUTH_SECRET = process.env.AUTH_SECRET;
  if (!AUTH_SECRET) return ok(500, { error: 'Falta AUTH_SECRET' });
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.replace('Bearer ','');
  const [payload, signature] = token.split('.');
  if (!payload || !signature || sign(payload, AUTH_SECRET) !== signature) return ok(401, { error: 'Sesión inválida' });
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  const domain = String(parsed.email || '').toLowerCase().split('@')[1];
  if (!ALLOWED.includes(domain) || Date.now() > parsed.exp) return ok(401, { error: 'Sesión expirada' });
  const file = path.resolve(__dirname, '../../data/app-data.json');
  const content = fs.readFileSync(file, 'utf8');
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: content };
};
