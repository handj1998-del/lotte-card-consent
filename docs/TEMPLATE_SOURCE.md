# Template source
`assets/consent/original.pdf` = pages **3, 2** (1-based, in that order) of the user-supplied PDF
(SHA256 b8384bc698de6f62749ed439753324aa14bd3eef4c8f071072fe4130795b2a05, Adobe InDesign 19.4), copied with
pdf-lib `copyPages([2,1])` — page content streams, embedded fonts (YDIYGO, Myriad Pro, LOTTEGROUP) and vector
artwork are copied unchanged; nothing is rasterised. Previous scanned template (118 ppi raster, SHA256 1a572784…) remains in git history.
Page 1 = card-information consent (source p3), page 2 = personal (credit) information agreement (source p2).
Field coordinates are the legacy ones passed through `MAP` in consent.js (measured landmarks: table header,
signature box, "20"/Name rows from the vector text layer). Preview PNGs are 150 dpi renders of the new template.
Note: source p3 contains a hidden/non-printing text fragment "Additional Charges / Billing Items (e.g. rental charges, CDW charges, fines, toll charges)" in the text layer; it is not visible in renders and is not translated.
