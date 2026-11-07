# Compact tablet UI and language review

## Scope
UI wording only: Korean, English, Simplified Chinese (zh-CN), Traditional Chinese
(zh-TW), Japanese. No legal wording in the uploaded PDF was translated or edited.
No remote translation service or customer data was used. This is an assistant's
editorial review, not certification by human native speakers or legal counsel.

## Pass 1 — terminology, tone and natural UI language
All dictionary entries were read for rental-context terminology, consistent
customer/additional-driver labels, politeness, button wording, dates and expiry.
- Completed-form preview is now “Review completed form”, “核对填写内容”,
  “確認填寫內容”, “入力内容を確認”, rather than implying an unfilled original.
- Simplified Chinese uses 预订 / 信息 / 保存 / 其他驾驶员; Traditional Chinese
  uses 預約 / 資料 / 儲存 / 其他駕駛人. Debit remains 簽帳金融卡 in Traditional
  Chinese, not a mechanical glyph conversion of 借记卡.
- Japanese “署名を適用” became “この署名を使う”; the title is
  “カード情報の取扱い同意書”. English “Date signed” is used for the signing date.
- Expiry errors explain the MM/YYYY format and expired-card condition.

## Pass 2 — semantic equivalence and safety clarity
Reviewed all five dictionaries again against actual app behavior, including
loading/errors, reset, signatures, preprinted ticks, optional drivers and saving.
- Each privacy notice explicitly refers to *this entry screen*, avoiding an
  implication that the separate destination can never receive a manually chosen file.
- Upload notices say save the PDF first, then select it on the separate page;
  no automatic transfer is claimed. The receiving-project dependency remains open.
- iPad guidance now consistently says clearing the form does not delete downloaded
  PDFs, replacing the awkward “not deleted from this screen”.
- Preprinted marks are distinguished from the current customer's consent.
- Screen-reader group labels are translated along with visible labels.
- Original-PDF text is explicitly outside the scope of the language selector.

## Layout and evidence
Reservation and customer inputs share a card; card inputs occupy the adjacent
card. Date and signature summary share one row. Full signature entry and the
full-resolution two-page preview remain separate dialogs. Optional drivers,
help and the original-document view are collapsed by default. Inputs/actions
retain 44px minimum targets; no zoom-to-fit, clipped required fields or fixed
screen-height lock is used. Below tablet width, with a keyboard, errors or
expanded options, normal vertical scrolling remains available.

The layout targets 1024×768 and 768×1024 at 100%. Actual browser bounding boxes
and one-screen fit must be checked in those viewports; unit/mock tests do not
constitute browser evidence. Physical-tablet behavior remains unverified.

Run `node tests/ui-copy.test.cjs` for dictionary keys, interpolation, bindings,
structure, upload-link constraints and byte-identical original-PDF checks.
Separate local Canvas/DOM tests also exercise real PDF generation, CJK names,
bold signatures, repeated-field mapping and language/edit state retention.
