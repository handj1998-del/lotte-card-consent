// Lotte consent shared reservations API (Cloudflare Worker + D1, Workers Free).
// Stores ONLY reservation number, name, phone, email (+id/version/timestamps). Never card, expiry, signature or PDF.
// Closed by default: admin can only be created while BOTH the SETUP_TOKEN secret and a <=24 h SETUP_UNTIL window exist.
// Same-origin design: this Worker serves the app (proxied read-only from GitHub Pages) AND the API, so the session is a
// first-party __Host- cookie (Secure, HttpOnly, SameSite=Strict). No CORS, no token in JS/localStorage.
const UPSTREAM = 'https://handj1998-del.github.io/lotte-card-consent';
// Password hashing is split (server-relief): the browser runs PBKDF2-SHA256 with CLIENT_ITER iterations over the password
// (salt = domain-separated username) and sends only the 256-bit derived key. The server stores
// HMAC-SHA256(PEPPER, random 16-byte salt || key) — ~1 ms CPU, fits Workers Free. Stolen DB + pepper still costs
// CLIENT_ITER PBKDF2 rounds per guess. Keep CLIENT_ITER in sync with server-reservations.js.
const CLIENT_ITER = 600000;
const COOKIE = '__Host-lcr_sid';
const SESSION_IDLE = 30 * 60e3, SESSION_MAX = 12 * 3600e3;
const MAX_FAILS = 5, WINDOW = 15 * 60e3, LOCK = 15 * 60e3, GLOBAL_MAX_FAILS = 50;
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = s => Uint8Array.from(s.match(/../g).map(h => parseInt(h, 16)));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function hashKey(keyB64, saltHex, pepper) {
  const kb = Uint8Array.from(atob(keyB64.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0));
  const salt = unhex(saltHex), msg = new Uint8Array(salt.length + kb.length); msg.set(salt); msg.set(kb, salt.length);
  const k = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, msg));
}
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;
function same(a, b) { const x = enc.encode(String(a)), y = enc.encode(String(b)); let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] | 0) ^ (y[i] | 0); return d === 0; }
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'", 'Strict-Transport-Security': 'max-age=31536000' };
function json(req, status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC, ...extra } });
}
const setCookie = (tok, maxAge) => ({ 'Set-Cookie': `${COOKIE}=${tok}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}` });
const clearCookie = () => setCookie('', 0);
function cookieTok(req) { const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)__Host-lcr_sid=([A-Za-z0-9_-]{43})(?:;|$)/); return m ? m[1] : null; }
async function proxy(req, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: SEC });
  if (url.pathname.includes('..') || url.pathname.startsWith('/worker/') || url.pathname.startsWith('/tests/') || url.pathname.startsWith('/.')) return new Response('Not found', { status: 404, headers: SEC });
  const up = await fetch(UPSTREAM + url.pathname + url.search, { method: req.method, cf: { cacheTtl: 300, cacheEverything: true } });
  const h = new Headers(SEC); for (const k of ['Content-Type', 'Content-Length', 'ETag', 'Last-Modified']) if (up.headers.get(k)) h.set(k, up.headers.get(k));
  h.set('Cache-Control', /text\/html/.test(up.headers.get('Content-Type') || '') ? 'no-cache' : 'public, max-age=300');
  return new Response(up.body, { status: up.status, headers: h });
}
const FIELDS = { no: 40, name: 80, phone: 40, email: 120 };
function looksLikeCard(v) { const d = v.replace(/[\s-]/g, ''); if (!/^\d{13,19}$/.test(d)) return false; let s = 0, e = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (e) { n *= 2; if (n > 9) n -= 9; } s += n; e = !e; } return s % 10 === 0; }
function validate(body, needVersion) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'body';
  const allowed = new Set([...Object.keys(FIELDS), ...(needVersion ? ['version'] : [])]);
  for (const k of Object.keys(body)) if (!allowed.has(k)) return 'field:' + k;
  const out = {};
  for (const [k, max] of Object.entries(FIELDS)) {
    const v = body[k] == null ? '' : body[k];
    if (typeof v !== 'string') return 'type:' + k;
    const t = v.trim(); if (t.length > max) return 'length:' + k;
    if (/[\u0000-\u001f]/.test(t)) return 'chars:' + k;
    if (looksLikeCard(t)) return 'card:' + k;
    out[k] = t;
  }
  if (!out.no || !out.name) return 'required';
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return 'email';
  if (needVersion) { if (!Number.isInteger(body.version) || body.version < 1) return 'version'; out.version = body.version; }
  return out;
}
const maskNo = v => v.length <= 4 ? v.replace(/.(?=.)/g, '•') : v.slice(0, 2) + '•'.repeat(Math.max(1, v.length - 5)) + v.slice(-3);
const maskName = v => { const c = [...v]; return c.length <= 1 ? v : c.length === 2 ? c[0] + '•' : c[0] + '•'.repeat(c.length - 2) + c[c.length - 1]; };
async function readJson(req) { if (!(req.headers.get('Content-Type') || '').startsWith('application/json')) return null; const t = await req.text(); if (t.length > 4096) return null; try { return JSON.parse(t); } catch { return null; } }
async function throttleCheck(db, key, now) {
  const r = await db.prepare('SELECT fails, window_start, locked_until FROM throttle WHERE key = ?').bind(key).first();
  return r && r.locked_until > now ? r.locked_until : 0;
}
async function throttleFail(db, key, now, max) {
  const r = await db.prepare('SELECT fails, window_start FROM throttle WHERE key = ?').bind(key).first();
  let fails = 1, ws = now; if (r && now - r.window_start < WINDOW) { fails = r.fails + 1; ws = r.window_start; }
  const locked = fails >= max ? now + LOCK : 0;
  await db.prepare('INSERT INTO throttle (key, fails, window_start, locked_until) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, window_start = excluded.window_start, locked_until = excluded.locked_until').bind(key, fails, ws, locked).run();
}
async function auth(req, env, now) {
  const tok = cookieTok(req); if (!tok) return false;
  const th = await sha256(tok);
  const s = await env.DB.prepare('SELECT last_seen, expires_at FROM sessions WHERE token_hash = ?').bind(th).first();
  if (!s || s.expires_at <= now || now - s.last_seen > SESSION_IDLE) { if (s) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run(); return false; }
  await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').bind(now, th).run();
  return th;
}
const b64url = u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function newSession(env, now, status = 200) {
  const token = b64url(rand(32));
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
  await env.DB.prepare('INSERT INTO sessions (token_hash, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), now, now, now + SESSION_MAX).run();
  return json(null, status, { ok: true, idleMs: SESSION_IDLE, expiresAt: now + SESSION_MAX }, setCookie(token, SESSION_MAX / 1000));
}
const setupOpen = (env, now) => !!(env.SETUP_TOKEN && env.SETUP_TOKEN.length >= 32 && Number(env.SETUP_UNTIL) > now && Number(env.SETUP_UNTIL) <= now + 24 * 3600e3);
export async function handle(req, env, now = Date.now()) {
  const url = new URL(req.url); const p = url.pathname;
  if (!p.startsWith('/api/')) return proxy(req, url);
  const origin = req.headers.get('Origin');
  if (origin && origin !== url.origin) return json(req, 403, { error: 'origin' });
  if (req.method !== 'GET' && (origin !== url.origin || req.headers.get('X-Requested-With') !== 'consent')) return json(req, 403, { error: 'csrf' });
  if (!env.DB || !env.PEPPER || env.PEPPER.length < 32) return json(req, 503, { error: 'not_configured' });
  const db = env.DB;
  const admin = await db.prepare('SELECT username, salt, iter, hash FROM admin WHERE id = 1').first();
  if (p === '/api/status' && req.method === 'GET') return json(req, 200, { configured: !!admin, setupOpen: !admin && setupOpen(env, now), kdf: { alg: 'PBKDF2-SHA256', iter: CLIENT_ITER } });
  if (p === '/api/setup' && req.method === 'POST') {
    if (admin) return json(req, 410, { error: 'already_configured' });
    if (!setupOpen(env, now)) return json(req, 503, { error: 'setup_closed' });
    const lockedS = await throttleCheck(db, 'setup', now);
    if (lockedS) return json(req, 429, { error: 'locked', retryAt: lockedS });
    const b = await readJson(req); if (!b) return json(req, 400, { error: 'body' });
    if (!same(b.token || '', env.SETUP_TOKEN)) { await throttleFail(db, 'setup', now, 10); return json(req, 401, { error: 'bad_token' }); }
    const u = String(b.username || '').trim(), key = String(b.key || '');
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(u)) return json(req, 400, { error: 'username' });
    if (!KEY_RE.test(key)) return json(req, 400, { error: 'key' });
    const salt = hex(rand(16));
    const r = await db.prepare('INSERT OR IGNORE INTO admin (id, username, salt, iter, hash, created_at) VALUES (1, ?, ?, ?, ?, ?)').bind(u, salt, CLIENT_ITER, await hashKey(key, salt, env.PEPPER), now).run();
    if (!r.meta || r.meta.changes !== 1) return json(req, 410, { error: 'already_configured' });
    return newSession(env, now, 201);
  }
  if (!admin) return json(req, 503, { error: 'not_configured' });
  if (p === '/api/login' && req.method === 'POST') {
    const ipKey = 'ip:' + await sha256(req.headers.get('CF-Connecting-IP') || 'unknown');
    const locked = Math.max(await throttleCheck(db, ipKey, now), await throttleCheck(db, 'global', now));
    if (locked) return json(req, 429, { error: 'locked', retryAt: locked });
    const b = await readJson(req); if (!b) return json(req, 400, { error: 'body' });
    const ok = same(String(b.username || ''), admin.username) & same(KEY_RE.test(String(b.key || '')) ? await hashKey(String(b.key), admin.salt, env.PEPPER) : '', admin.hash);
    if (!ok) { await throttleFail(db, ipKey, now, MAX_FAILS); await throttleFail(db, 'global', now, GLOBAL_MAX_FAILS); return json(req, 401, { error: 'bad_credentials' }); }
    await db.prepare('DELETE FROM throttle WHERE key = ?').bind(ipKey).run();
    return newSession(env, now);
  }
  const th = await auth(req, env, now); if (!th) return json(req, 401, { error: 'auth' }, cookieTok(req) ? clearCookie() : {});
  if (p === '/api/logout' && req.method === 'POST') { await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run(); return json(req, 200, { ok: true }, clearCookie()); }
  if (p === '/api/session' && req.method === 'GET') return json(req, 200, { ok: true });
  if (p === '/api/reservations' && req.method === 'GET') {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const c = url.searchParams.get('cursor'); let rows;
    if (c && /^\d+:[0-9a-f-]{36}$/.test(c)) { const [t, id] = c.split(':'); rows = (await db.prepare('SELECT id, res_no, name, version, updated_at FROM reservations WHERE (updated_at < ?) OR (updated_at = ? AND id > ?) ORDER BY updated_at DESC, id LIMIT ?').bind(+t, +t, id, limit + 1).all()).results; }
    else rows = (await db.prepare('SELECT id, res_no, name, version, updated_at FROM reservations ORDER BY updated_at DESC, id LIMIT ?').bind(limit + 1).all()).results;
    const more = rows.length > limit; rows = rows.slice(0, limit);
    return json(req, 200, { items: rows.map(r => ({ id: r.id, label: `${maskNo(r.res_no)} · ${maskName(r.name)}`, version: r.version, updatedAt: r.updated_at })), next: more ? `${rows[rows.length - 1].updated_at}:${rows[rows.length - 1].id}` : null });
  }
  if (p === '/api/reservations' && req.method === 'POST') {
    const v = validate(await readJson(req), false); if (typeof v === 'string') return json(req, 400, { error: v });
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO reservations (id, res_no, name, phone, email, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').bind(id, v.no, v.name, v.phone, v.email, now, now).run();
    return json(req, 201, { id, version: 1 });
  }
  const m = p.match(/^\/api\/reservations\/([0-9a-f-]{36})$/);
  if (m) {
    const id = m[1];
    if (req.method === 'GET') { const r = await db.prepare('SELECT id, res_no, name, phone, email, version FROM reservations WHERE id = ?').bind(id).first(); return r ? json(req, 200, { id: r.id, no: r.res_no, name: r.name, phone: r.phone, email: r.email, version: r.version }) : json(req, 404, { error: 'not_found' }); }
    if (req.method === 'PUT') {
      const v = validate(await readJson(req), true); if (typeof v === 'string') return json(req, 400, { error: v });
      const r = await db.prepare('UPDATE reservations SET res_no = ?, name = ?, phone = ?, email = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?').bind(v.no, v.name, v.phone, v.email, now, id, v.version).run();
      if (r.meta.changes !== 1) { const ex = await db.prepare('SELECT version FROM reservations WHERE id = ?').bind(id).first(); return json(req, ex ? 409 : 404, { error: ex ? 'conflict' : 'not_found' }); }
      return json(req, 200, { id, version: v.version + 1 });
    }
    if (req.method === 'DELETE') {
      const ver = parseInt(url.searchParams.get('version') || '', 10); if (!(ver >= 1)) return json(req, 400, { error: 'version' });
      const r = await db.prepare('DELETE FROM reservations WHERE id = ? AND version = ?').bind(id, ver).run();
      if (r.meta.changes !== 1) { const ex = await db.prepare('SELECT version FROM reservations WHERE id = ?').bind(id).first(); return json(req, ex ? 409 : 404, { error: ex ? 'conflict' : 'not_found' }); }
      return json(req, 200, { ok: true });
    }
  }
  return json(req, 404, { error: 'not_found' });
}
export default { async fetch(req, env) { try { return await handle(req, env); } catch { return json(req, 500, { error: 'server' }); } } };
