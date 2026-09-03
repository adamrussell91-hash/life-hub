# apps/teaching

Teaching Hub SPA stays on GitHub Pages at `https://teaching-hub.adam-russell.com`.

Student URLs (`/s/lessons/*`, `/s/units/*`, `/s/classes/*`) stay public and unauthenticated. Those APIs are on `life-hub2` and skip the Adam session.

`GET /api/curriculum` is the first teacher read path on `life-hub2`. It uses the Life session cookie and returns **503** if Blobs `teaching-hub-content` is not bound.

Teacher writes, Blobs binding, and retiring `arteaching-hub` are later. Do not rotate secrets or retarget production in this slice.
