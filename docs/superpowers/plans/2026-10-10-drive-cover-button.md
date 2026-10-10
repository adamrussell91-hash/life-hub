# Google Drive cover button implementation plan

Goal: A Google Drive icon and labelled button in every Teaching Change cover dialog chooses an image, uploads a copy via the existing media API and saves it as the cover.

Architecture: Reuse openDrivePicker and uploadMediaFile. Restrict cover picks to images. Keep tokens only in memory until expiry. Suspend the native cover modal during Google selection and restore it on cancel/error. Keep existing cover until upload and save succeed; abort picker loading and close an active picker after disposal.

Scope: teacher/cover-picker.ts, teacher/drive-picker.ts, teacher/entity-banner.ts, styles/app.css, corresponding unit tests. No settings or credential changes.

- [x] Add failing behavioral tests for cover selection, cancellation, errors, busy state and disposed views; Google image view and token reuse/expiry; modal suspension/restoration.
- [x] Implement the Drive button with decorative SVG, reuse upload and persist, and add accessible progress/error feedback.
- [x] Implement image-only Picker option and expiry-aware token reuse. Suspend/restore cover modal around selection.
- [x] Verify targeted tests, Teaching build, required pre-PR gate, desktop and 390px R4 (inputs at least 16px, docked Done >=44px, no overflow).
- [ ] Review diff, commit and open a draft PR after the required gate passes. Production release remains a separate approval step.
