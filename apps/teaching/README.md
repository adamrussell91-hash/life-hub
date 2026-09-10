# apps/teaching

Teaching Hub SPA, published at `https://life-hub.adam-russell.com/teaching/`.

Student URLs (`/teaching/s/lessons/*`, `/teaching/s/units/*`, `/teaching/s/classes/*`) stay public and unauthenticated. Those APIs are on `life-hub2` and skip the Adam session.

Teacher reads and writes on `life-hub2` use the Life session cookie. The SPA talks to `https://api.adam-russell.com`.

Unbound `teaching-hub-content` → **503**. `@netlify/blobs` is a life-hub dependency. With `NETLIFY_BLOBS_TOKEN` only, Functions still read the `arteaching-hub` store. Set `TEACHING_BLOBS_SITE_ID` to `local` or the `life-hub2` site id after copying that store onto `life-hub2`.

Build from the umbrella root: `UMBRELLA_SPA=1 npm run build -w teaching-hub`. Functions stay in repo-root `netlify/functions/`. Do not rotate secrets.
