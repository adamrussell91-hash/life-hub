# apps/teaching

Teaching Hub SPA stays on GitHub Pages at `https://teaching-hub.adam-russell.com`.

Student URLs (`/s/lessons/*`, `/s/units/*`, `/s/classes/*`) stay public and unauthenticated. Those APIs are on `life-hub2` and skip the Adam session.

Teacher reads and writes on `life-hub2` use the Life session cookie:

- GET `/api/curriculum` plus GET/PATCH/PUT/DELETE on class, unit, lesson, year, subject, and scheduled-lesson records
- POST `/api/classes`, `/api/units`, `/api/lessons` to create records

Unbound `teaching-hub-content` → **503**. Do not rotate secrets, retarget production, or retire `arteaching-hub` in this slice.
