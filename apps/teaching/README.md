# apps/teaching

Teaching Hub SPA stays on GitHub Pages at `https://teaching-hub.adam-russell.com`.

Student URLs (`/s/lessons/*`, `/s/units/*`, `/s/classes/*`) stay public and unauthenticated. Those APIs are on `life-hub2` and skip the Adam session.

Teacher reads and writes on `life-hub2` use the Life session cookie:

- GET `/api/curriculum` plus GET/PATCH/PUT/DELETE on class, unit, lesson, year, subject, and scheduled-lesson records
- POST `/api/classes`, `/api/units`, `/api/lessons`, `/api/years`, `/api/subjects` to create records
- GET `/api/years` and `/api/subjects` list collections
- GET `/api/search?q=` title/code scan plus lesson/unit/composition block corpus
- POST `/api/lessons/:id/publish` writes a student snapshot (teacher-only blocks dropped) and stamps `published_at`
- GET/POST `/api/outcomes` (create needs subject_id, code, title, description)
- GET/POST `/api/media` for external/Drive links; POST `/api/media/upload` for direct files; GET/PATCH/DELETE `/api/media/:id`
- GET/POST `/api/scheduled-lessons` for one class date; POST `/api/classes/:id/schedule-unit` to expand a unit
- Life Calendar reads those rows from same-origin `/api/curriculum` (no Teaching API host in the registry)

Unbound `teaching-hub-content` → **503**. `@netlify/blobs` is a life-hub dependency. With `NETLIFY_BLOBS_TOKEN` only, Functions still read the `arteaching-hub` store. Set `TEACHING_BLOBS_SITE_ID` to `local` or the `life-hub2` site id after copying that store onto `life-hub2`.

The Teaching Pages app is retargeted to `https://api.adam-russell.com`. Do not rotate secrets.
