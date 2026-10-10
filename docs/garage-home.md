# Garage & Home

Life → **Garage & Home** keeps the car, the home we rent and any investment current, mostly without typing. Its core is the **Mailroom**: Life Hub reads Gmail (read-only, metadata only) for anything about each place and files it after a one-tap approve. Routine mail can file itself.

The Property page stays the home of an investment's money (rent ledger, loan, tax year). Garage & Home keeps its paperwork: the tax-time pack and the "still needed" list.

## Screens

| Tab | What it shows |
|-----|---------------|
| Driveway | Mailroom count, **Needs you** (raised by what arrived: inspection soon, visit to log, service due, tax-time gaps) and a card per place |
| Mailroom | Waiting / Filed / Ignored / All. Each email shows what Life Hub read (place, kind, dates, amounts, references). Approve, *Not home stuff*, or move to another place, optionally remembering the sender |
| Garage | Per car: ghost odometer (estimate from your own log), Odometer Road (visits by km; hover/focus scrolls long labels; tap again to clear), every visit, log a visit, **No longer ours** to retire a sold car (history stays, mail stops) |
| Homes | Home we rent: inspection countdown + prep checklist, rent receipts, repair threads step by step, bills, lease. Investment: FY tax-time pack and still-needed checklist, with a hand-off to Property |

## Places and match words

A place only catches mail through **match words** saved on it: part of an address (`12 Wattle Rd`), a car model as the dealer writes it. Sender rules (made by *Move → always send this sender here*) beat match words. Retired cars keep their history but stop catching mail.

**Privacy.** This code repo is public. Places, mail and history live only in the private data repo (`GITHUB_REPOSITORY`):

- `data/home/garage-home.json`: places, car visits, inspection prep ticks, autopilot switches
- `data/home/mailroom.json`: emails read (sender, subject, Gmail's snippet, date), how each was filed, sender rules

Never add real addresses, senders or history to code, tests or fixtures. Tests and the local mock (`scripts/garage-home-demo.mjs`) use fictional places.

### Setup pack

Places menu → **Import a setup pack** takes JSON shaped like this, so history from elsewhere (Notion) comes over once:

```json
{
  "places": [
    { "type": "car", "name": "The Hatch", "match": ["Corolla Hatch"], "details": { "model": "Toyota Corolla", "warrantyUntil": "2029-03-01", "serviceIntervalKm": 10000 } },
    { "type": "home", "name": "Wattle Rd", "match": ["12 Wattle Rd"], "details": { "agent": "Harbour Realty", "weeklyRent": 720 } },
    { "type": "investment", "name": "Banksia St", "match": ["4 Banksia St"], "details": { "stillNeeded": ["Depreciation schedule"] } }
  ],
  "visits": [
    { "placeId": "the-hatch", "date": "2024-01-10", "title": "Regular service", "provider": "Corner Garage", "km": 28029, "cost": 391.55 }
  ]
}
```

Place ids are the slugged name unless given. Re-importing is safe: places merge by id (or type + name), visits dedupe on car + date + title.

## Mailroom kinds

| Place | Kinds (first match wins) | Can file itself |
|-------|--------------------------|-----------------|
| Home we rent | rent, inspection, repair, lease, bill | rent, bill |
| Investment | statement, job, inspection, tax | statement |
| Car | booking, rego, insurance, service, receipt | — |

Dates are read from `dd/mm/yyyy` in the subject or snippet (inspection day, booking day), amounts from the first `$`.

## Connecting Gmail (read-only)

1. Google Cloud console → a project → **APIs & Services → Library** → enable **Gmail API**.
2. **OAuth consent screen**: External, add yourself as a test user (or publish; read-only scope).
3. **Credentials → Create credentials → OAuth client ID → Desktop app**. Copy the client ID and secret.
4. On a computer with this repo:
   `GMAIL_CLIENT_ID=… GMAIL_CLIENT_SECRET=… node scripts/gmail-refresh-token.mjs`
   Open the printed link, approve, copy the printed refresh token.
5. Netlify → Site configuration → Environment variables: add `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`. Redeploy.

While the consent screen is in **Testing**, Google expires refresh tokens after seven days. Pushing the app to **In production** avoids that; for your own account Google shows an "unverified app" warning you can click through. A revoked or expired token shows *Gmail needs reconnecting*: repeat step 4.

Only `From`, `Subject`, `Date` and Gmail's snippet are fetched. Bodies and attachments are never downloaded.

## Schedule

`netlify/functions/garage-home-mail-scan-scheduled.mjs` runs every three hours (`23 */3 * * *`, UTC). **Check mail** on the page runs the same scan now. Quiet runs only commit to the data repo once a day.

## Code

| File | Role |
|------|------|
| `apps/life/js/app/garage-home-model.js` | Pure engine: records, classifier, Gmail query, page model |
| `apps/life/js/app/render-garage-home.js` + `css/garage-home.css` | The page (kit tokens; R4 sheets) |
| `apps/life/js/app/garage-home-api.js` | Browser client for `/api/garage-home` |
| `netlify/functions/garage-home.mjs` | Page API (GET, POST actions incl. `scan`) |
| `netlify/functions/_shared/garage-home-store.mjs` | Load/save both records, scan |
| `netlify/functions/_shared/gmail-client.mjs` | Read-only Gmail via refresh token |
| `scripts/garage-home-demo.mjs` | Fictional local mock for `npm run dev` |
| `scripts/gmail-refresh-token.mjs` | One-off refresh token minting |
