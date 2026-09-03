# apps/teaching

Teaching Hub SPA stays on GitHub Pages at `https://teaching-hub.adam-russell.com`.

Student URLs (`/s/lessons/*`, `/s/units/*`, `/s/classes/*`) stay public and unauthenticated. Those APIs are on `life-hub2` and skip the Adam session.

Teacher reads and writes on `life-hub2` use the Life session cookie:

- GET `/api/curriculum` plus GET/PATCH/PUT/DELETE on class, unit, lesson, year, subject, and scheduled-lesson records
- POST `/api/classes`, `/api/units`, `/api/lessons`, `/api/years`, `/api/subjects` to create records
- GET `/api/years` and `/api/subjects` list collections
- GET `/api/search?q=` matches titles on years, subjects, classes, units, and lessons (no composition/block corpus)
- POST `/api/lessons/:id/publish` writes a student snapshot (teacher-only blocks dropped) and stamps `published_at`
- GET/POST `/api/outcomes` (create needs subject_id, code, title, description)
- GET/POST `/api/media` for external/Drive links; GET/PATCH/DELETE `/api/media/:id`. Direct file upload stays on Teaching Hub.
- GET/POST `/api/scheduled-lessons` to place one lesson on a class date. Unit-wide schedule expand stays on Teaching Hub.

Unbound `teaching-hub-content` → **503**. `@netlify/blobs` is now a life-hub dependency so `life-hub2` can open the store. Set `NETLIFY_BLOBS_TOKEN` on `life-hub2` to read the existing `arteaching-hub` store instead of an empty local one.

Do not rotate secrets, retarget production, or retire `arteaching-hub` in this slice.
