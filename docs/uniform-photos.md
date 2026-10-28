# Uniform package photos

Front Office → Team Fees & Profitability → Uniform packages & coach permissions contains Uniform photos inside every package. Admins can upload up to four JPEG, PNG or WebP images, add captions, and remove images. Save draft & expenses persists these changes. Images are resized and re-encoded in the browser, with per-image and combined save limits.

Photos belong to the existing fee-plan uniform package, persisted in team_fee_plans. Coaches see a gallery for their selection in Coach budget selections. The saved selection appears in Coach Desk → Uniforms and Family/Player → Uniform. Changes refresh the gallery in the current workspace after a successful save or coach selection; other viewers receive them when loading the page.

The presentation endpoint returns only the selected package name, included items, and photos. It requires admin, assigned team coach, linked guardian, or the team's own player identity. It does not return pricing assumptions, payment details, or other players. Only the admin save action can modify package images; coach proposals can only select an approved active package and permitted tournament budget. Photos follow the current saved selection, including selections awaiting financial approval. Financial publishing and locked player fees remain unchanged.

Older packages without images continue to work. No database migration or real customer-data mutation is required for this release.
