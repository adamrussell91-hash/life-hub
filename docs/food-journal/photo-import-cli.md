# Import Day One photos into Food Journal (Mac)

The photo export is too large for chat (~2GB). Run this on the Mac that already has the unzipped Day One folder. Files go straight to private R2 (`food/photos/…`); the journal only stores references.

## Before you start

1. Merge / pull the meals import so `life-hub-data` has `data/food-journal/journal.json` (752 visits with photo `md5` refs).
2. Merge / pull life-hub so you have `npm run import:dayone-photos`.
3. Unzip the Day One export on disk (do **not** re-zip for chat). You need the `photos` folder inside it — files are usually named `{md5}.jpeg`.

Typical layout after unzip:

```text
~/Downloads/…/Food Journal/
  Food Journal.json
  photos/
    725a07741296663eb41870c9c82fa441.jpeg
    …
```

## 1. Open the life-hub repo

```bash
cd ~/Projects/life-hub
git checkout main
git pull origin main
npm ci
```

## 2. Put R2 keys in the shell (once per terminal)

These are the same production keys already on Netlify site **life-hub2**:  
`R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

**Option A — Netlify CLI** (if the site is linked):

```bash
cd ~/Projects/life-hub
netlify link   # pick life-hub2 if asked
export R2_ACCOUNT_ID="$(netlify env:get R2_ACCOUNT_ID --context production --plain)"
export R2_BUCKET="$(netlify env:get R2_BUCKET --context production --plain)"
export R2_ACCESS_KEY_ID="$(netlify env:get R2_ACCESS_KEY_ID --context production --plain)"
export R2_SECRET_ACCESS_KEY="$(netlify env:get R2_SECRET_ACCESS_KEY --context production --plain)"
```

**Option B — Netlify UI:** Site → Environment variables → copy the four `R2_*` values, then:

```bash
export R2_ACCOUNT_ID='…'
export R2_BUCKET='…'
export R2_ACCESS_KEY_ID='…'
export R2_SECRET_ACCESS_KEY='…'
```

Do not commit these. Do not paste them into chat.

## 3. Dry-run (no uploads)

Replace the two paths with yours:

```bash
cd ~/Projects/life-hub
npm run import:dayone-photos -- \
  --photos "$HOME/Downloads/PATH/TO/photos" \
  --journal "$HOME/Projects/life-hub-data/data/food-journal/journal.json"
```

You should see something like `planned_uploads` near 750 and a low `unmatched_refs`. If `planned_uploads` is 0, the journal is missing or already has photos, or `--photos` is the wrong folder.

## 4. Real upload

Same command with `--write`:

```bash
npm run import:dayone-photos -- \
  --photos "$HOME/Downloads/PATH/TO/photos" \
  --journal "$HOME/Projects/life-hub-data/data/food-journal/journal.json" \
  --write
```

Progress prints every 25 files. When it finishes, `uploaded` should be close to the dry-run plan. Larger originals are compressed with macOS `sips` to JPEG ≤4MB.

## 5. Commit the journal (references only)

```bash
cd ~/Projects/life-hub-data
git checkout main
git pull origin main
git status   # should show data/food-journal/journal.json changed
git add data/food-journal/journal.json
git commit -m "data(food-journal): attach Day One photo keys"
git push origin main
```

(Or open a PR if you prefer not to push straight to `main`.)

Photo **bytes** are already in R2 after step 4. Git only gets the small `id`/`key` pointers on each dish.

## If something fails

| Symptom | Fix |
|--------|-----|
| `R2 env not set` | Re-export the four `R2_*` vars in this terminal |
| `Photos folder not found` | Point `--photos` at the folder that contains the `.jpeg` files, not the zip |
| `Journal not found` | Pull life-hub-data so `data/food-journal/journal.json` exists |
| `Need JPEG ≤4MB, or macOS sips…` | You’re not on macOS, or `sips` failed — open Console for that file |
| Many `unmatched_refs` | Wrong `photos` folder, or export without media; check a sample `md5` from the journal against filenames |
| Food Journal UI still blank | Confirm life-hub-data deploy/sync picked up the journal commit; hard-refresh Life Hub |

## What this does not do

- It does not upload through Cursor chat.
- It does not put binaries in git.
- It does not require clicking Import in the browser.
