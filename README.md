# Life Hub

Private personal dashboard and conversational logging application.

## Current slice

The read-only Home PWA renders checked-in Markdown fixtures through the production parsing, validation, target, and aggregation modules. It is responsive, installable, and keeps the last successful view readable offline.

Authenticated GitHub sync, chat, writes, and domain detail views arrive in later phases.

## Run locally

Requires Node.js 22 or later.

```bash
npm ci
npm run dev
```

Open the local URL printed in the terminal.

## Verify

Run the unit and integration suite plus fixture validation:

```bash
npm test
npm run validate:fixtures
```

For desktop, 390 px mobile, navigation, and offline browser acceptance:

```bash
npx playwright install chromium
npm run test:browser
```

The approved fixture Home values are 1,130 calories, 80 g protein, 27 g fat, a completed 30-minute workout, a workout streak of 1, and 3 of 5 logging categories complete.
