# Personal context storage

The private repository `adamrussell91-hash/life-hub-data`, branch `main`, owns all live personal Central Node content at `central-node.md`. Fetch the current private file and SHA before editing. Never overwrite it from the public template or an older migration snapshot.

Personalised voice samples and their provenance live in that same private repository under `config/humanizer/voices/`. The authenticated chat server reads only the selected agent's sample from the resolved private tree and passes it to prompt assembly. Missing, invalid or unavailable samples omit the optional block. Samples do not enter the browser sync manifest.

The public `central-node.md` contains only operating rules and section structure. It supports initialising a missing private Central Node without embedding personal history in a deployment. Existing readers and writers retain the private path `central-node.md`, so client sync, specialist logging, governance patches, scheduled updates and Tasks context keep using the same live file.

Agent instructions in this repository and older design documents defer to this storage rule. Public tests use synthetic records and invented people. Do not copy private context into docs, PR descriptions, logs, screenshots or public build assets.

The former public Central Node copy is preserved privately at `private-migrations/2026-10-15/public-central-node-snapshot.md` for deliberate reconciliation only. The live private Central Node was newer and was retained. The archive is not loaded automatically.

This migration changes current source files. Earlier commits, existing branches, pull request diffs and previously deployed artefacts require separate historical exposure remediation. A normal commit does not erase them.
