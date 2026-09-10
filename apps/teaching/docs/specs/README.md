# Teaching Day Book — Product Specifications

These documents are the **product source of truth** for the Teaching Day Book. They define information architecture, data model, blocks, UX, design system, AI agent behaviour, storage and publishing, security, implementation sequencing, and acceptance tests.

## Specification files

| File | Topic |
|------|-------|
| `00_PRODUCT_PRINCIPLES.md` | *(Not yet imported — see RTF sources)* |
| `01_INFORMATION_ARCHITECTURE.md` | Curriculum hierarchy, classes, navigation, URLs |
| `02_DATA_MODEL.md` | Objects, IDs, references, draft vs published |
| `03_BLOCK_SYSTEM.md` | Block registry, types, rendering |
| `04_USER_EXPERIENCE.md` | Teacher and student workflows |
| `05_DESIGN_SYSTEM.md` | Tokens, typography, components |
| `06_AI_AGENT.md` | AI integration rules and boundaries |
| `07_STORAGE_AND_PUBLISHING.md` | Netlify Blobs, Drive, publish pipeline |
| `08_SECURITY.md` | Security stub (first-slice); expand from product specs |
| `09_IMPLEMENTATION_PLAN.md` | Phased build sequence and technical foundation |
| `10_ACCEPTANCE_TESTS.md` | Workflow-based acceptance criteria |

## Specification authority

When **code behaviour conflicts with these specifications**, the discrepancy must be **deliberate** — not an undocumented shortcut.

1. **Do not silently reinterpret architecture** because a workaround seems easier.
2. If implementation reveals a specification decision is impractical:
   - Document the issue.
   - Update the relevant specification.
   - Then update the code.
3. **Do not allow undocumented architectural drift.**

These rules are taken from [§6 Specification Authority](09_IMPLEMENTATION_PLAN.md#6-specification-authority) in the Implementation Plan.

## First-slice scope

The [first-slice design](../superpowers/specs/2026-08-07-teaching-hub-first-slice-design.md) may **deliberately narrow scope** relative to the full product specs (for example: fewer entities, simplified navigation, or stubbed security). Where the first-slice design narrows scope, treat the first-slice document as the authority for that slice; update these specs when widening scope after the slice ships.
