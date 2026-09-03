# Hub design kit

Shared visual language for Adam’s hub websites (Teaching Hub, Life Hub, Knowledge Hub, Tasks Hub, and hubs that follow).

**This repo is the source of truth.** Cursor agents should read `AGENTS.md` and grab CSS/snippets from here (or from the `design-kit/` copy inside a hub) instead of redesigning chrome on every task.

## What is shared

Palette, type, space, radius, elevation, left rail, page headers, buttons, and agent confirm UX.

## What each hub may change

Glass intensity and tile density only, via `html[data-hub=…]` in `css/overlays.css`.

## Use in a hub

```html
<html lang="en" data-hub="teaching">
  <link rel="stylesheet" href="/design-kit/tokens.css" />
  <link rel="stylesheet" href="/design-kit/overlays.css" />
  <link rel="stylesheet" href="/design-kit/actions.css" />
  <link rel="stylesheet" href="/design-kit/sign-in.css" />
```

Existing hubs keep their own layout CSS. New hubs can also load `chrome.css`. Passphrase gates use `snippets/sign-in.html`.

After you edit this kit:

```bash
./scripts/sync-to-hubs.sh
```
