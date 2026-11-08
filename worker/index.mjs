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
// Persistent sign-in (owner choice): no idle expiry; sliding 400-day lifetime (Chrome's cookie Max-Age ceiling), renewed at most
// once a day on use. Ends only on deliberate logout (this session) or password change/account reset (all sessions).
const SESSION_MAX = 400 * 86400e3, RENEW_AFTER = 86400e3;
const renewals = new WeakMap();
const MAX_FAILS = 5, WINDOW = 15 * 60e3, LOCK = 15 * 60e3, GLOBAL_MAX_FAILS = 20, GLOBAL_LOCK = 60 * 60e3; // short passwords allowed by owner choice -> tight global cap
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
// Username: NFC-normalised, 2–32 characters, only ASCII letters/digits . _ - and precomposed Hangul syllables (U+AC00–U+D7A3).
const normUser = v => String(v || '').normalize('NFC').trim();
const USER_RE = /^[A-Za-z0-9._\-\uAC00-\uD7A3]{2,32}$/;
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
// Phone: digits with common punctuation (space - . ( ) and one leading +). International form (+ or 00 then a country code
// 1-9) follows E.164: country code + national number = 8-15 digits, so 13-17-digit strings like 00358... are accepted even when
// they happen to pass Luhn (no payment card number starts with 0, ISO/IEC 7812). Domestic numbers: 4-15 digits and, if
// 13-15 digits, must not pass Luhn (a bare card-shaped number stays blocked). Ambiguous digit strings cannot be told apart
// perfectly; this keeps obvious card numbers out while allowing real international phones.
function phoneOk(v) {
  if (!v) return true;
  if (!/^\+?[\d\s().-]+$/.test(v)) return false;
  const d = v.replace(/\D/g, '');
  const intl = v.startsWith('+') ? d : d.startsWith('00') ? d.slice(2) : null;
  if (intl !== null) return /^[1-9]\d{7,14}$/.test(intl);
  return d.length >= 4 && d.length <= 15 && !looksLikeCard(d);
}
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
    if (k === 'phone' ? !phoneOk(t) : looksLikeCard(t)) return (k === 'phone' && !looksLikeCard(t) ? 'phone' : 'card:' + k);
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
async function throttleFail(db, key, now, max, lockMs = LOCK) {
  const r = await db.prepare('SELECT fails, window_start FROM throttle WHERE key = ?').bind(key).first();
  let fails = 1, ws = now; if (r && now - r.window_start < WINDOW) { fails = r.fails + 1; ws = r.window_start; }
  const locked = fails >= max ? now + lockMs : 0;
  await db.prepare('INSERT INTO throttle (key, fails, window_start, locked_until) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, window_start = excluded.window_start, locked_until = excluded.locked_until').bind(key, fails, ws, locked).run();
}
async function auth(req, env, now) {
  const tok = cookieTok(req); if (!tok) return false;
  const th = await sha256(tok);
  const s = await env.DB.prepare('SELECT last_seen, expires_at FROM sessions WHERE token_hash = ?').bind(th).first();
  if (!s || s.expires_at <= now) { if (s) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run(); return false; }
  if (now - s.last_seen > RENEW_AFTER) { await env.DB.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?').bind(now, now + SESSION_MAX, th).run(); renewals.set(req, tok); }
  return th;
}
const b64url = u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function newSession(env, now, status = 200) {
  const token = b64url(rand(32));
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
  await env.DB.prepare('INSERT INTO sessions (token_hash, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), now, now, now + SESSION_MAX).run();
  return json(null, status, { ok: true, expiresAt: now + SESSION_MAX }, setCookie(token, SESSION_MAX / 1000));
}
const setupOpen = (env, now) => !!(env.SETUP_TOKEN && env.SETUP_TOKEN.length >= 32 && Number(env.SETUP_UNTIL) > now && Number(env.SETUP_UNTIL) <= now + 24 * 3600e3);
// ---- Live PC review relay (Durable Object, SQLite class, no storage used) --------------------------------------------------
// Tablet ("pub") and PC viewers ("sub") must both be signed in. The DO only forwards ECDH public keys and AES-GCM ciphertext
// between them in memory; it never writes to storage and never sees form data, keys or signatures in plaintext.
const RV_PUB_MS = 30 * 60e3, RV_SUB_MS = 2 * 3600e3, RV_MAX_SUBS = 3, RV_MAX_MSG = 900000, RV_RECHECK = 30e3;
async function review(req, env, now, url, origin) {
  if (origin !== url.origin) return json(req, 403, { error: 'origin' });
  if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return json(req, 426, { error: 'upgrade' });
  const role = url.searchParams.get('role'); if (role !== 'pub' && role !== 'sub') return json(req, 400, { error: 'role' });
  if (!env.DB || !env.PEPPER || !env.RELAY) return json(req, 503, { error: 'not_configured' });
  const th = await auth(req, env, now); if (!th) return json(req, 401, { error: 'auth' });
  const fwd = new Request('https://relay/connect?role=' + role, { headers: { 'Upgrade': 'websocket', 'X-Session': th, 'X-Now': String(now) } });
  return env.RELAY.get(env.RELAY.idFromName('main')).fetch(fwd);
}
const wsSend = (ws, m) => { try { ws.send(JSON.stringify(m)); } catch {} };
export class Relay {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  subs() { return this.ctx.getWebSockets('sub'); }
  pubs() { return this.ctx.getWebSockets('pub'); }
  async fetch(req) {
    const url = new URL(req.url), role = url.searchParams.get('role'), now = Number(req.headers.get('X-Now')) || Date.now();
    if (role === 'sub' && this.subs().length >= RV_MAX_SUBS) return new Response('full', { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    if (role === 'pub') for (const o of this.pubs()) { const a = o.deserializeAttachment() || {}; a.replaced = true; o.serializeAttachment(a); try { o.close(4001, 'replaced'); } catch {} }
    const id = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, [role, id]);
    server.serializeAttachment({ role, id, sess: req.headers.get('X-Session'), exp: now + (role === 'pub' ? RV_PUB_MS : RV_SUB_MS), checked: now });
    if (role === 'pub') for (const v of this.subs()) wsSend(v, { t: 'pubup' });
    else for (const p of this.pubs()) wsSend(p, { t: 'sub', id });
    wsSend(server, { t: 'joined', role, id, pub: this.pubs().some(p => !(p.deserializeAttachment() || {}).replaced) });
    return new Response(null, { status: 101, webSocket: client });
  }
  async alive(ws, a, now) {
    if (now > a.exp) { try { ws.close(4002, 'expired'); } catch {} return false; }
    if (now - a.checked > RV_RECHECK && this.env && this.env.DB) {
      const s = await this.env.DB.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').bind(a.sess).first();
      if (!s || s.expires_at <= now) { try { ws.close(4003, 'signed_out'); } catch {} return false; }
      a.checked = now; ws.serializeAttachment(a);
    }
    return true;
  }
  async webSocketMessage(ws, msg, now = Date.now()) {
    const a = ws.deserializeAttachment(); if (!a) { try { ws.close(1008, 'state'); } catch {} return; }
    if (typeof msg !== 'string' || msg.length > RV_MAX_MSG) { try { ws.close(1009, 'too_big'); } catch {} return; }
    if (!(await this.alive(ws, a, now))) return;
    let m; try { m = JSON.parse(msg); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (a.role === 'sub') { if (m.t === 'hello' && m.pub && typeof m.pub === 'object') for (const p of this.pubs()) if (!(p.deserializeAttachment() || {}).replaced) wsSend(p, { t: 'hello', from: a.id, pub: m.pub }); return; }
    if (a.replaced) return;
    if (m.t === 'end') { for (const v of this.subs()) wsSend(v, { t: 'end' }); try { ws.close(1000, 'end'); } catch {} return; }
    if ((m.t === 'key' || m.t === 'data') && typeof m.to === 'string') {
      for (const v of this.ctx.getWebSockets(m.to)) { const va = v.deserializeAttachment(); if (va && va.role === 'sub' && await this.alive(v, va, now)) wsSend(v, m.t === 'key' ? { t: 'key', pub: m.pub } : { t: 'data', iv: m.iv, ct: m.ct }); }
    }
  }
  async webSocketClose(ws) {
    const a = ws.deserializeAttachment() || {};
    if (a.role === 'pub' && !a.replaced && !this.pubs().some(p => p !== ws && !(p.deserializeAttachment() || {}).replaced)) for (const v of this.subs()) wsSend(v, { t: 'gone' });
    if (a.role === 'sub') for (const p of this.pubs()) wsSend(p, { t: 'subgone', id: a.id });
    try { ws.close(1000, 'bye'); } catch {}
  }
  async webSocketError(ws) { return this.webSocketClose(ws); }
}

export async function handle(req, env, now = Date.now()) {
  const res = await inner(req, env, now); const tok = renewals.get(req);
  if (tok && res.status !== 101 && res.status < 400 && !res.headers.has('Set-Cookie')) res.headers.set('Set-Cookie', setCookie(tok, SESSION_MAX / 1000)['Set-Cookie']);
  return res;
}
async function inner(req, env, now) {
  const url = new URL(req.url); const p = url.pathname;
  if (!p.startsWith('/api/')) return proxy(req, url);
  const origin = req.headers.get('Origin');
  if (p === '/api/review') return review(req, env, now, url, origin);
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
    const u = normUser(b.username), key = String(b.key || '');
    if (!USER_RE.test(u)) return json(req, 400, { error: 'username' });
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
    const ok = same(normUser(b.username), admin.username) & same(KEY_RE.test(String(b.key || '')) ? await hashKey(String(b.key), admin.salt, env.PEPPER) : '', admin.hash);
    if (!ok) { await throttleFail(db, ipKey, now, MAX_FAILS); await throttleFail(db, 'global', now, GLOBAL_MAX_FAILS, GLOBAL_LOCK); return json(req, 401, { error: 'bad_credentials' }); }
    await db.prepare('DELETE FROM throttle WHERE key = ?').bind(ipKey).run();
    return newSession(env, now);
  }
  const th = await auth(req, env, now); if (!th) return json(req, 401, { error: 'auth' }, cookieTok(req) ? clearCookie() : {});
  if (p === '/api/logout' && req.method === 'POST') { await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run(); return json(req, 200, { ok: true }, clearCookie()); }
  if (p === '/api/password' && req.method === 'POST') {
    const ipKey = 'ip:' + await sha256(req.headers.get('CF-Connecting-IP') || 'unknown');
    const locked = Math.max(await throttleCheck(db, ipKey, now), await throttleCheck(db, 'global', now));
    if (locked) return json(req, 429, { error: 'locked', retryAt: locked });
    const b = await readJson(req); if (!b) return json(req, 400, { error: 'body' });
    const cur = String(b.current || ''), nk = String(b.next || '');
    if (!KEY_RE.test(nk)) return json(req, 400, { error: 'key' });
    if (!(KEY_RE.test(cur) && same(await hashKey(cur, admin.salt, env.PEPPER), admin.hash))) { await throttleFail(db, ipKey, now, MAX_FAILS); await throttleFail(db, 'global', now, GLOBAL_MAX_FAILS, GLOBAL_LOCK); return json(req, 401, { error: 'bad_current' }); }
    const salt = hex(rand(16));
    const r = await db.prepare('UPDATE admin SET salt = ?, hash = ? WHERE id = 1 AND hash = ?').bind(salt, await hashKey(nk, salt, env.PEPPER), admin.hash).run();
    if (!r.meta || r.meta.changes !== 1) return json(req, 409, { error: 'conflict' });
    await db.prepare('DELETE FROM sessions').run();
    return json(req, 200, { ok: true, relogin: true }, clearCookie());
  }
  if (p === '/api/session' && req.method === 'GET') return json(req, 200, { ok: true, username: admin.username });
  if (p === '/api/reservations' && req.method === 'GET') {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const c = url.searchParams.get('cursor'); let rows;
    if (c && /^\d+:[0-9a-f-]{36}$/.test(c)) { const [t, id] = c.split(':'); rows = (await db.prepare('SELECT id, res_no, name, version, updated_at FROM reservations WHERE (updated_at < ?) OR (updated_at = ? AND id > ?) ORDER BY updated_at DESC, id LIMIT ?').bind(+t, +t, id, limit + 1).all()).results; }
    else rows = (await db.prepare('SELECT id, res_no, name, version, updated_at FROM reservations ORDER BY updated_at DESC, id LIMIT ?').bind(limit + 1).all()).results;
    const more = rows.length > limit; rows = rows.slice(0, limit);
    return json(req, 200, { items: rows.map(r => ({ id: r.id, label: `${r.res_no} · ${maskName(r.name)}`, version: r.version, updatedAt: r.updated_at })), next: more ? `${rows[rows.length - 1].updated_at}:${rows[rows.length - 1].id}` : null });
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
