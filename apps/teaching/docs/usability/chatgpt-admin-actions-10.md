# Teaching Hub: Codex admin actions after run 10

Copy everything from **Operator brief** to the end into ChatGPT Codex. Before you paste it:

- Replace `{{PASSPHRASE}}`.
- Check the year list in **Job 3**.

Don't put real keys in this file.

These are the four follow-ups from [`run-10-triage.md`](run-10-triage.md) that need accounts, not code. Codex runs each job only when the browser is already signed in to the account it needs. Otherwise it stops and writes Adam the exact clicks.

---

## Operator brief

You are doing admin work for Adam's Teaching Hub. Work through the jobs in order. Each job is independent: if one is blocked, write down why and move to the next.

**Hard rules**

- Never type, paste or screenshot a password, API key secret, OAuth client secret, cookie or token into chat or the report. The Google OAuth **client ID** and the Picker **API key** are public browser values. You may paste them into the Netlify environment variables screen. Don't write them in the report: say "set" or "missing".
- Never sign in with a password or 2FA code. If a site asks you to sign in, stop that job and add it to "Needs Adam".
- Don't change DNS records, Netlify settings or Google Cloud settings that this brief doesn't name.
- Never delete, rename or edit a Teaching record whose title doesn't start with `CDX10`.
- Don't click **Backup Now** or **Backup to GitHub**.
- Before **Job 4**, check that [PR #692](https://github.com/adamrussell91-hash/life-hub/pull/692) is **merged** and Netlify has deployed it. If it isn't, skip Job 4 and say so.

**Sites**

| What | Where |
|------|-------|
| Teaching Hub | https://life-hub.adam-russell.com/teaching/ (passphrase `{{PASSPHRASE}}`) |
| API | https://api.adam-russell.com |
| Netlify site | `life-hub2` (team dashboard: https://app.netlify.com) |
| Repo | `adamrussell91-hash/life-hub` (local clone if you have one) |

---

## Job 1: Bring the student share host online (`class.adam-russell.com`)

**Why.** Share and Copy links for students point at `https://class.adam-russell.com/s/…`, but that name has no DNS record, so every link handed to a student fails. The code for the host is already written: a Cloudflare Worker in `workers/class-site`. It has no secrets and no bindings. It proxies only student pages and `/teaching/assets/*` from `life-hub.adam-russell.com`, and shows a dead page for everything else. `wrangler.jsonc` declares the custom domain `class.adam-russell.com`, so deploying it creates the DNS record, as long as the `adam-russell.com` zone is on Cloudflare.

**Steps**

1. Open https://dash.cloudflare.com. If you're not signed in, stop and add Job 1 to "Needs Adam".
2. Confirm the zone `adam-russell.com` is listed under **Websites**. If it isn't, stop: DNS lives somewhere else and Adam must decide. Record which provider the nameservers point to.
3. Under **DNS → Records** for `adam-russell.com`, check that there is **no** existing record named `class`. If one exists, stop and report what it points at. Don't change it.
4. Deploy the Worker. Prefer the terminal if you have the repo:
   ```bash
   cd workers/class-site
   npx wrangler login      # completes in the browser that is already signed in to Cloudflare
   npx wrangler deploy
   ```
   If you have no terminal, use the dashboard instead:
   - Go to **Workers & Pages → Create → Worker**, name it `class-site`, and create it.
   - In **Edit code**, add two files with the exact contents from the repo: `src/index.js` and `routes.mjs`. Keep the relative import `../routes.mjs` working, or flatten it to one file and change the import to match. Deploy.
   - Then go to **Settings → Domains & Routes → Add → Custom domain** and enter `class.adam-russell.com`.
5. Wait until the custom domain shows **Active**. The certificate can take a few minutes.

**Verify.** Use a private window, not signed in to anything:

| URL | Expected |
|-----|----------|
| `https://class.adam-russell.com/` | "This page isn't available." |
| `https://class.adam-russell.com/sign-in` | "This page isn't available." |
| `https://class.adam-russell.com/s/lessons/lesson_muv1p7ev_w0rc84` | CDX10 Lesson A renders for students, with no sign-in gate, styles loaded and blocks painted |
| `https://class.adam-russell.com/s/classes/class_muv1f2q3_6hyk8e` | CDX10 class page renders |

Then, as a signed-in teacher, open Lesson A → **Share** → **Open**. It must open the `class.adam-russell.com` link and render.

If a student page loads but shows an API or CORS error in the Console, record the request URL and status and stop. The API already allow-lists this origin, so that would be a real bug.

---

## Job 2: Turn on the Google Drive picker

**Why.** **Add from Drive** says Drive isn't configured. The teacher UI reads its picker config at runtime from `GET /api/drive-picker-config`. That endpoint needs these Netlify environment variables:

| Netlify variable | Value | Required |
|------------------|-------|----------|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Web client ID (`…apps.googleusercontent.com`) | yes |
| `GOOGLE_PICKER_API_KEY` | API key restricted to the Picker API | yes |
| `GOOGLE_APP_ID` | Google Cloud **project number** (digits only) | recommended |

The picker asks for scope `https://www.googleapis.com/auth/drive.file` only: the app sees just the files the teacher picks.

**Steps (Google Cloud)**

1. Open https://console.cloud.google.com. If you're not signed in, stop and add Job 2 to "Needs Adam". Use an existing project of Adam's if one is clearly for Life Hub. Otherwise create a project named `life-hub`.
2. Under **APIs & Services → Library**, enable **Google Picker API** and **Google Drive API**.
3. Set up **OAuth consent screen**:
   - User type: External. App name: `Life Hub`. Support and developer email: Adam's.
   - Scopes: add `.../auth/drive.file`.
   - Publishing status: leave as **Testing**, and add Adam's Google account as a **test user**.
   - If Google asks for verification or billing, stop and report it.
4. Create the OAuth client under **Credentials → Create credentials → OAuth client ID**:
   - Type: **Web application**. Name: `Life Hub Drive picker`.
   - **Authorised JavaScript origins**: `https://life-hub.adam-russell.com`. No redirect URIs are needed.
5. Create the API key under **Credentials → Create credentials → API key**:
   - **Application restrictions**: HTTP referrers, with `https://life-hub.adam-russell.com/*`.
   - **API restrictions**: Restrict to **Google Picker API**.
6. Note the **project number** (Dashboard → Project info).

**Steps (Netlify)**

1. Go to https://app.netlify.com → site **life-hub2** → **Site configuration → Environment variables**. If you're not signed in, stop.
2. Add the three variables above, scoped to **Functions** (or all scopes) in **Production**. If a variable already exists with a different value, don't overwrite it: stop and report it.
3. Go to **Deploys → Trigger deploy → Deploy site**, so functions pick up the new variables. Wait for **Published**.

**Verify**

- While signed in to Teaching Hub, open `https://api.adam-russell.com/api/drive-picker-config`. Expect HTTP 200 with `clientId` and `apiKey` present, and no 503. Don't copy the values into the report.
- Go to Teaching → **Resource Library → Add from Drive**. The Google picker should open. Pick nothing, then cancel.
- Open a CDX10 lesson → image block → **Add from Drive** → the picker opens → cancel.
- If you see `origin_mismatch` or `idpiframe_initialization_failed`, check the JavaScript origin in step 4, then report it.

---

## Job 3: Add the missing year levels

**Why.** New class and New unit require a year, and the catalog only holds **Year 12**. There is no "New year" button yet, so add the years through the API using the signed-in session.

**Years to add.** Adam: edit this list before pasting.

```
Year 7 (7), Year 8 (8), Year 9 (9), Year 10 (10), Year 11 (11)
```

**Steps**

1. Sign in at https://life-hub.adam-russell.com/teaching/ with the passphrase.
2. In DevTools → Console, on a `life-hub.adam-russell.com` page, list what exists:
   ```js
   await (await fetch('https://api.adam-russell.com/api/years', { credentials: 'include' })).json()
   ```
   Record the existing titles and `year_level`s. **Skip any level that already exists.** Never create a duplicate.
3. For each missing level `N`:
   ```js
   await (await fetch('https://api.adam-russell.com/api/years', {
     method: 'POST',
     credentials: 'include',
     headers: { 'content-type': 'application/json' },
     body: JSON.stringify({ title: 'Year N', year_level: N })
   })).json()
   ```
   Expect `ok: true` and an `id` like `year_…`. Record each id.
4. Reload Teaching Hub.

**Verify**

- **Classes → New class**: the Year dropdown lists every year in order. Cancel.
- **Units → New unit**: the same. Cancel.
- Don't create a class or unit here. Adam will, when he needs one.

---

## Job 4: Clean up the CDX10 test records

**Run this only after PR #692 is merged and deployed.** That PR makes permanent delete also remove the published copy, the schedule slots and the unit order. Before it ships, deleting would leave orphans for students.

Before deleting anything, do a quick post-deploy check in a **private window**: `https://life-hub.adam-russell.com/teaching/s/lessons/lesson_muv1rpis_nbclnt` (the old Lesson C) must now say it isn't available. Record the result.

**Records to remove.** Delete them in this order: lessons, then the template and media, then the unit, then the class.

| Record | ID | How |
|--------|----|-----|
| CDX10 Lesson A — every block 2008 | `lesson_muv1p7ev_w0rc84` | Lesson menu → Move to trash, then Trash → Delete permanently |
| CDX10 Lesson B — Newton's laws | `lesson_muv1q41b_jesh59` | same |
| CDX10 Lesson B — Newton's laws (copy) | already in Trash | Trash → Delete permanently |
| CDX10 Lesson template | Templates page | Template menu → Move to trash, then Trash → Delete permanently |
| CDX10-upload.jpg | `media_muv3av7u_3oguz8` | Resource Library → options → Move to trash, then Trash → Delete permanently |
| CDX10 Forces and Motion (unit) | `unit_muv1kykc_vz56z8` | Unit options → Move to trash, then Trash → Delete permanently |
| CDX10 Year 9 Science (class) | `class_muv1f2q3_6hyk8e` | Class options → Move to trash, then Trash → Delete permanently |

Use only the app's confirm cards. If a delete is refused because something depends on it, record the message and the dependency list, and move on. Don't force it through the API.

**Leave these in place.** There is no delete path for them yet. List them in the report so Adam can decide:

- Subject `CDX10 Science` (`subject_muv19sa8_td8jdk`) and its scope & sequence
- Outcomes `CDX10-FORCE` and `CDX10-DATA`

**Verify**

After a reload, search `CDX10` in the rail command palette and in Lessons → search. Only the subject, scope and outcomes above may appear. Then check:

- Trash shows no CDX10 items.
- In a private window, `https://life-hub.adam-russell.com/teaching/s/lessons/lesson_muv1p7ev_w0rc84` and `…/s/units/unit_muv1kykc_vz56z8` both say they aren't available.
- `https://class.adam-russell.com/s/lessons/lesson_muv1p7ev_w0rc84` (if Job 1 is done) says the same.

---

## Report back

Reply in chat with this, and nothing secret:

```markdown
# Teaching admin actions — YYYY-MM-DD

| Job | Result | Evidence |
|-----|--------|----------|
| 1 class.adam-russell.com | done / blocked / skipped | Worker name, domain status, verify-table results |
| 2 Drive picker | done / blocked / skipped | APIs enabled, variables set (yes/no each), deploy id, picker opened yes/no |
| 3 Years | done / blocked | levels that already existed, levels created with ids |
| 4 CDX10 cleanup | done / blocked / skipped | each row: deleted / refused (message) / left in place |

## Needs Adam
- exact screen, exact click, and why you stopped

## Anything unexpected
- Console or network errors (method, URL, status), dependency refusals, existing DNS records
```
