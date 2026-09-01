# Checkpoint 00d — Proxies + R2 collision clarified

**Date:** 2026-09-01  
**Author:** Cursor (from Adam / Claude research)  
**Verdict:** Plan notes updated — no blocker to critique #2

## Proxies (`jade-melomakarona-ea20fe`)

- Functions-only Netlify backend (root 404), not a hub UI
- Serves `ai` + `generate` for public `widgets` (HSC tools, Fluid Analogising, literary periodic table, clarity game, reflection coach)
- In scope as shared dependency; out of scope as a hub section to fold into `life-hub2` until consumers migrate
- Track: permissive CORS + open `ai` parameters against shared OpenAI key

## `knowledge-hub-archive` collision

- Netlify site ID `ff82fc91-…` = Knowledge API Functions
- R2 bucket same name = ~4.07 GB archive bound to Worker `knowledge-hub-research` as `ARCHIVE`
- Platforms/IDs/lifecycles independent — rename/delete one does not touch the other

## Next

Claude full critique #2 may treat proxies as dependency risk (not fold step) and Knowledge fold as two checklist rows (Netlify API + R2/Worker).
