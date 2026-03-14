const crypto = require('crypto');

const ALLOWED = ['getjusto.com','indriver.com','lindcorp.pe'];
const ok = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const sign = (value, secret) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return ok(405, { error: 'Method not allowed' });
  const { email } = JSON.parse(event.body || '{}');
  const domain = String(email || '').toLowerCase().split('@')[1];
  if (!ALLOWED.includes(domain)) return ok(400, { error: 'Dominio no permitido' });
  const AUTH_SECRET = process.env.AUTH_SECRET;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const OTP_FROM_EMAIL = process.env.OTP_FROM_EMAIL;
  if (!AUTH_SECRET || !RESEND_API_KEY || !OTP_FROM_EMAIL) return ok(500, { error: 'Faltan variables de entorno' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const exp = Date.now() + 10 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ email, code, exp })).toString('base64url');
  const challenge = `${payload}.${sign(payload, AUTH_SECRET)}`;

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;padding:24px">
      <h2 style="margin:0 0 8px;color:#101828">Tambo × inDrive Control Center</h2>
      <p style="margin:0 0 16px;color:#475467">Tu código dinámico de acceso es:</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:6px;background:#f5f7fa;padding:14px 18px;border-radius:12px;display:inline-block">${code}</div>
      <p style="margin-top:16px;color:#667085">Expira en 10 minutos.</p>
    </div>`;

  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: OTP_FROM_EMAIL, to: [email], subject: 'Tu código de acceso', html })
  });
  if (!send.ok) {
    const err = await send.text();
    return ok(502, { error: `No se pudo enviar el correo: ${err}` });
  }
  return ok(200, { challenge, ok: true });
};
