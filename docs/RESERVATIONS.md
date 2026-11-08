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
- Auth: one admin (`admin` by default). Password: PBKDF2-SHA256 100,000 iterations (Workers WebCrypto maximum), random salt,
  then HMAC-SHA256 with a server-only PEPPER secret. Session: random 256-bit token in a `__Host-` cookie (Secure, HttpOnly,
  SameSite=Strict), stored server-side as SHA-256; 30 min idle / 12 h max; the UI also signs out after 2 min idle, page hide,
  and after handing a record to the form. No CORS; writes require same Origin + `X-Requested-With`. All responses no-store.
- Throttle (in D1): 5 failed logins per IP-hash / 15 min -> 15 min lock; 50 global failures -> lock.
- Bootstrap: closed unless BOTH `SETUP_TOKEN` (>=32 chars) and `SETUP_UNTIL` (<= 24 h ahead) Worker secrets exist and no admin
  exists. Never a first-visitor claim.
- Edits carry `version`; a stale edit/delete returns 409 and the list reloads. Lists are masked, paged 50 at a time.
