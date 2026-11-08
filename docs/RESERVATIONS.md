# Local reservation manager (same tablet only)
- First run: staff open **관리자 모드**, set a 4–12 digit PIN twice on the device. No PIN ships in the code.
- Stored in this browser's localStorage only: AES-GCM-256 ciphertext of [{id, reservation no, name, phone, email, timestamps}],
  key = PBKDF2-SHA256(PIN, random 16-byte per-device salt, 600,000 iterations), fresh 12-byte IV per save. The PIN is not stored.
- Never stored: card number, expiry, signatures, dates, generated PDF, or any other form field (consent.js/guide.js have no storage APIs).
- Selecting a reservation clears the previous customer's form (confirm if anything was entered), fills the 4 fields, locks admin
  (key + decrypted list dropped), then shows the guide. Admin also locks on Lock, 2 min inactivity, page hide/refresh.
- Limits: a short numeric PIN can be brute-forced offline by someone who copies the browser storage; backoff only slows on-screen guessing.
  Clearing browser data (or a different browser/device) loses the reservations; there is no export/backup or sync.
