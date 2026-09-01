# apps/teaching

Teaching Hub SPA stays on GitHub Pages at `https://teaching-hub.adam-russell.com`.

Student URLs (`/s/lessons/*`, `/s/units/*`, `/s/classes/*`) stay public and unauthenticated.

Public student API handlers now live in this repo (`published-lesson`, `published-unit`, `published-class`, `media-file`, `html-app-ai`). They skip the Adam session gate via `isPublicStudentApi()` and return **503** if Blobs store `teaching-hub-content` is not bound on `life-hub2`.

Teacher CRUD, Blobs binding, and retiring `arteaching-hub` are later. Do not rotate secrets or retarget production in this slice.
