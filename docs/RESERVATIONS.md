# Local reservation manager (same tablet only)
- First run: staff open **관리자 모드**, set a 4–12 digit PIN twice on the device. No PIN ships in the code.
- Stored in this browser's localStorage only: AES-GCM-256 ciphertext of [{id, reservation no, name, phone, email, timestamps}],
  key = PBKDF2-SHA256(PIN, random 16-byte per-device salt, 600,000 iterations), fresh 12-byte IV per save. The PIN is not stored.
- Never stored: card number, expiry, signatures, dates, generated PDF, or any other form field (consent.js/guide.js have no storage APIs).
- Selecting a reservation clears the previous customer's form (confirm if anything was entered), fills the 4 fields, locks admin
  (key + decrypted list dropped), then shows the guide. Admin also locks on Lock, 2 min inactivity, page hide/refresh.
- Limits: a short numeric PIN can be brute-forced offline by someone who copies the browser storage; backoff only slows on-screen guessing.
  Clearing browser data (or a different browser/device) loses the reservations; there is no export/backup or sync.

# Shared reservations (server, cross-device) — Cloudflare Workers Free + D1
- URL: https://lotte-consent-reservations.lotterental-gimhae.workers.dev/ — the Worker serves this same app (read-only proxy of
  GitHub Pages) and `/api/*` on ONE origin. The "공유 예약 (서버)" button appears only there; on GitHub Pages it stays hidden
  and the local mode above is unchanged. Local encrypted records are never uploaded or deleted (no migration).
- Stored in D1 `lotte-consent-reservations`: reservation no, name, phone, email, id, version, timestamps. Server rejects any other
  field and card-number-like values. Card data, expiry, signatures, PDFs are never sent.
- Auth: one admin (`admin` by default). Username: NFC-normalised, 2–32 chars, only Hangul syllables U+AC00–U+D7A3, A–Z a–z 0–9 . _ - (no spaces, emoji, standalone jamo, other scripts). Password: PBKDF2-SHA256 100,000 iterations (Workers WebCrypto maximum), random salt,
  then HMAC-SHA256 with a server-only PEPPER secret. Session: random 256-bit token in a `__Host-` cookie (Secure, HttpOnly,
  SameSite=Strict), stored server-side as SHA-256; no idle timeout (owner choice): sliding 400-day lifetime renewed
  daily on use (400 days = Chrome's cookie ceiling; clearing browser data or browser policy can end it sooner). Survives
  refresh/tab close/restart; ends only on 로그아웃 (that session) or password change/account reset (all sessions). No CORS; writes require same Origin + `X-Requested-With`. All responses no-store.
- Throttle (in D1): 5 failed logins per IP-hash / 15 min -> 15 min lock; 20 global failures / 15 min -> 1 h global lock (also applies to
  wrong current password on 비밀번호 변경). An attacker can therefore lock staff out for an hour at a time.
- Bootstrap: closed unless BOTH `SETUP_TOKEN` (>=32 chars) and `SETUP_UNTIL` (<= 24 h ahead) Worker secrets exist and no admin
  exists. Never a first-visitor claim.
- Edits carry `version`; a stale edit/delete returns 409 and the list reloads. Lists show the full reservation/contract number and a masked name (phone/email never listed), paged 50 at a time.

# PC live review ("PC 확인 공유") — Worker origin only
- Tablet (signed in): 입력 screen → **PC 확인 공유 시작** / **중지**. PC (signed in): 공유 예약 → **작성 화면 확인** (read-only dialog:
  status + last update, checks, every filled field incl. full card number, signatures, and the two document pages rendered
  locally from the bundled original template). No edit or download controls in the viewer.
- Transport: WebSocket to a Durable Object (SQLite class, Workers Free) via `/api/review`, which requires the session cookie and
  the same Origin. Each PC viewer and the tablet do ECDH P-256 (non-extractable private keys) → AES-GCM-256 per viewer; the relay
  only forwards public keys and ciphertext in memory. Nothing is written to D1, DO storage, KV, R2, or browser storage; no logs.
- Limits: tablet share 10 min per customer (starts automatically when a customer form opens on a tablet signed in to the shared account; resume continues the same 10 min; stops on 동의완료, new customer, sign-out; server closes it at expiry via a DO alarm), viewer 2 h, max 3 viewers, message ≤ 900 KB; session re-checked every 30 s (sign-out/password
  change drops it). A newer tablet share replaces the older one. Sharing stops on 중지, new customer/reservation selection,
  sign-out; the viewer clears its display on end/disconnect/close.
- Trust note: encryption protects against the relay/network, but the PC trusts the app code served by this Worker (no
  out-of-band key check). Requires internet access from both devices (no LAN-only/WebRTC path).
