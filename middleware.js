// Password gate for the Stodelle House proposal builder.
// Reads SITE_USER and SITE_PASSWORD from the Vercel project's Environment Variables.

export const config = { matcher: '/:path*' };

const REALM = 'Stodelle House';

function readEnv(name) {
  try {
    const v = process.env[name];
    return typeof v === 'string' ? v.trim() : '';
  } catch (e) {
    return '';
  }
}

function visibleSettingNames() {
  try {
    return Object.keys(process.env || {})
      .filter((k) => /site|user|pass/i.test(k) && !/^VERCEL_/.test(k))
      .sort();
  } catch (e) {
    return [];
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setupPage() {
  const names = visibleSettingNames();
  const hasUser = readEnv('SITE_USER') !== '';
  const hasPass = readEnv('SITE_PASSWORD') !== '';
  const env = readEnv('VERCEL_ENV') || 'unknown';
  const deployment = readEnv('VERCEL_URL') || readEnv('VERCEL_DEPLOYMENT_ID') || 'unknown';
  const row = (label, ok) => `<li>${esc(label)}: <strong>${ok ? 'found' : 'missing'}</strong></li>`;
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Setup needed</title>
<style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;line-height:1.5;color:#1A1A1A;background:#F4F1EB}code{background:#fff;padding:1px 5px}</style>
</head><body>
<h1>This site is locked until its password is set</h1>
<p>Nobody can sign in until both settings below exist in Vercel under Settings, then Environment Variables. After adding them, redeploy.</p>
<ul>${row('SITE_USER', hasUser)}${row('SITE_PASSWORD', hasPass)}</ul>
<p>Setting names this deployment can see that look related (values are never shown):</p>
<p>${names.length ? names.map((n) => `<code>${esc(n)}</code>`).join(' ') : 'none'}</p>
<p>Environment: <code>${esc(env)}</code><br>Deployment: <code>${esc(deployment)}</code></p>
<p>Common mistakes: a typo or lowercase letters in the name, adding the setting to Preview but not Production, or forgetting to redeploy afterward.</p>
</body></html>`;
  return new Response(body, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Frame-Options': 'DENY',
    },
  });
}

function unauthorized() {
  return new Response('Sign in to view this page.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function decodeBasic(header) {
  if (!header || !/^Basic\s+/i.test(header)) return null;
  try {
    const bin = atob(header.replace(/^Basic\s+/i, '').trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const i = text.indexOf(':');
    if (i < 0) return null;
    return { user: text.slice(0, i), pass: text.slice(i + 1) };
  } catch (e) {
    return null;
  }
}

export default function middleware(request) {
  const expectedUser = readEnv('SITE_USER');
  const expectedPass = readEnv('SITE_PASSWORD');

  if (!expectedUser || !expectedPass) return setupPage();

  const creds = decodeBasic(request.headers.get('authorization'));
  if (!creds) return unauthorized();

  const userOk = sameText(creds.user.trim().toLowerCase(), expectedUser.toLowerCase());
  const passOk = sameText(creds.pass.trim(), expectedPass);
  if (!userOk || !passOk) return unauthorized();

  // Signed in: let the request continue to the page.
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
