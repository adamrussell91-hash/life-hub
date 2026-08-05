# Skincare Tab + Hyaluronica (Design)

**Date:** 2026-08-05  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.

## Problem

Skincare logging exists in schema/chat but there is no tab. Adam needs a consistency-first AM/PM one-tap log with preloaded routines, note chips, occasional extras, and a separate path for procedures (e.g. laser), with Hyaluronica available in chat.

## Decisions

| Topic | Choice |
|-------|--------|
| Routines source | `config/skincare-routines.yml` |
| Layout | Both AM + PM cards; highlight current by Sydney noon |
| AM toner | Toggle; default Anua Rice 70 + Ceramide Glow Milky Toner |
| Extras | Chips on routine card append into `products` |
| Procedures | Separate card; `routine` = time-of-day enum; label in notes |
| Note chips | Redness, Tightness, Dryness, Congestion, Looking good, Irritated, Sensitive → editable notes |
| Save | Direct `/api/chat/confirm` (slug `hyaluronica`), no confirm card |
| Chat | Floating Hyaluronica chat; does not auto-open on Done |
| Protocol | Short `config/hyaluronica-protocol.md` for consistency/logging rules |

## Default routines

### AM (~20 min)

1. Toner — rotating: **Anua Rice 70 + Ceramide Glow Milky Toner** (default) **or** Dr Ceuracle Vegan Kombucha Tea Essence  
2. Azclear Azelaic Acid 20%  
3. Korres Greek Yoghurt Probiotic Gel Cream  
4. La Roche Posay Anthelios SPF 50+  
5. Dr Jart+ Cicapair Colour Corrector  
6. Maybelline Green and Peach Correctors with BareMinerals Concealer  
7. Kosas Cloud Set Translucent Loose Setting and Blurring Powder  

### PM (~20 min)

1. Dr.G Green Deep Pore Cleansing Balm (first cleanse)  
2. Korres Greek Yoghurt Foaming Cream Cleanser (second cleanse)  
3. Toner  
4. Retrieve Tretinoin 0.05% via sandwich method (toner → 30s wait → tret → 5–20 min wait)  
5. La Roche Posay Cicaplast B5+ **or** Avene Cicalfate+ (seal) — default Cicaplast; toggle for Avene  

### Occasional extras (chips → products)

Sheet mask (and leave room in config for more later).

### Note chips

Redness · Tightness · Dryness · Congestion · Looking good · Irritated · Sensitive  

## Behaviour

1. Skincare nav opens `#skincare-dashboard` (remove from “later phase” stubs).  
2. Model from events: whether today has AM / PM / other logs; completeness unchanged (any skincare that day).  
3. Each routine card: checklist of products (all on by default), toner/seal toggles where configured, extras chips, notes + note chips, **Done**.  
4. Done builds candidate `{ type: skincare, date, routine, fields: { routine, completed: true, products, skin_note? }, notes }` and confirms with overwrite if same slug exists.  
5. Slugs: `am`, `pm`, or slugified procedure title.  
6. Procedure card: title input, free products/notes, Log → same type; notes prefixed with `Procedure: {title}.`.  
7. After save: refresh + on-page “Logged” state.  

## Hyaluronica

- Accent `#B99EE0`; floating chat default agent `hyaluronica`.  
- Inject short protocol into persona (like Chadwick) covering: prefer tab one-tap for routines; chat for advice/adjustments; note chips language; procedures belong on the Other card.  

## Out of scope

- Notion live sync, fragrance domain, rich streak charts, auto-open chat on Done, schema change for procedure type.

## Verification

- Unit: routines YAML load, candidate build, note-chip append, AM/PM highlight by hour.  
- Integration: confirm skincare write.  
- Manual: log AM/PM, extras, procedure; CN Flags line; chat opens as Hyaluronica.
