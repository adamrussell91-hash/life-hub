# People page redesign — three directions

Replaces the live `#/people` page. Fixes it has to make in every option:

- One heading. No "People / People".
- One person view. The brief *is* the profile; no separate brief page.
- Relationships inferred from what the hub already knows: shared employer,
  project membership, open tasks. Each inference shows its source.
- Organisation crests. Shield monograms here are placeholders; Adam will
  supply real crests and logos.

Henry McLennan's workplace (St. Aloysius) and the other people's roles are
placeholder data.

| File | Direction |
|---|---|
| `01-directory-split` | Directory list grouped by organisation on the left, the selected person on the right |
| `02-crest-wall` | "Needs you" strip, then organisations as crest tiles; a person opens in a drawer |
| `03-relationship-lanes` | People grouped by what they are to you: mentees, leaders, colleagues, gone quiet |
| `04-directory-plus` | Option A plus a Today strip (who you see next school day), warmth rings, the ledger (who owes whom), Remember, relationship arc, Ask search, and filter/sort/group. The sort menu is shown open |

Render: `./generate-fonts.sh && ./render.sh` (headless Chromium, 1680 wide).
