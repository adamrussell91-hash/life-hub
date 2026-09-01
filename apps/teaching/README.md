# apps/teaching

Teaching Hub SPA stays on GitHub Pages at `https://teaching-hub.adam-russell.com`.

Student URLs (`/s/lessons/*`, `/s/units/*`, `/s/classes/*`) stay public and unauthenticated.

The Life shell mounts a Teaching section that links to that site. API fold onto `life-hub2` is next: public published handlers first, then teacher CRUD. Do not copy Blobs or rotate secrets in this slice. Do not retarget `arteaching-hub` until those handlers exist and student routes are tested unauthenticated.
