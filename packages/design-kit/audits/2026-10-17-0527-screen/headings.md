# Heading log

Every stylesheet rule whose selector is an `h1`–`h6`, or whose class contains heading, title, eyebrow, kicker, or hero.

Kit page title is `--text-2xl` (42px) desktop, `--text-xl` (32px) under 720px, weight 700, color `--navy`, tight tracking. Eyebrow is `--text-sm` (13px) desktop, `--text-2xs` (11px) on the phone, weight 700, uppercase, tracking caps, color `--muted`.

| Hub | Where | Context | Selector | Size | Weight | Color | Transform | Tracking | Line-height | Margin |
|---|---|---|---|---|---|---|---|---|---|---|
| kit | `packages/design-kit/calendar-almanac.css:102` |  | `.alm-opens h4` | var(--text-2xs) | var(--weight-semibold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 |
| kit | `packages/design-kit/calendar-almanac.css:107` |  | `.alm-open h5` | var(--text-sm) | var(--weight-semibold) |  |  |  | 1.3 | 0 |
| kit | `packages/design-kit/calendar-almanac.css:108` |  | `.alm-open.is-partner h5` |  |  | var(--pastel-peach-ink) |  |  |  |  |
| kit | `packages/design-kit/calendar-almanac.css:138` |  | `.alm-list__line h3` | var(--text-sm) |  | var(--navy) |  |  |  | 0 |
| kit | `packages/design-kit/calendar-day-dial.css:221` |  | `.dd-face__name` |  |  |  |  |  | 1.2 |  |
| kit | `packages/design-kit/calendar-day-dial.css:222` |  | `.dd-face__name b` | var(--text-md) | var(--weight-semibold) | var(--navy) |  |  |  |  |
| kit | `packages/design-kit/calendar-day-dial.css:223` |  | `.dd-face__name span` | var(--text-xs) |  | var(--muted) |  |  |  |  |
| kit | `packages/design-kit/calendar-readiness.css:130` |  | `.rf-q legend` | var(--text-sm) | var(--weight-semibold) | var(--ink) |  |  |  | 6px |
| kit | `packages/design-kit/calendar-readiness.css:180` |  | `.rf-kicker` | var(--text-xs) | var(--weight-semibold) | var(--muted) | uppercase | .08em |  | 0 |
| kit | `packages/design-kit/calendar-term-river-rows.css:8` |  | `.tr-rows__label h3` | var(--text-xs) | var(--weight-semibold) |  |  |  |  | 0 |
| kit | `packages/design-kit/calendar-term-river-rows.css:11` |  | `.tr-rows__week-heading` | var(--text-xs) |  |  |  |  |  |  |
| kit | `packages/design-kit/calendar-term-river-rows.css:12` |  | `.tr-rows__week-heading span` | var(--text-2xs) |  | var(--muted) |  |  |  |  |
| kit | `packages/design-kit/calendar-term-river.css:104` |  | `.tr-list__lane h3` | var(--text-sm) |  | var(--navy) |  |  |  | 0 |
| kit | `packages/design-kit/calendar-term-river.css:105` |  | `.tr-list__lane.is-partner h3` |  |  | var(--pastel-peach-ink) |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:179` |  | `.cal-chip__title` | var(--text-xs) | var(--weight-semibold) | var(--k-ink,var(--ink)) |  |  | 1.25 |  |
| kit | `packages/design-kit/calendar-tideline.css:195` |  | `.cal-chip.is-skipped .cal-chip__title` |  |  | var(--muted) |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:199` |  | `.cal-chip.is-done .cal-chip__title,.cal-due.is-done b` |  | var(--weight-medium) | var(--muted) |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:244` |  | `.cal-review__eyebrow` | var(--text-2xs) | var(--weight-semibold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 |
| kit | `packages/design-kit/calendar-tideline.css:301` |  | `.cal-chip.is-pin .cal-chip__title` | var(--text-2xs) |  |  |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:389` |  | `.cal-chip.is-ambient .cal-chip__title` |  | var(--weight-medium) | color-mix(in srgb,var(--ink) 78%,transparent) |  |  |  |  |
| kit | `packages/design-kit/calendar.css:884` |  | `.hub-calendar__detail-heading` | var(--text-lg) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| kit | `packages/design-kit/card-swipe.css:107` |  | `.hub-card-swipe__title` | var(--text-lg) | var(--weight-bold) | var(--depth) |  |  | var(--leading-tight) | 0 0 var(--space-2) |
| kit | `packages/design-kit/cards.css:46` |  | `.hub-card__eyebrow, .hub-tile__eyebrow` | var(--text-sm) | var(--weight-semibold) | var(--muted) | uppercase | var(--tracking-caps) |  |  |
| kit | `packages/design-kit/cards.css:55` |  | `.hub-card__title, .hub-tile__title` | var(--text-md) | var(--weight-semibold) | var(--navy) |  | var(--tracking-tight) | var(--leading-snug) |  |
| kit | `packages/design-kit/cards.css:93` |  | `.hub-row__title` | var(--text-md) | var(--weight-semibold) | var(--ink) |  |  |  |  |
| kit | `packages/design-kit/cards.css:117` |  | `.event-chip__title` | var(--text-sm) | var(--weight-semibold) |  |  |  |  |  |
| kit | `packages/design-kit/chart-info.css:71` |  | `.hub-chart-info__note h3` | var(--text-sm) | var(--weight-semibold) | var(--ink) |  |  |  | 0 0 var(--space-1) |
| kit | `packages/design-kit/chart-info.css:78` |  | `.hub-chart-info__note h3:not(:first-child)` |  |  |  |  |  |  | var(--space-3) |
| kit | `packages/design-kit/chat-prose.css:54` |  | `.chat-md-h1, .chat-md-h2, .chat-md-h3, .chat-message--assistant .chat-message__body h3, .chat-message--assistant .chat-message__body h4, .chat-message--assistant .chat-message__body h5, .coach-msg__body h3, .coach-msg__b` |  | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) | var(--leading-tight) | 0 |
| kit | `packages/design-kit/chat-prose.css:70` |  | `.chat-md-h1, .chat-message--assistant .chat-message__body h3, .coach-msg__body h3` | var(--text-lg) |  |  |  |  |  |  |
| kit | `packages/design-kit/chat-prose.css:74` |  | `.chat-md-h2, .chat-message--assistant .chat-message__body h4, .coach-msg__body h4` | var(--text-md) |  |  |  |  |  |  |
| kit | `packages/design-kit/chat-prose.css:78` |  | `.chat-md-h3, .chat-message--assistant .chat-message__body h5, .coach-msg__body h5` | var(--text-base) |  |  |  |  |  |  |
| kit | `packages/design-kit/chrome.css:41` |  | `h1, h2, h3, h4, p` |  |  |  |  |  |  | 0 |
| kit | `packages/design-kit/chrome.css:138` |  | `.page-header__eyebrow` | var(--text-sm) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 0 var(--space-2) |
| kit | `packages/design-kit/chrome.css:153` |  | `.page-header__title` | var(--text-2xl) | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) | var(--leading-tight) | 0 |
| kit | `packages/design-kit/chrome.css:171` | @media (max-width: 720px) | `.page-header__title` | var(--text-xl) |  |  |  |  |  |  |
| kit | `packages/design-kit/chrome.css:175` | @media (max-width: 720px) | `.page-header__eyebrow` | var(--text-2xs) |  |  |  |  |  | var(--space-1) |
| kit | `packages/design-kit/confirm-card.css:60` |  | `.confirm-card :is( .page-header__title, .confirm-card__title, .record-proposal__title, .prod-card__title, .agent-choice-card__title )` | 0.875rem | 600 | var(--depth, #0a1536) |  | -0.005em | 1.35 | 0 |
| kit | `packages/design-kit/confirm-card.css:82` |  | `.confirm-card :is(.page-header__eyebrow, .record-proposal__eyebrow)` | 0.75rem | 500 | var(--muted, #6b7788) | none | 0 | 1.3 | 0 |
| kit | `packages/design-kit/confirm-card.css:92` |  | `.confirm-card :is(.page-header__eyebrow, .record-proposal__eyebrow) + :is(.page-header__title, .record-proposal__title, .prod-card__title, .agent-choice-card__title)` |  |  |  |  |  |  | -0.375rem |
| kit | `packages/design-kit/entity-links.css:8` |  | `.entity-tagger__heading` | var(--text-sm) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| kit | `packages/design-kit/hub-audio-player.css:30` |  | `.hub-audio-player__title` | 0.95rem | 600 |  |  |  |  | 0 |
| kit | `packages/design-kit/hub-chat-viewport.css:198` |  | `.page-header.is-chat-rail .page-header__copy > .page-header__eyebrow, .page-header.is-chat-rail > .page-header__eyebrow, .page-header.is-chat-rail .page-header__supporting` |  |  |  |  |  | 0 | 0 |
| kit | `packages/design-kit/hub-chat-viewport.css:208` |  | `.page-header.is-chat-rail .page-header__title-row .page-header__title, .page-header.is-chat-rail > .page-header__title` | var(--text-base) |  |  |  |  | var(--leading-tight) |  |
| kit | `packages/design-kit/hub-chat-viewport.css:252` |  | `.page-header.is-chat-rail.is-chat-rail-merged .page-header__title-row .page-header__title, .page-header.is-chat-rail.is-chat-rail-merged > .page-header__title` | 0 |  |  |  |  | 0 |  |
| kit | `packages/design-kit/hub-interactions.css:266` |  | `.hub-ai-agent--portraits .agent-picker__name` | var(--text-2xs) | var(--weight-semibold) | var(--muted) |  | var(--tracking-normal) | var(--leading-tight) |  |
| kit | `packages/design-kit/hub-interactions.css:281` |  | `.hub-ai-agent--portraits .agent-picker__avatar.is-active .agent-picker__name` |  |  | var(--ink) |  |  |  |  |
| kit | `packages/design-kit/hub-interactions.css:439` |  | `.hub-command__heading` | var(--text-2xs) | var(--weight-semibold) | var(--muted) | uppercase | var(--tracking-caps) |  | var(--space-2) var(--space-2) var(--space-1) |
| kit | `packages/design-kit/hub-interactions.css:647` |  | `.agent-plan-card__title` | var(--text-md) | var(--weight-semibold) |  |  | var(--tracking-tight) |  | 0 |
| kit | `packages/design-kit/hub-interactions.css:658` |  | `.agent-choice-card__title, .agent-sources-card__heading` | var(--text-md) | var(--weight-semibold) |  |  | var(--tracking-tight) |  | 0 |
| kit | `packages/design-kit/hub-interactions.css:726` |  | `.agent-sources-card__link, .agent-sources-card__title` | var(--text-sm) | var(--weight-medium) | var(--wave) |  |  |  |  |
| kit | `packages/design-kit/hub-interactions.css:747` |  | `.prod-card__title` |  | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| kit | `packages/design-kit/hub-interactions.css:1119` |  | `.someday-group__title` | var(--text-sm) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| kit | `packages/design-kit/hub-list.css:285` |  | `:is(.block-editor, .hub-list__body) :is(input[type='text'], input[type='url'], input[type='number'], input:not([type]), textarea, select):not( .hub-tabstrip__name, .block-editor__visibility, .block-editor__columns-width ` | var(--text-base) |  | var(--ink) |  |  |  |  |
| kit | `packages/design-kit/hub-list.css:574` |  | `.hub-insert__name` |  | var(--weight-medium) |  |  |  |  |  |
| kit | `packages/design-kit/hub-list.css:626` |  | `.hub-tabstrip__name` | var(--text-sm) | var(--weight-medium) | var(--muted) |  |  |  |  |
| kit | `packages/design-kit/hub-list.css:639` |  | `.hub-tabstrip__tab.is-active .hub-tabstrip__name` |  |  | var(--ink) |  |  |  |  |
| kit | `packages/design-kit/hub-list.css:644` |  | `.hub-tabstrip__name::placeholder` |  |  | var(--muted) |  |  |  |  |
| kit | `packages/design-kit/hub-pdf-viewer.css:24` |  | `.hub-pdf-viewer__title` | 1rem | 600 |  |  |  |  | 0 |
| kit | `packages/design-kit/mobile.css:46` |  | `.hub-more-sheet__head h2` | var(--text-md) | var(--weight-bold) | var(--depth, var(--navy)) |  |  |  | 0 |
| kit | `packages/design-kit/morphing-popover.css:56` |  | `.morphing-popover__title` | var(--text-md) | var(--weight-medium) | var(--ink) |  |  | var(--leading-tight) | 0 |
| kit | `packages/design-kit/person-brief.css:73` |  | `.person-brief__name` | var(--text-lg) | 700 | var(--depth) |  | var(--tracking-tight) |  | 0 0 3px |
| kit | `packages/design-kit/person-brief.css:117` |  | `.person-brief__section h2` | var(--text-base) | 700 | var(--depth) |  | var(--tracking-tight) |  | 0 |
| kit | `packages/design-kit/person-brief.css:139` |  | `.person-brief__since h2` |  |  | var(--pastel-blue-ink) |  |  |  |  |
| kit | `packages/design-kit/sign-in.css:57` |  | `.sign-in__title` | var(--text-xl) | var(--weight-semibold) | var(--depth) |  | var(--tracking-tight) | 1.2 | 0 |
| knowledge | `apps/knowledge/src/protocols/style.css:30` |  | `.protocol-card__eyebrow` | var(--text-xs) |  | var(--protocol-ink) | uppercase | var(--tracking-caps) |  | var(--space-2) |
| knowledge | `apps/knowledge/src/protocols/style.css:53` |  | `.protocol-intake h1,.protocol-session h1` | clamp(2rem,4vw,3.4rem) |  | #fff |  |  | var(--leading-tight) | var(--space-2) 0 var(--space-1) |
| knowledge | `apps/knowledge/src/protocols/style.css:55` |  | `.protocol-intake .page-header__eyebrow` |  |  | #e4c98a |  | .14em |  |  |
| knowledge | `apps/knowledge/src/protocols/style.css:63` |  | `.protocol-session > header .page-header__eyebrow` |  |  | #e4c98a |  | .14em |  |  |
| knowledge | `apps/knowledge/src/protocols/style.css:122` |  | `.protocol-past__header h2` | var(--text-xl) |  | var(--navy) |  |  |  | 0 |
| knowledge | `apps/knowledge/src/protocols/style.css:128` |  | `.protocol-summary h2` | var(--text-lg) |  | #e4c98a |  |  |  | 0 0 var(--space-2) |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:227` |  | `.shelf-book__title` | var(--text-2xs) | 700 | var(--c-ink) | uppercase | 0.08em | 13px |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:377` |  | `.shelf-card h3` | var(--text-md) |  | var(--navy) |  |  |  | var(--space-1) 0 var(--space-2) |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:487` |  | `.descent__id h1` | var(--text-xl) |  | var(--navy) |  |  | 1.1 | 0 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:952` |  | `.shelf-sheet h2` | var(--text-lg) |  | var(--navy) |  |  |  | var(--space-1) 0 var(--space-4) |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1123` |  | `.place-note h3` | var(--text-md) |  | var(--ink) |  |  |  | var(--space-1) 0 var(--space-2) |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1212` | @media (max-width: 720px) | `.descent__id h1` | var(--text-lg) |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1742` |  | `.atlas__card h3` | var(--text-lg) |  | var(--navy) |  |  |  | var(--space-1) 0 var(--space-2) |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2211` |  | `.isles-card__head h3` |  |  |  |  |  |  | 0.15rem 0 0 |
| knowledge | `apps/knowledge/src/shelf/wireless.css:151` |  | `.wl-spine__title` | var(--text-sm) | var(--weight-semibold) |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:640` |  | `.wl-ro__title` | var(--text-base) |  |  |  |  | var(--leading-snug) |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:645` |  | `.wl-ro__item.is-now .wl-ro__title` |  | var(--weight-semibold) |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:773` |  | `.wl-now__title` | var(--text-lg) |  | var(--navy) |  |  | var(--leading-snug) | var(--space-2) 0 |
| knowledge | `apps/knowledge/src/studio/studio.css:49` |  | `.studio-stats__hero b` |  |  | var(--high-sea-ink) |  |  |  |  |
| knowledge | `apps/knowledge/src/studio/studio.css:118` |  | `.studio-spine__title` | var(--text-xs) | var(--weight-semibold) |  |  | 0.02em | 1.1 |  |
| knowledge | `apps/knowledge/src/studio/studio.css:184` |  | `.studio-graph__preview h3` | var(--text-base) |  | var(--navy) |  |  | var(--leading-snug) | 2px 0 var(--space-2) |
| knowledge | `apps/knowledge/src/studio/studio.css:192` |  | `.studio-desk__title` | var(--text-xl) | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) | var(--leading-tight) | var(--space-1) 0 0 |
| knowledge | `apps/knowledge/src/studio/studio.css:240` |  | `.studio-section-head h3` | var(--text-lg) | var(--weight-semibold) | var(--navy) |  |  |  | 0 |
| knowledge | `apps/knowledge/src/studio/studio.css:252` |  | `.studio-part__name` | var(--text-xs) | var(--weight-semibold) | var(--orca) |  |  | var(--leading-snug) |  |
| knowledge | `apps/knowledge/src/studio/studio.css:253` |  | `.studio-part__name span` |  | var(--weight-medium) | var(--muted) |  |  |  | 2px |
| knowledge | `apps/knowledge/src/studio/studio.css:266` |  | `.studio-ch__title` |  | var(--weight-semibold) |  |  |  |  |  |
| knowledge | `apps/knowledge/src/studio/studio.css:271` |  | `.studio-card__title` | var(--text-md) |  | var(--navy) |  |  | var(--leading-snug) | var(--space-1) 0 var(--space-3) |
| knowledge | `apps/knowledge/src/studio/studio.css:277` |  | `.studio-noterow__title` | var(--text-sm) | var(--weight-semibold) | var(--ink) |  |  | var(--leading-snug) |  |
| knowledge | `apps/knowledge/src/studio/studio.css:278` |  | `button.studio-noterow__title:hover` |  |  | var(--wave) |  |  |  |  |
| knowledge | `apps/knowledge/src/studio/studio.css:292` |  | `.studio-draft__head h3` | var(--text-lg) |  | var(--navy) |  |  |  | var(--space-1) 0 0 |
| knowledge | `apps/knowledge/src/studio/studio.css:320` |  | `.studio-aside__head h2` | var(--text-md) |  | var(--navy) |  |  |  | 0 |
| knowledge | `apps/knowledge/src/studio/studio.css:325` |  | `.studio-insight h3` | var(--text-base) |  | var(--ink) |  |  | var(--leading-snug) | var(--space-1) 0 var(--space-2) |
| knowledge | `apps/knowledge/src/studio/studio.css:330` |  | `.studio-corner h2` | var(--text-md) |  | var(--navy) |  |  |  | var(--space-1) 0 var(--space-3) |
| knowledge | `apps/knowledge/src/style.css:259` |  | `.eyebrow, .page-header__eyebrow` | var(--text-sm) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 0 var(--space-2) |
| knowledge | `apps/knowledge/src/style.css:269` |  | `.page-header > .page-header__eyebrow, .page-header__copy > .page-header__eyebrow` |  |  |  |  |  |  | var(--space-2) |
| knowledge | `apps/knowledge/src/style.css:274` |  | `.topbar h1, .page-header__title, .reader__title` | var(--text-2xl) | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) | var(--leading-tight) | 0 |
| knowledge | `apps/knowledge/src/style.css:431` |  | `.card__title` | var(--text-base) | var(--weight-semibold) | var(--depth) |  |  | 1.3 | 0 |
| knowledge | `apps/knowledge/src/style.css:456` |  | `.reader__body h3, .reader__body h4, .reader__body h5` | var(--text-lg) |  | var(--navy) |  | -0.03em |  | var(--space-6) 0 var(--space-3) |
| knowledge | `apps/knowledge/src/style.css:465` |  | `.reader__body h4` | var(--text-md) |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:466` |  | `.reader__body h5` | var(--text-base) |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:590` |  | `.empty--panel h2` | var(--text-lg) |  | var(--ink) |  |  |  | 0 0 var(--space-3) |
| knowledge | `apps/knowledge/src/style.css:684` |  | `.alchemist-card h2` | var(--text-lg) |  |  |  |  | 1.3 | 0 |
| knowledge | `apps/knowledge/src/style.css:1091` |  | `.coach-msg__body h3, .coach-msg__body h4, .coach-msg__body h5` | var(--text-lg) |  | var(--navy) |  | var(--tracking-tight) |  | var(--space-4) 0 var(--space-2) |
| knowledge | `apps/knowledge/src/style.css:1100` |  | `.coach-msg__body h4` | var(--text-md) |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:1101` |  | `.coach-msg__body h5` | var(--text-base) |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:1193` |  | `.reader__body h3` | var(--text-lg) |  | var(--navy) |  | -0.03em |  | var(--space-6) 0 var(--space-3) |
| knowledge | `apps/knowledge/src/style.css:1210` |  | `.attachments h3` | var(--text-lg) |  | var(--navy) |  |  |  | 0 0 var(--space-2) |
| knowledge | `apps/knowledge/src/style.css:1632` |  | `.graph-preview__title` | var(--text-md) | var(--weight-semibold) | var(--navy) |  | var(--tracking-tight) | var(--leading-snug) | 0 |
| knowledge | `apps/knowledge/src/style.css:1738` |  | `.universe-key__title` | var(--text-sm) | var(--weight-semibold) | var(--navy) |  | var(--tracking-normal) |  |  |
| knowledge | `apps/knowledge/src/style.css:1812` |  | `.universe-key__name` | var(--text-sm) | var(--weight-semibold) | var(--navy) |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:2122` |  | `.compose__relationships-heading` | var(--text-md) | var(--weight-semibold) |  |  |  |  | 0 0 var(--space-2) |
| knowledge | `apps/knowledge/src/style.css:2170` |  | `.decision-trace__title` |  | 700 | var(--ink) |  |  |  | 0 0 var(--space-2) |
| knowledge | `apps/knowledge/src/style.css:2257` | @media (max-width: 720px) | `.page-header__eyebrow, .page-header > .page-header__eyebrow, .page-header__copy > .page-header__eyebrow` | var(--text-2xs) |  |  |  |  |  | var(--space-1) |
| knowledge | `apps/knowledge/src/style.css:2271` | @media (max-width: 720px) | `.topbar h1, .page-header__title, .reader__title` | var(--text-xl) |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:2880` |  | `.understand__col h2` | var(--text-sm) |  |  | uppercase | 0.06em |  | 0 0 var(--space-2) |
| knowledge | `apps/knowledge/src/style.css:3492` |  | `.agent-protocol-pills__eyebrow` | var(--text-sm) | var(--weight-semibold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 0 var(--space-2) |
| knowledge | `apps/knowledge/src/style.css:4152` |  | `.uni-tl__card h2` | var(--text-md) |  |  |  |  |  | 0 |
| knowledge | `apps/knowledge/src/style.css:4192` |  | `.gpa-chip__eyebrow, .gpa-chip__scale` | var(--text-2xs) |  | var(--on-dark-muted) | uppercase | var(--tracking-caps) |  |  |
| knowledge | `apps/knowledge/src/style.css:4360` |  | `.nb-card__eyebrow` | var(--text-2xs) | var(--weight-bold) | var(--on-dark-muted) | uppercase | var(--tracking-caps) |  | 0 |
| knowledge | `apps/knowledge/src/style.css:4369` |  | `.nb-card__title` | var(--text-md) | var(--weight-bold) | var(--on-dark) |  | var(--tracking-tight) | var(--leading-tight) | 0 |
| knowledge | `apps/knowledge/src/style.css:4410` |  | `.nb-open__title` | var(--text-lg) |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4459` |  | `.nb-note__title` | var(--text-md) | var(--weight-semibold) | var(--ink) |  |  | var(--leading-snug) |  |
| knowledge | `apps/knowledge/src/style.css:4519` |  | `.due-pages__title` |  | var(--weight-medium) |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4577` |  | `.stars-title-row h2, .stars-sky-toolbar h2, .stars-synthesis h2, .stars-note-panel h3, .stars-confirm h3, .stars-empty h3` |  |  | var(--navy) |  |  | var(--leading-tight) | 0 |
| knowledge | `apps/knowledge/src/style.css:4588` |  | `.stars-title-row h2, .stars-sky-toolbar h2` | var(--text-xl) |  |  |  | var(--tracking-tight) |  |  |
| knowledge | `apps/knowledge/src/style.css:4723` |  | `.stars-popover__eyebrow` | var(--text-xs) | var(--weight-semibold) | var(--pastel-gold) | uppercase | var(--tracking-wide) |  | 0 0 var(--space-1) |
| knowledge | `apps/knowledge/src/style.css:4732` |  | `.stars-popover h4` | var(--text-base) |  | var(--on-dark) |  |  | var(--leading-snug) | 0 |
| knowledge | `apps/knowledge/src/style.css:4769` |  | `.stars-note-panel h3` | var(--text-lg) |  |  |  |  |  | var(--space-2) |
| knowledge | `apps/knowledge/src/style.css:4813` |  | `.stars-synthesis h2` | var(--text-lg) |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4905` |  | `.stars-confirm h3` | var(--text-md) |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5023` |  | `.stars-empty h3` | var(--text-lg) |  | var(--on-dark) |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5085` |  | `.stars-sky-toolbar h2, .stars-sky-toolbar .eyebrow, .stars-sky-toolbar__meta` |  |  | var(--on-dark) |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5129` |  | `.stars-sky-wrap.is-fullscreen .stars-sky-toolbar .eyebrow, .stars-sky-wrap.is-fullscreen .stars-sky-toolbar h2` |  |  | var(--on-dark) |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5477` |  | `.universe-replay__title` | var(--text-xs) | var(--weight-semibold) | var(--navy) | uppercase | 0.04em |  |  |
| knowledge | `apps/knowledge/src/style.css:5725` |  | `.universe-orrery.is-open .universe-orrery__heading` |  |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5892` |  | `.universe-system__name` | var(--text-md) | var(--weight-semibold) |  |  |  |  |  |
| life | `apps/life/css/aesthetics.css:103` |  | `.aes-wear__name` | clamp(2.2rem, 5vw, 3.6rem) | 600 |  |  |  | 0.95 | var(--space-1) 0 0 |
| life | `apps/life/css/aesthetics.css:176` |  | `.aes-bottle__name` |  |  |  |  |  |  |  |
| life | `apps/life/css/aesthetics.css:399` |  | `.aes-mapcard__name` | var(--text-lg) | 600 |  |  |  | 1.1 |  |
| life | `apps/life/css/aesthetics.css:454` |  | `.aes-snapres__name` | var(--text-lg) | 600 |  |  |  | 1.1 |  |
| life | `apps/life/css/aesthetics.css:471` |  | `.aes-wrist__name` | clamp(1.8rem, 4vw, 2.6rem) | 600 |  |  |  | 1.05 | var(--space-2) 0 0 |
| life | `apps/life/css/aesthetics.css:486` |  | `.aes-spec__name` | var(--text-lg) | 600 |  |  |  | 1.15 | 0 |
| life | `apps/life/css/aesthetics.css:547` |  | `.aes-wish__name` | var(--text-sm) | var(--weight-semibold) |  |  |  | 1.3 | 0 |
| life | `apps/life/css/app.css:236` |  | `.eyebrow, .section-kicker, .page-header__eyebrow` | var(--text-sm) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 0 var(--space-2) |
| life | `apps/life/css/app.css:244` |  | `.topbar h1, .page-header__title` | var(--text-2xl) | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) | var(--leading-tight) | 0 |
| life | `apps/life/css/app.css:271` |  | `.section-heading` |  |  |  |  |  |  | 0 |
| life | `apps/life/css/app.css:272` |  | `.section-heading h2` | var(--font-size-section) |  | var(--depth) |  | -0.02em |  | 0 |
| life | `apps/life/css/app.css:410` |  | `.now-card__head h3` | var(--text-md) |  |  |  |  |  | 0 |
| life | `apps/life/css/app.css:411` |  | `.now-card__title` |  |  | var(--depth) |  |  |  |  |
| life | `apps/life/css/app.css:412` |  | `.now-card__title::after` |  | 500 | var(--shallow) |  |  |  |  |
| life | `apps/life/css/app.css:413` |  | `.now-card__title:hover, .now-card__title:focus-visible` |  |  | var(--wave) |  |  |  |  |
| life | `apps/life/css/app.css:528` |  | `.now-task__title` | var(--text-base) |  | var(--ink) |  |  |  |  |
| life | `apps/life/css/app.css:529` |  | `.now-task__title small` | var(--text-xs) |  | var(--muted) |  |  |  |  |
| life | `apps/life/css/app.css:530` |  | `.now-task.is-done .now-task__title` |  |  | var(--shallow) |  |  |  |  |
| life | `apps/life/css/app.css:605` |  | `.home-paths-card__head h2` | var(--text-md) |  | var(--depth) |  |  |  | 0 |
| life | `apps/life/css/app.css:717` |  | `.week-card h2` | var(--text-md) |  | var(--depth) |  |  |  | 0 |
| life | `apps/life/css/app.css:731` |  | `.meal-history__title` | var(--text-md) | var(--weight-semibold) | var(--depth) |  |  |  | 0 |
| life | `apps/life/css/app.css:806` |  | `.nutrition-challenge__heading strong` | var(--text-md) |  | var(--depth) |  |  |  |  |
| life | `apps/life/css/app.css:914` |  | `.more-sheet__head h2` | var(--text-md) | 700 | var(--depth) |  |  |  | 0 |
| life | `apps/life/css/app.css:992` | @media (max-width: 720px) | `.topbar h1, .page-header__title` | var(--text-xl) |  |  |  |  |  |  |
| life | `apps/life/css/app.css:994` | @media (max-width: 720px) | `.page-header__eyebrow` | var(--text-2xs) |  |  |  |  |  | var(--space-1) |
| life | `apps/life/css/app.css:1270` |  | `.record-proposal__exercises-heading` | var(--text-sm) | 700 | var(--muted) |  |  |  | 0.75rem 0 0.35rem |
| life | `apps/life/css/app.css:1355` |  | `.workout-plan-card__title, [data-fitness-hero] [data-fitness="hero-title"]` | var(--text-lg) | 700 | var(--depth) |  | var(--tracking-tight) |  | var(--space-1) 0 0 |
| life | `apps/life/css/app.css:1951` |  | `.fitness-hero-card .workout-plan-card__title, .fitness-hero-card [data-fitness="hero-title"]` | var(--text-lg) |  |  |  |  |  |  |
| life | `apps/life/css/app.css:2324` |  | `.home-sprints__heading` |  |  |  |  |  |  | 0 |
| life | `apps/life/css/app.css:2358` |  | `.home-sprint-card__title` | var(--font-size-card) | 700 | var(--depth) |  | -0.02em | 1.2 | 0 |
| life | `apps/life/css/app.css:2752` |  | `.surface-widget-card__title` | var(--text-md) | 600 | var(--ink, #142b51) |  |  |  | 0 0 0.55rem |
| life | `apps/life/css/app.css:2817` |  | `.fitness-template-sheet__header h3` | var(--text-md) |  | var(--depth) |  |  |  | 0 |
| life | `apps/life/css/app.css:2902` |  | `.chadwick-voice__eyebrow` | var(--text-xs) | var(--weight-bold) | var(--fitness-accent) |  | 0.12em |  |  |
| life | `apps/life/css/app.css:3000` |  | `.fitness-logger__details h4` | var(--text-md) |  | var(--depth) |  |  |  | 0 |
| life | `apps/life/css/app.css:3108` |  | `.gym__title strong` | var(--text-md) |  |  |  |  |  |  |
| life | `apps/life/css/app.css:3187` |  | `.gym-rest__eyebrow` | var(--text-xs) | 700 | var(--on-dark-muted) | uppercase | 0.12em |  | 0 |
| life | `apps/life/css/app.css:3343` |  | `.gym-card__title h2, .gym-card__round-title` | clamp(var(--text-lg), 6vw, 1.75rem) |  |  |  |  | 1.15 | 0 |
| life | `apps/life/css/app.css:3449` |  | `.gym-note__title` | var(--text-sm) | 700 |  |  |  |  | 0 |
| life | `apps/life/css/app.css:3563` |  | `.gym-sheet__head h2` | var(--text-lg, 1.15rem) |  |  |  |  |  | 0 |
| life | `apps/life/css/app.css:3696` |  | `.gym-moment__title` | var(--text-lg) | 900 |  |  | 0.08em |  | 0 |
| life | `apps/life/css/app.css:3741` |  | `.pump__hero` |  |  |  |  |  |  |  |
| life | `apps/life/css/app.css:3742` |  | `.pump__eyebrow` | var(--text-xs) | 800 | var(--high-sea) |  | 0.18em |  | 0 |
| life | `apps/life/css/app.css:3749` |  | `.pump__title` | clamp(var(--text-lg), 7vw, 2.1rem) |  |  |  |  | 1.1 | 0 |
| life | `apps/life/css/app.css:3778` |  | `.pump__section h3` | var(--text-base) |  |  |  |  |  | 0 |
| life | `apps/life/css/app.css:3818` |  | `.gym-ready__title` | var(--text-lg) |  |  |  |  |  | 0 |
| life | `apps/life/css/app.css:3844` |  | `.gym-wrap h2, .gym-wrap p` |  |  |  |  |  |  | 0 |
| life | `apps/life/css/app.css:3865` |  | `.fitness-season__name` | var(--text-md) |  | var(--depth) |  |  |  |  |
| life | `apps/life/css/app.css:3987` |  | `.gym-split .gym-block__name` | var(--text-sm) | 800 |  |  |  | 1.2 |  |
| life | `apps/life/css/app.css:4027` |  | `.gym-moment--pr .gym-moment__title` | var(--text-xl) |  |  |  |  |  |  |
| life | `apps/life/css/app.css:4546` |  | `.calendar-event__title` | var(--text-base) |  |  |  |  |  |  |
| life | `apps/life/css/app.css:4871` |  | `.body-tape-label__name` | var(--text-2xs) | var(--weight-bold) | var(--depth) |  |  | 1.2 |  |
| life | `apps/life/css/app.css:5810` |  | `.bloods-bullseye__title` | var(--text-sm) | var(--weight-semibold) | var(--ink) |  |  |  |  |
| life | `apps/life/css/app.css:5901` |  | `.bloods-sheet h2` | var(--text-lg) | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) | var(--leading-tight) | 0 0 var(--space-3) |
| life | `apps/life/css/app.css:6057` |  | `.agent-protocol-pills__eyebrow` |  |  |  |  |  |  | 0 0 var(--space-2) |
| life | `apps/life/css/app.css:6199` |  | `.chat-workout__name` | var(--text-base) | var(--weight-bold) | var(--depth) |  |  |  |  |
| life | `apps/life/css/app.css:6448` |  | `.cn-loop h3` | var(--text-base) | var(--weight-bold) |  |  |  |  | 0 |
| life | `apps/life/css/app.css:6479` |  | `.mind-factor__name` | var(--text-sm) | 600 | var(--ink) |  |  |  |  |
| life | `apps/life/css/app.css:6676` |  | `.mind-mood-mix__center .mind-mood-mix__name` | var(--text-sm) | 600 | var(--label-color, var(--muted)) |  |  |  | 0 |
| life | `apps/life/css/app.css:6731` |  | `.mind-mood-mix__legend-row .mind-mood-mix__name` | var(--text-sm) | 600 | var(--ink) |  |  |  |  |
| life | `apps/life/css/app.css:6950` |  | `.mind-energy-orbit__kicker` | var(--text-sm) | var(--weight-semibold) | var(--marine) |  |  | var(--leading-tight) | 0 |
| life | `apps/life/css/app.css:6988` | @media (max-width: 720px) | `.mind-energy-orbit__kicker` | var(--text-xs) |  |  |  |  |  |  |
| life | `apps/life/css/app.css:7086` |  | `.mind-metric-strip__name` | var(--text-xs) | var(--weight-bold) | var(--wave) | uppercase | var(--tracking-caps) |  | 0 |
| life | `apps/life/css/app.css:7094` |  | `.mind-metric-strip__band[data-band="energy"] .mind-metric-strip__name` |  |  | var(--high-sea-ink) |  |  |  |  |
| life | `apps/life/css/app.css:7373` |  | `.mind-bump__axis-kicker` | var(--text-2xs) | var(--weight-semibold) |  | uppercase | var(--tracking-caps) |  |  |
| life | `apps/life/css/app.css:7876` |  | `.governance-entry-heading` | var(--text-2xs) | 700 | var(--wave) | uppercase | 0.12em |  | 0 |
| life | `apps/life/css/app.css:7889` |  | `.governance-entry-heading--stale` |  |  | var(--danger) |  |  |  |  |
| life | `apps/life/css/app.css:7957` |  | `.governance-traces__title` | var(--text-md) |  | var(--ink) |  |  |  | 0 0 var(--space-2) |
| life | `apps/life/css/app.css:7968` |  | `.governance-trace__title` |  | 700 | var(--marine) |  |  |  | 0 |
| life | `apps/life/css/app.css:8535` |  | `.trend-pair h3` | var(--text-xs) | var(--weight-bold) | var(--muted) | uppercase | 0.06em |  | 0 |
| life | `apps/life/css/app.css:8836` |  | `.medical-brief-card__title` | var(--text-2xs) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 |
| life | `apps/life/css/app.css:8844` |  | `.medical-brief-card__title--now` |  |  | var(--on-dark-muted) |  |  |  |  |
| life | `apps/life/css/app.css:8860` |  | `.medical-brief__kicker` | var(--text-2xs) | var(--weight-semibold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 |
| life | `apps/life/css/app.css:8868` |  | `.medical-brief-card--now .medical-brief__kicker` |  |  | var(--on-dark-muted) |  |  |  |  |
| life | `apps/life/css/app.css:9018` |  | `.medical-strip__title` | var(--text-sm) | var(--weight-semibold) |  |  |  |  |  |
| life | `apps/life/css/app.css:9147` |  | `.medical-heading` | var(--text-2xs) | var(--weight-semibold) | var(--muted) | uppercase | var(--tracking-caps) |  | var(--space-2) 0 0 |
| life | `apps/life/css/app.css:9155` |  | `.medical-heading.medical-upcoming` |  |  | var(--wave) |  |  |  |  |
| life | `apps/life/css/app.css:9333` |  | `.medical-card--major .medical-card__title` | var(--text-md) | var(--weight-bold, 700) | var(--depth) |  |  |  |  |
| life | `apps/life/css/app.css:9338` |  | `.medical-card--major.medical-card--planned:not(.medical-card--has-detail) .medical-card__title` | var(--text-base) |  |  |  |  |  |  |
| life | `apps/life/css/app.css:9386` |  | `.medical-card__title` | var(--text-base) | var(--weight-semibold) | var(--depth) |  |  | 1.25 |  |
| life | `apps/life/css/app.css:9481` |  | `.medical-sheet h2` | var(--text-lg) | var(--weight-bold, 700) | var(--depth) |  | var(--tracking-tight) | 1.2 | 0.15rem 0 0.25rem |
| life | `apps/life/css/app.css:9664` |  | `.shortcuts-item__title` |  | var(--weight-medium) |  |  |  |  | 0 |
| life | `apps/life/css/app.css:9772` |  | `.hub-map-card__eyebrow` | var(--text-2xs) |  | var(--muted) | uppercase | var(--tracking-caps) |  |  |
| life | `apps/life/css/app.css:9773` |  | `.hub-map-card__title` | var(--text-base) | var(--weight-semibold) | var(--marine) |  |  |  |  |
| life | `apps/life/css/app.css:9796` |  | `.hub-map-panel__eyebrow` | var(--text-2xs) |  | var(--muted) | uppercase | var(--tracking-caps) |  | 0 |
| life | `apps/life/css/app.css:9797` |  | `.hub-map-panel__title` | var(--text-md) |  | var(--marine) |  |  |  | 0 |
| life | `apps/life/css/app.css:9812` |  | `.hub-map-panel__heading` | var(--text-2xs) |  | var(--muted) | uppercase | var(--tracking-caps) |  | 0 |
| life | `apps/life/css/app.css:10192` |  | `.medical-heading, .medical-today, .medical-sheet .metric-label, .medical-brief__kicker` | var(--text-2xs) | var(--weight-semibold) |  | uppercase | var(--tracking-caps) | 1.3 |  |
| life | `apps/life/css/app.css:10203` |  | `.medical-heading.medical-upcoming, .medical-today` |  |  | var(--wave) |  |  |  |  |
| life | `apps/life/css/app.css:10214` |  | `.medical-card--routine .medical-card__title, .medical-card--planned .medical-card__title` | var(--text-base) | var(--weight-semibold) |  |  |  |  |  |
| life | `apps/life/css/app.css:10222` |  | `.medical-card--cancelled .medical-card__title` |  |  |  |  |  |  |  |
| life | `apps/life/css/app.css:10226` |  | `.nutrition-today__kicker` | var(--text-2xs) |  | var(--wave) | uppercase | var(--tracking-wide, 0.08em) |  |  |
| life | `apps/life/css/app.css:10254` |  | `.protein-climb__title` | var(--text-md) | var(--weight-semibold) | var(--depth) |  |  |  | 0 |
| life | `apps/life/css/app.css:10285` |  | `.creatine-card__heading` |  |  |  |  |  |  | var(--space-1) |
| life | `apps/life/css/app.css:10286` |  | `.creatine-card__heading h3` | var(--text-md) | var(--weight-semibold) |  |  |  | var(--leading-snug) | 0 |
| life | `apps/life/css/app.css:10371` |  | `.consistency-card__title` | var(--text-md) | var(--weight-semibold) | var(--depth) |  |  |  | var(--space-1) 0 0 |
| life | `apps/life/css/food-journal.css:46` |  | `.food-visit__title` | var(--text-lg) | 600 | var(--navy) |  |  |  | 0 |
| life | `apps/life/css/food-journal.css:53` |  | `.food-dish__title` | var(--text-md) | 600 | var(--navy) |  |  |  | 0 |
| life | `apps/life/css/food-journal.css:134` |  | `.food-sheet > h2` | var(--text-lg) |  | var(--navy) |  |  |  | 0 |
| life | `apps/life/css/garage-home.css:12` |  | `.gh-kicker` | var(--text-2xs) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 0 var(--space-2) |
| life | `apps/life/css/garage-home.css:13` |  | `.gh-kicker--on-dark` |  |  | var(--on-dark-muted) |  |  |  |  |
| life | `apps/life/css/garage-home.css:36` |  | `.gh-section-head h2` | var(--text-lg) |  | var(--depth) |  | var(--tracking-tight) |  | 0 |
| life | `apps/life/css/garage-home.css:58` |  | `.gh-banner .gh-kicker, .gh-banner .gh-sub` |  |  | var(--on-dark-muted) |  |  |  |  |
| life | `apps/life/css/garage-home.css:63` |  | `.gh-need__title` | var(--text-md, 1rem) | var(--weight-semibold) | var(--depth) |  |  |  |  |
| life | `apps/life/css/garage-home.css:65` |  | `.gh-need--act .gh-sub, .gh-need--act .gh-need__title` |  |  | var(--pastel-peach-ink) |  |  |  |  |
| life | `apps/life/css/garage-home.css:67` |  | `.gh-need--soon .gh-sub, .gh-need--soon .gh-need__title` |  |  | var(--pastel-sage-ink) |  |  |  |  |
| life | `apps/life/css/garage-home.css:70` |  | `.gh-card__title` | var(--text-lg) | var(--weight-bold) | var(--depth) |  | var(--tracking-tight) |  |  |
| life | `apps/life/css/garage-home.css:130` |  | `.gh-marker__title` |  |  | var(--orca) |  |  |  |  |
| life | `apps/life/css/garage-home.css:131` |  | `.gh-marker.is-on .gh-marker__title` |  |  | var(--depth) |  |  |  |  |
| life | `apps/life/css/garage-home.css:191` |  | `.gh-sheet__head h2` | var(--text-lg) |  | var(--depth) |  |  |  | 0 |
| life | `apps/life/css/garage-home.css:194` |  | `.gh-sheet__section h3` | var(--text-2xs) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 0 var(--space-2) |
| life | `apps/life/css/garage-home.css:199` |  | `.gh-fieldset legend` | var(--text-2xs) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  |  |
| life | `apps/life/css/property.css:11` |  | `.prop-kicker` | var(--text-2xs) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 0 var(--space-2) |
| life | `apps/life/css/property.css:15` |  | `.prop-section-head h2` | var(--text-lg) |  | var(--depth) |  | var(--tracking-tight) |  | 0 |
| life | `apps/life/css/property.css:65` |  | `.prop-countdown .prop-kicker, .prop-tm .prop-kicker` |  |  | var(--on-dark-muted) |  |  |  |  |
| life | `apps/life/css/property.css:66` |  | `.prop-countdown h2` | var(--text-lg) |  | var(--on-dark) |  |  |  | 0 |
| life | `apps/life/css/property.css:90` |  | `.prop-tm__title` | var(--text-lg) | var(--weight-semibold) | var(--on-dark-muted) |  | var(--tracking-tight) |  | 0 |
| life | `apps/life/css/property.css:280` |  | `.prop-sheet__head h2` | var(--text-lg) |  | var(--depth) |  |  |  | 0 |
| life | `apps/life/css/property.css:298` |  | `.prop-fieldset legend` | var(--text-2xs) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  |  |
| professional | `apps/professional/src/styles/comm-page.css:13` |  | `.card h3` | var(--text-md) |  | var(--depth) |  |  |  | 0 0 var(--space-3) |
| professional | `apps/professional/src/styles/comm-page.css:480` |  | `.clare-found h4` | var(--text-sm) |  | var(--depth) |  |  |  | 0 |
| professional | `apps/professional/src/styles/event-page.css:129` |  | `.pi__title` | var(--text-sm) | var(--weight-semibold) |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:294` |  | `.entity-detail__heading` | var(--text-lg) |  |  |  |  |  | 0 0 var(--space-3) |
| professional | `apps/professional/src/styles/hub.css:372` |  | `.person-card__kicker, .person-card__empty` | var(--text-2xs) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 |
| professional | `apps/professional/src/styles/hub.css:507` |  | `.entity-detail__subheading` | var(--text-sm) |  | var(--muted) | uppercase | var(--tracking-tight) |  | 0 0 var(--space-2) |
| professional | `apps/professional/src/styles/hub.css:680` |  | `.schedule-db__title` | var(--text-xl) | 650 | var(--depth) |  | var(--tracking-tight) |  | 0 |
| professional | `apps/professional/src/styles/hub.css:969` |  | `.applications__pipeline-heading, .career__heading` | var(--text-lg) |  |  |  |  |  | 0 0 var(--space-3) |
| professional | `apps/professional/src/styles/hub.css:1005` |  | `.people-home__title` | var(--text-xl) |  |  |  |  |  | 0 |
| professional | `apps/professional/src/styles/hub.css:1266` |  | `.people-home__module-heading` | var(--text-lg) |  |  |  |  |  | 0 0 var(--space-3) |
| professional | `apps/professional/src/styles/hub.css:1609` |  | `.miniworld__panel-kicker` | var(--text-sm) |  | var(--sage-ink, #3c5949) |  |  |  | 0 |
| professional | `apps/professional/src/styles/hub.css:1617` |  | `.miniworld__panel h2` | var(--text-lg) |  | var(--navy) |  |  | 1.2 | 0 |
| professional | `apps/professional/src/styles/hub.css:1632` |  | `.miniworld__panel h3` | var(--text-2xs) |  | var(--muted) | uppercase | 0.1em |  | 0 0 6px |
| professional | `apps/professional/src/styles/hub.css:1761` |  | `.miniworld__key-panel h3` | var(--text-2xs) |  | var(--muted) | uppercase | 0.1em |  | 12px 0 6px |
| professional | `apps/professional/src/styles/hub.css:1873` |  | `.miniworld__box h2` | var(--text-2xs) |  | var(--muted) | uppercase | 0.1em |  | 0 0 10px |
| professional | `apps/professional/src/styles/hub.css:1956` |  | `.miniworld__card h3` | var(--text-md) |  | var(--navy) |  |  |  | 0 |
| professional | `apps/professional/src/styles/hub.css:2658` |  | `.event-form .event-compose__title` | var(--text-2xl) | var(--weight-bold) | var(--depth) |  | var(--tracking-tight) | var(--leading-tight) |  |
| professional | `apps/professional/src/styles/hub.css:2667` |  | `.event-compose__title::placeholder` |  |  | var(--shallow) |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:2836` | @media (max-width: 720px) | `.event-form .event-compose__title` | max(1rem, var(--text-base)) | var(--weight-semibold) |  |  | normal | var(--leading-snug) |  |
| professional | `apps/professional/src/styles/hub.css:2870` |  | `.event-detail__section-title` | var(--text-lg) | var(--weight-semibold) | var(--navy) |  | var(--tracking-tight) |  | 0 0 var(--space-4) |
| professional | `apps/professional/src/styles/hub.css:2878` |  | `.event-detail__kicker` | var(--text-2xs) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 0 var(--space-2) |
| professional | `apps/professional/src/styles/hub.css:2973` |  | `.event-detail .task-link-panel h2, .event-detail .task-link-panel h3` | var(--text-2xs) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 0 var(--space-2) |
| professional | `apps/professional/src/styles/hub.css:3022` | @media (max-width: 720px) | `.page-header__title` | var(--text-xl) |  |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:3027` | @media (max-width: 720px) | `.page-header__eyebrow` | var(--text-2xs) |  |  |  |  |  | var(--space-1) |
| professional | `apps/professional/src/styles/hub.css:3050` | @media (max-width: 720px) | `.page-header--person .page-header__title` | var(--text-lg) |  |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:3149` |  | `.people-page__title` | var(--text-xl) | 650 | var(--depth) |  | var(--tracking-tight) |  | 0 |
| professional | `apps/professional/src/styles/hub.css:3493` |  | `.people-pane__name` | 28px | 650 | var(--depth) |  |  |  | 0 |
| professional | `apps/professional/src/styles/hub.css:3993` | @media (max-width: 719px) | `.people-pane__name` | var(--text-lg) |  |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:4026` |  | `.orgs-page__title` | var(--text-2xl) | 700 | var(--depth) |  |  |  | 0 |
| professional | `apps/professional/src/styles/hub.css:4115` |  | `.orgs-opps__title` | var(--text-base) | 650 | var(--depth) |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:4203` |  | `.orgs-tile__name` | var(--text-base) | 650 | var(--depth) |  |  |  | 0 0 6px |
| professional | `apps/professional/src/styles/hub.css:4656` |  | `.orgs-compare__name` | var(--text-base) |  |  |  |  |  | 0 0 8px |
| professional | `apps/professional/src/styles/hub.css:5247` |  | `.career-scan__title` | var(--text-md) |  |  |  |  |  | 0 |
| professional | `apps/professional/src/styles/hub.css:5371` |  | `.career-page__heading` | var(--text-lg) |  |  |  |  |  | 0 0 var(--space-3) |
| professional | `apps/professional/src/styles/hub.css:5385` |  | `.career-page__section-head .career-page__heading` |  |  |  |  |  |  | 0 |
| professional | `apps/professional/src/styles/hub.css:5487` |  | `.ties-confirm__title` | var(--text-xl) |  | var(--ink) |  |  |  | 0 |
| professional | `apps/professional/src/styles/hub.css:5537` |  | `.ties-confirm__name` |  |  | var(--ink) |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:5714` |  | `.org-chart__title h2` | var(--text-lg) |  | var(--depth) |  |  |  | 0 |
| professional | `apps/professional/src/styles/hub.css:6138` |  | `.org-chart__inspector h3` | var(--text-base) |  | var(--depth) |  |  |  | 6px 0 0 |
| professional | `apps/professional/src/styles/meeting-page.css:250` |  | `.meeting-page__notes-card h3` |  |  |  |  |  |  | var(--space-1) |
| professional | `apps/professional/src/styles/meeting-page.css:326` |  | `.meeting-page .task-link-panel h3` | var(--text-md) |  | var(--depth) |  |  |  | 0 |
| professional | `apps/professional/src/styles/meeting-page.css:366` |  | `.meeting-page__editor .event-form .event-compose__title` | var(--text-lg) |  |  |  |  |  |  |
| professional | `apps/professional/src/styles/meeting-page.css:373` | @media (max-width: 720px) | `body:has(.meeting-page) .page-header__title, body:has(.meeting-compose) .page-header__title` | var(--text-lg) |  |  |  |  |  |  |
| professional | `apps/professional/src/styles/meeting-page.css:424` | @media (max-width: 720px) | `.meeting-page__editor .event-form .event-compose__title` | max(1rem, var(--text-base)) | var(--weight-semibold) |  |  | normal | var(--leading-snug) |  |
| professional | `apps/professional/src/styles/quick-log.css:16` |  | `.quick-log__title` | var(--text-lg) |  |  |  |  |  | 0 |
| professional | `apps/professional/src/styles/walk-in.css:16` |  | `.walk-in h3` | var(--text-lg) |  | #fff |  |  |  | 0 |
| tasks | `apps/tasks/src/grove-world-preview/preview.css:4` |  | `.world-preview__eyebrow` | var(--text-xs) |  |  | uppercase | .08em |  |  |
| tasks | `apps/tasks/src/grove-world-preview/preview.css:5` |  | `.world-preview h1` | var(--text-2xl) |  |  |  |  |  | var(--space-2) 0 |
| tasks | `apps/tasks/src/personal-line/personal-line.css:46` |  | `.pl-bar h2` |  |  | #fff |  |  |  | 0 |
| tasks | `apps/tasks/src/personal-line/personal-line.css:80` |  | `.pl-undated h3, .pl-key h3` |  |  |  |  |  |  | 0 0 10px |
| tasks | `apps/tasks/src/personal-line/personal-line.css:103` |  | `.pl-card__title h3` |  |  |  |  |  |  | 0 |
| tasks | `apps/tasks/src/personal-line/personal-line.css:104` |  | `.pl-card__title p` |  |  | var(--pl-muted) |  |  |  | 4px 0 0 |
| tasks | `apps/tasks/src/personal-line/personal-line.css:130` |  | `.pl-next h4` |  |  | var(--pl-muted) |  |  |  | 0 |
| tasks | `apps/tasks/src/personal-line/personal-line.css:142` | @media (max-width: 520px) | `.pl-bar h2` | 20px |  |  |  |  |  |  |
| tasks | `apps/tasks/src/personal-line/personal-line.css:153` |  | `.pl-field > legend, .pl-name-field > span` | 12px | 600 | #5d6878 | uppercase | .08em |  | 8px |
| tasks | `apps/tasks/src/personal-line/personal-line.css:176` |  | `.pl-published h2` |  |  |  |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/backlog.css:363` |  | `.backlog-row__title` | var(--text-base) | var(--weight-regular) | inherit |  |  |  |  |
| tasks | `apps/tasks/src/styles/backlog.css:595` |  | `.backlog-empty h2` | var(--text-lg) |  |  |  |  |  | 0 0 var(--space-2) |
| tasks | `apps/tasks/src/styles/backlog.css:714` |  | `.backlog-triage__title` | var(--text-xl) |  |  |  | var(--tracking-tight) |  | var(--space-3) 0 |
| tasks | `apps/tasks/src/styles/cards.css:24` |  | `.hub-card__eyebrow` | var(--text-sm) | var(--weight-semibold) | var(--muted) | uppercase | var(--tracking-caps) |  |  |
| tasks | `apps/tasks/src/styles/cards.css:109` |  | `.hub-card__title` | var(--text-base) | var(--weight-semibold) | var(--navy) |  | var(--tracking-tight) | var(--leading-snug) | 0 |
| tasks | `apps/tasks/src/styles/cards.css:649` |  | `.hub-row__title` | var(--text-sm) | var(--weight-semibold) | var(--ink) |  | var(--tracking-tight) | var(--leading-tight) | 0 |
| tasks | `apps/tasks/src/styles/cards.css:873` |  | `.page-card .hub-card__title` | var(--text-xl) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:878` |  | `.page-card__title-input` | inherit | inherit | inherit |  | inherit | inherit | 0 |
| tasks | `apps/tasks/src/styles/cards.css:908` |  | `.page-card__tasks .task-row__title a` |  |  | inherit |  |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:913` |  | `.page-card__tasks .task-row__title a:hover` |  |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:1052` |  | `.hub-row__title.card-title, .hub-card__title.card-title` | inherit | inherit | inherit |  | inherit | inherit |  |
| tasks | `apps/tasks/src/styles/cards.css:1063` |  | `.hub-canvas .hub-row__title.card-title, .hub-canvas .hub-card:not(.page-card) .hub-card__title.card-title` | var(--text-sm) | var(--weight-semibold) | var(--ink) |  | var(--tracking-tight) | var(--leading-tight) |  |
| tasks | `apps/tasks/src/styles/cards.css:1072` |  | `.hub-canvas .hub-card:not(.page-card) .hub-card__eyebrow` | var(--text-2xs) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:1107` |  | `.hub-canvas .hub-row .hub-chip--attach .hub-chip__name, .hub-canvas .hub-card:not(.page-card) .hub-chip--attach .hub-chip__name` |  | var(--weight-medium) | var(--orca) |  |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:1157` | @media (max-width: 720px) | `.hub-canvas .hub-row__title, .hub-row__title` | var(--text-sm) |  |  |  |  | 1.25 |  |
| tasks | `apps/tasks/src/styles/cards.css:1239` | @media (max-width: 720px) | `.hub-canvas .hub-card:not(.page-card) .hub-card__title` | var(--text-base) |  |  |  |  | 1.25 |  |
| tasks | `apps/tasks/src/styles/cards.css:1244` | @media (max-width: 720px) | `.hub-canvas .hub-card:not(.page-card) .hub-card__eyebrow` | var(--text-2xs) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:1262` | @media (max-width: 720px) | `.block-editor input, .block-editor textarea, .block-editor select, .block-editor__rich, .page-editor .hub-search, .page-editor .hub-filter, .page-card__title-input` | 1rem |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:1272` | @media (max-width: 720px) | `.page-card .hub-card__title` | var(--text-lg) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/gantt.css:369` |  | `.gantt-popover h4` | var(--text-xs) | var(--weight-semibold) | var(--navy) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/gantt.css:441` |  | `.graph-preview__deps h4` | var(--text-2xs) |  | var(--muted) | uppercase | var(--tracking-caps) |  | 0 0 var(--space-2) |
| tasks | `apps/tasks/src/styles/goals.css:10` |  | `.goals-meter--compact .prod-card__title` | var(--text-sm) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/goals.css:11` |  | `.goals-meter--compact .prod-card__eyebrow` | var(--text-2xs) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/goals.css:34` |  | `.runway__year-term h3` | var(--text-md) |  |  |  |  |  | 0 0 var(--space-3) |
| tasks | `apps/tasks/src/styles/goals.css:188` |  | `.goal-card__eyebrow` | var(--text-2xs) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  | var(--space-2) |
| tasks | `apps/tasks/src/styles/goals.css:207` |  | `.goal-ifthen .goal-card__eyebrow` |  |  | var(--on-dark-muted) |  |  |  |  |
| tasks | `apps/tasks/src/styles/goals.css:211` |  | `.goal-start .goal-card__eyebrow` |  |  | var(--pastel-blue-ink) |  |  |  |  |
| tasks | `apps/tasks/src/styles/goals.css:234` |  | `.hammond__title` | var(--text-base) | var(--weight-semibold) | var(--navy) |  |  |  | var(--space-1) |
| tasks | `apps/tasks/src/styles/graph.css:90` |  | `.graph-drawer__title` | var(--text-lg) |  |  |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/graph.css:95` |  | `.graph-drawer__meta, .graph-drawer__score, .graph-drawer__list, .graph-insights__title` | var(--text-sm) |  | var(--muted) |  |  |  | var(--space-2) 0 0 |
| tasks | `apps/tasks/src/styles/graph.css:244` |  | `.graph-line__name` |  |  | var(--ink) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/graph.css:673` |  | `.graph-orbit__panel h3` |  |  | var(--muted) | uppercase | 0.08em |  | 0 0 10px |
| tasks | `apps/tasks/src/styles/hub.css:176` | @media (max-width: 720px) | `.page-header__title` | var(--text-xl) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/hub.css:181` | @media (max-width: 720px) | `.page-header__title-input` | var(--text-lg) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/hub.css:237` |  | `.page-header__title-input` |  |  | inherit |  | inherit | inherit | 0 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:8` |  | `.lesson-editor__title-field` |  |  |  |  |  |  | var(--space-4) |
| tasks | `apps/tasks/src/styles/lesson-engine.css:13` |  | `.lesson-editor__title-label` | var(--text-sm) | var(--weight-medium) | var(--orca) |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:23` |  | `.lesson-editor__title-input` | var(--text-base) | var(--weight-semibold) | var(--navy) |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:177` |  | `.lesson-editor__composition-modal-heading` | var(--text-md) | var(--weight-semibold) | var(--depth) |  |  |  | 0 0 var(--space-3) |
| tasks | `apps/tasks/src/styles/lesson-engine.css:352` |  | `.agent-protocol-pills__eyebrow` |  |  |  |  |  |  | 0 0 var(--space-2) |
| tasks | `apps/tasks/src/styles/lesson-engine.css:618` |  | `.print-document__title` | var(--text-xl) |  |  |  |  |  | 0 0 var(--space-4) |
| tasks | `apps/tasks/src/styles/lesson-engine.css:718` |  | `.block-editor__heading-text, .block-editor__callout-title, .block-editor__quote-attribution, .block-editor__quote-source, .block-editor__quote-reference, .block-editor__definition-term, .block-editor__code-language, .blo` | var(--text-base) |  | var(--ink) |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:942` |  | `.student-hero__eyebrow, .lesson-hero__eyebrow` | var(--text-sm) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:951` |  | `.student-hero__title, .lesson-hero__title` | clamp(var(--text-lg), 4vw, var(--text-2xl)) | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) | var(--leading-tight) |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1028` |  | `.student-section-title` | var(--text-lg) | var(--weight-semibold) | var(--navy) |  | var(--tracking-tight) |  | 0 0 var(--space-4) |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1049` |  | `.student-continue__kicker` | var(--text-sm) | var(--weight-bold) | var(--high-sea-ink) | uppercase | var(--tracking-caps) |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1057` |  | `.student-continue__title` | var(--text-xl) | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) | var(--leading-tight) | var(--space-2) |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1163` |  | `.student-unit-card__title` |  | var(--weight-semibold) | var(--navy) |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1193` |  | `.student-class__heading` |  |  |  |  |  |  | 0 0 var(--space-3) |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1265` |  | `.student-pager__title` | var(--text-base) | var(--weight-semibold) |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1313` |  | `.block-image__caption, .block-video__caption, .block-video__title, .block-image__unavailable, .block-video__unavailable, .block-embed__unavailable, .block-unavailable` | var(--text-sm) |  | var(--muted) |  |  |  | var(--space-2) |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1489` |  | `.block-audio__title, .block-attachment__unavailable, .block-audio__unavailable` | var(--text-base) |  | var(--muted) |  |  |  | 0 0 var(--space-2) |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1520` |  | `.block-accordion__title` |  | var(--weight-semibold) |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1858` |  | `.block-card-stack__heading` | var(--text-lg) | var(--weight-semibold) | var(--ink) |  | var(--tracking-tight) |  | 0 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1949` |  | `.block-card-stack__eyebrow` | var(--text-2xs) | var(--weight-semibold) |  | uppercase | var(--tracking-caps) |  | 0 0 var(--space-3) |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1959` |  | `.block-card-stack__title` | var(--text-xl) | var(--weight-semibold) |  |  | var(--tracking-tight) | var(--leading-tight) | 0 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:2111` |  | `.block-heading` |  | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) |  | 0 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:2119` |  | `.block-heading--page` | var(--text-lg) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:2123` |  | `.block-heading--section` | var(--text-md) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:2127` |  | `.block-heading--subsection` | var(--text-base) | var(--weight-semibold) |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:2142` |  | `.callout__title` | var(--text-base) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:2173` |  | `.block-question-set__title` | var(--text-lg) | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) |  | 0 0 4px |
| tasks | `apps/tasks/src/styles/lesson-engine.css:2269` |  | `.block-section__title` | var(--font-size-section) |  | var(--ink) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:2630` |  | `.block-cloze__title, .block-self-check__title` | var(--text-md) |  | var(--depth) |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:2941` |  | `.block-collection__title` | var(--text-base) |  |  |  |  |  | 0 0 var(--space-2) |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3170` |  | `.alchemy-lab-card h2` | var(--text-sm) |  |  |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3511` |  | `.lesson-page__title` | var(--text-xl) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3755` |  | `.block-whiteboard__title` | var(--text-md) | var(--weight-semibold) | var(--ink) |  |  |  |  |
| tasks | `apps/tasks/src/styles/timeline.css:211` |  | `.tl-composer__title` |  |  | var(--ink) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:9` |  | `.section-title` | var(--text-base) |  | var(--navy) |  | var(--tracking-tight) |  | var(--space-5) 0 var(--space-2) |
| tasks | `apps/tasks/src/styles/views.css:83` |  | `.task-row__title` | var(--text-base) | var(--weight-semibold) | var(--ink) |  | var(--tracking-tight) |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:115` |  | `.property-section:first-child .section-title` |  |  |  |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:119` |  | `.property-section .section-title` |  |  |  |  |  |  | var(--space-2) |
| tasks | `apps/tasks/src/styles/views.css:570` |  | `.hierarchy-area__title` | var(--text-xl) |  | var(--navy) |  | var(--tracking-tight) |  | 0 0 var(--space-4) |
| tasks | `apps/tasks/src/styles/views.css:585` |  | `.hierarchy-goal__title` | var(--text-lg) |  | var(--ink) |  |  |  | var(--space-1) 0 0 |
| tasks | `apps/tasks/src/styles/views.css:643` |  | `.hierarchy-card__title` | var(--text-md) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:673` |  | `.hierarchy-milestone__title` | var(--text-sm) |  | var(--ink) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:839` |  | `.someday-cta__title` | var(--text-base) | var(--weight-bold) | #fff |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:874` |  | `.someday-preview-card__title` | var(--text-sm) | var(--weight-bold) | var(--ink) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:950` |  | `.someday-card__title` | var(--text-md) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:1339` |  | `.someday-odyssey__title` | var(--text-xl) | var(--weight-bold) | var(--ink) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:1618` |  | `.reminder-card__title` | var(--text-md) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:1765` | @media (max-width: 720px) | `.dashboard-board .section-title` | var(--text-base) |  |  |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:1934` |  | `.board-col__title, .column-title` | var(--text-sm) | var(--weight-semibold) | var(--navy) | uppercase | var(--tracking-caps) |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:2002` |  | `.board-card__title, .card-title` | var(--text-base) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:2139` |  | `.graph-preview__eyebrow` | var(--text-2xs) |  | var(--muted) | uppercase | var(--tracking-caps) |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:2147` |  | `.graph-preview__title` | var(--text-md) |  | var(--navy) |  |  |  | var(--space-1) 0 |
| tasks | `apps/tasks/src/styles/views.css:2461` |  | `.excursion-folder__title` | var(--text-sm) | var(--weight-semibold) | var(--ink) |  |  |  | 0 0 var(--space-2) |
| tasks | `apps/tasks/src/styles/views.css:2553` |  | `.excursion-term__name` | var(--text-sm) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:2798` |  | `.page-header--cover .page-header__title, .page-header--cover .page-header__title-input` |  |  |  |  |  |  | -1px |
| tasks | `apps/tasks/src/styles/views.css:2833` |  | `.excursion-page .lesson-page__title` | var(--text-2xl) | var(--weight-bold) | var(--on-dark) |  | var(--tracking-tight) | var(--leading-tight) | 0 |
| tasks | `apps/tasks/src/styles/views.css:2844` |  | `.excursion-page .lesson-page__title::placeholder` |  |  | var(--on-dark-muted) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:2861` | @media (max-width: 720px) | `.excursion-page .lesson-page__title` | var(--text-xl) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:2871` |  | `.excursion-page__intro .hub-card__title` | var(--text-xl) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:2921` |  | `.excursion-gate__title` | var(--text-md) | var(--weight-semibold) |  |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:2927` |  | `.excursion-gate--warn .excursion-gate__title` |  |  | var(--warning) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:2931` |  | `.excursion-gate--go .excursion-gate__title` |  |  | var(--success) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:3106` |  | `.clare-protocols .page-header__eyebrow` | var(--text-2xs) |  |  |  |  |  | var(--space-1) |
| tasks | `apps/tasks/src/styles/views.css:3199` |  | `.clare-briefing__heading` | var(--text-sm) |  | var(--muted) | uppercase | var(--tracking-wide) |  | var(--space-3) 0 0 |
| tasks | `apps/tasks/src/styles/views.css:3259` |  | `.clare-bubble__title` | var(--text-md) |  | var(--navy) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:3294` |  | `.clare-confirm__title` | var(--text-lg) |  | var(--navy) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:3355` |  | `.hub-layout[data-hub-view='clare'] .page-header__title` | var(--text-xl) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:3494` | @media (max-width: 720px) | `.hub-layout[data-hub-view='clare'] .page-header__title` | var(--text-lg) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:4280` |  | `.pinch-confirm__title` | var(--text-lg) |  | var(--navy) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:4314` |  | `.stall-confirm__title` | var(--text-lg) |  | var(--navy) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:4330` |  | `.closure-confirm__title` | var(--text-lg) |  | var(--navy) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:4866` |  | `.map-key__name` |  | var(--weight-medium) |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:5005` |  | `.map-editbar__name-label` | var(--text-sm) |  | var(--muted) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:5017` |  | `.map-editbar__name-input, .map-inspector__input` | var(--text-base) |  | var(--ink) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:5025` |  | `.map-editbar__name-input` |  | var(--weight-semibold) |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:5317` |  | `.map-inspector__eyebrow` | var(--text-2xs) | var(--weight-semibold) | var(--muted) | uppercase | var(--tracking-caps) |  |  |
| tasks | `apps/tasks/src/styles/views.css:5325` |  | `.map-inspector__title` | var(--text-lg) | var(--weight-semibold) |  |  |  | 1.25 | 0 |
| tasks | `apps/tasks/src/styles/views.css:5546` |  | `.map-index__title` | var(--text-sm) | var(--weight-semibold) | var(--navy) | none | 0 |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:5929` |  | `.hub-calendar--workspace .hub-calendar__detail-heading` | var(--text-sm) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:6098` |  | `.calendar-pulse-card__name` | var(--text-sm) | var(--weight-semibold) | var(--ink) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:6154` |  | `.calendar-touched-chip__name` |  | var(--weight-semibold) | var(--ink) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:6669` |  | `.universe-key__title` | var(--text-sm) | var(--weight-semibold) | var(--navy) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:6742` |  | `.universe-key__name` | var(--text-sm) | var(--weight-semibold) | var(--navy) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:7257` |  | `.dashboard-overview__head .hub-card__eyebrow` |  |  |  |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:7367` |  | `.projects-mix__value, .projects-mix__name, .projects-mix__sub` |  |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:7416` |  | `.projects-mix__name` | var(--text-sm) | var(--weight-semibold) | var(--muted) |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:7668` |  | `.dashboard-next__eyebrow` |  |  | var(--on-dark-muted) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:7680` |  | `.dashboard-next__title` | var(--text-md) | var(--weight-bold) | var(--on-dark) |  | var(--tracking-tight) |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:7815` |  | `.dashboard-row__title` | var(--text-sm) | var(--weight-semibold) | var(--ink) |  | var(--tracking-tight) |  |  |
| tasks | `apps/tasks/src/styles/views.css:8045` |  | `.dashboard-board .section-title` |  |  |  |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:8323` | @media (max-width: 720px) | `.dashboard-overview__head .hub-card__eyebrow` | var(--text-2xs) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:8363` | @media (max-width: 720px) | `.dashboard-next__title` | var(--text-sm) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:8387` | @media (max-width: 720px) | `.dashboard-row__title` | var(--text-sm) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:8642` |  | `.lane__title` | var(--text-sm) | var(--weight-bold) | var(--orca) | uppercase | var(--tracking-wide) |  |  |
| tasks | `apps/tasks/src/styles/views.css:8683` |  | `.pcard__title` | var(--text-base) | var(--weight-semibold) | var(--navy) |  |  | var(--leading-snug) |  |
| tasks | `apps/tasks/src/styles/views.css:8690` |  | `.pcard--compact .pcard__title` | var(--text-sm) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:8918` |  | `.section-title--tight` |  |  |  |  |  |  | var(--space-1) / 0 |
| tasks | `apps/tasks/src/views/grove/grove.css:181` |  | `.grove-card__title` |  | var(--weight-semibold) |  |  |  | var(--leading-snug) | 0 0 var(--space-1) |
| tasks | `apps/tasks/src/views/grove/grove.css:334` |  | `.grove-tray.is-open .grove-tray__heading` |  |  |  |  |  |  |  |
| tasks | `apps/tasks/src/views/grove/grove.css:488` |  | `.grove-key__title` | var(--text-base) | var(--weight-semibold) |  |  |  |  | 0 |
| tasks | `apps/tasks/src/views/grove/grove.css:517` |  | `.grove-key__heading` | var(--text-xs) | var(--weight-semibold) | var(--ink-muted) | uppercase | 0.06em |  | var(--space-2) 0 var(--space-1) |
| tasks | `apps/tasks/src/views/problem-solver/problem-solver-view.css:10` |  | `.ps-session__title` |  |  |  |  |  |  | 0 |
| tasks | `apps/tasks/src/views/problem-solver/problem-solver-view.css:14` |  | `.ps-canvas__title` | var(--text-md) |  |  |  |  |  | 0 0 var(--space-4) |
| tasks | `apps/tasks/src/views/problem-solver/problem-solver-view.css:28` |  | `.ps-suggestion__title` |  | var(--weight-semibold) |  |  |  |  | 0 |
| tasks | `apps/tasks/src/views/programs-network.css:46` |  | `.pn-plat__title h2` |  |  | #fff |  |  |  | 0 |
| tasks | `apps/tasks/src/views/programs-network.css:61` |  | `.pn-board__row:hover .pn-board__name` |  |  |  |  |  |  |  |
| tasks | `apps/tasks/src/views/programs-network.css:106` | @media (max-width: 520px) | `.pn-plat__title h2` | 24px |  |  |  |  |  |  |
| tasks | `apps/tasks/src/views/programs-network.css:128` |  | `.pn-tt__name` |  |  |  |  |  |  |  |
| tasks | `apps/tasks/src/views/programs-network.css:131` |  | `.pn-tt__name:hover .pn-tt__label` |  |  |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/alchemy-assistant.css:13` |  | `.alchemy-review h2` | 1.1rem |  |  |  |  |  | 0 0 var(--space-3) |
| teaching | `apps/teaching/src/styles/app.css:61` |  | `h1, h2, h3, h4, p` |  |  |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:107` |  | `.page-header__eyebrow` | var(--text-sm) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  | 0 0 var(--space-2) |
| teaching | `apps/teaching/src/styles/app.css:122` |  | `.page-header__title` | var(--text-2xl) | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) | var(--leading-tight) | 0 |
| teaching | `apps/teaching/src/styles/app.css:543` |  | `.lesson-editor__title-field` |  |  |  |  |  |  | var(--space-4) |
| teaching | `apps/teaching/src/styles/app.css:548` |  | `.lesson-editor__title-label` | var(--text-sm) | var(--weight-medium) | var(--orca) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:558` |  | `.lesson-editor__title-input` | var(--text-base) | var(--weight-semibold) | var(--navy) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:717` |  | `.lesson-editor__composition-modal-heading` | var(--text-md) | var(--weight-semibold) | var(--depth) |  |  |  | 0 0 var(--space-3) |
| teaching | `apps/teaching/src/styles/app.css:901` |  | `.agent-protocol-pills__eyebrow` |  |  |  |  |  |  | 0 0 var(--space-2) |
| teaching | `apps/teaching/src/styles/app.css:1169` |  | `.print-document__title` | var(--text-xl) |  |  |  |  |  | 0 0 var(--space-4) |
| teaching | `apps/teaching/src/styles/app.css:1272` |  | `.block-editor__heading-text, .block-editor__heading-variant, .block-editor__callout-style, .block-editor__callout-title, .block-editor__media-size, .block-editor__quote-attribution, .block-editor__quote-source, .block-ed` | var(--text-base) |  | var(--ink) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:1513` |  | `.student-hero__eyebrow, .lesson-hero__eyebrow` | var(--text-sm) | var(--weight-bold) | var(--muted) | uppercase | var(--tracking-caps) |  |  |
| teaching | `apps/teaching/src/styles/app.css:1522` |  | `.student-hero__title, .lesson-hero__title` | clamp(var(--text-lg), 4vw, var(--text-2xl)) | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) | var(--leading-tight) |  |
| teaching | `apps/teaching/src/styles/app.css:1599` |  | `.student-section-title` | var(--text-lg) | var(--weight-semibold) | var(--navy) |  | var(--tracking-tight) |  | 0 0 var(--space-4) |
| teaching | `apps/teaching/src/styles/app.css:1620` |  | `.student-continue__kicker` | var(--text-sm) | var(--weight-bold) | var(--high-sea-ink) | uppercase | var(--tracking-caps) |  |  |
| teaching | `apps/teaching/src/styles/app.css:1628` |  | `.student-continue__title` | var(--text-xl) | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) | var(--leading-tight) | var(--space-2) |
| teaching | `apps/teaching/src/styles/app.css:1734` |  | `.student-unit-card__title` |  | var(--weight-semibold) | var(--navy) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:1764` |  | `.student-class__heading` |  |  |  |  |  |  | 0 0 var(--space-3) |
| teaching | `apps/teaching/src/styles/app.css:1836` |  | `.student-pager__title` | var(--text-base) | var(--weight-semibold) |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:2034` |  | `.home-heading` | var(--text-lg) | var(--weight-semibold) | var(--depth) |  | var(--tracking-tight) |  | var(--space-5) |
| teaching | `apps/teaching/src/styles/app.css:2081` |  | `.lesson-list__title` | var(--text-md) | var(--weight-semibold) | var(--ink) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:2333` |  | `.units-index__title` | var(--text-sm) | var(--weight-semibold) | var(--navy) |  |  | 1.3 | 0 |
| teaching | `apps/teaching/src/styles/app.css:2574` |  | `.entity-banner__eyebrow` | var(--text-sm) | var(--weight-semibold) | var(--on-dark-muted) | uppercase | var(--tracking-caps) |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:2584` |  | `.entity-banner__title` | clamp(var(--text-lg), 3.4vw, var(--text-2xl)) | var(--weight-semibold) | var(--on-dark) |  | var(--tracking-tight) | var(--leading-tight) | 0 |
| teaching | `apps/teaching/src/styles/app.css:3090` |  | `.entity-page-title .entity-page-title__input, .entity-page-title .entity-page-title__text` | var(--text-2xl) | var(--weight-bold) | #fff |  | var(--tracking-tight) | var(--leading-tight) | 0 |
| teaching | `apps/teaching/src/styles/app.css:3123` |  | `.entity-page-title__status` | var(--text-xs) |  | rgba(255, 255, 255, 0.88) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:3131` |  | `.entity-page-title__status--error` |  |  | #fff1f1 |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:3146` | @media (max-width: 720px) | `.entity-page-title .entity-page-title__input, .entity-page-title .entity-page-title__text` | var(--text-xl) |  |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:3173` |  | `.class-page__header .home-heading` |  |  |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:3177` |  | `.class-page__title` | var(--text-md) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:3198` |  | `.class-page__heading` | var(--text-md) | var(--weight-semibold) | var(--depth) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:3467` |  | `.schedule-modal__title` | var(--text-lg) |  | var(--ink) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:3651` |  | `.home-dashboard__hero .page-header` |  |  |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:3674` |  | `.home-dashboard__heading-row` |  |  |  |  |  |  | var(--space-3) |
| teaching | `apps/teaching/src/styles/app.css:3678` |  | `.home-dashboard__heading-row .home-dashboard__heading` |  |  |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:3682` |  | `.home-dashboard__title` | var(--font-size-page) | var(--weight-bold) | var(--depth) |  |  |  | var(--space-3) 0 0 |
| teaching | `apps/teaching/src/styles/app.css:3695` |  | `.home-dashboard__heading` | var(--font-size-section) | var(--weight-semibold) | var(--depth) |  |  |  | 0 0 var(--space-3) |
| teaching | `apps/teaching/src/styles/app.css:3882` |  | `.home-today__heading` | var(--font-size-section) | var(--weight-semibold) | #fff |  |  |  | 0 0 var(--space-3) |
| teaching | `apps/teaching/src/styles/app.css:4037` |  | `.home-class-tile__eyebrow` | var(--font-size-meta) | var(--weight-semibold) | var(--muted) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:4045` |  | `.home-class-tile__title` | var(--font-size-body) | var(--weight-bold) | var(--depth) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:4106` |  | `.block-image__caption, .block-video__caption, .block-video__title, .block-image__unavailable, .block-video__unavailable, .block-embed__unavailable, .block-unavailable` | var(--text-sm) |  | var(--muted) |  |  |  | var(--space-2) |
| teaching | `apps/teaching/src/styles/app.css:4282` |  | `.block-audio__title, .block-attachment__unavailable, .block-audio__unavailable` | var(--text-base) |  | var(--muted) |  |  |  | 0 0 var(--space-2) |
| teaching | `apps/teaching/src/styles/app.css:4313` |  | `.block-accordion__title` |  | var(--weight-semibold) |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:4651` |  | `.block-card-stack__heading` | var(--text-lg) | var(--weight-semibold) | var(--ink) |  | var(--tracking-tight) |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:4742` |  | `.block-card-stack__eyebrow` | var(--text-2xs) | var(--weight-semibold) |  | uppercase | var(--tracking-caps) |  | 0 0 var(--space-3) |
| teaching | `apps/teaching/src/styles/app.css:4752` |  | `.block-card-stack__title` | var(--text-xl) | var(--weight-semibold) |  |  | var(--tracking-tight) | var(--leading-tight) | 0 |
| teaching | `apps/teaching/src/styles/app.css:4904` |  | `.block-heading` |  | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:4912` |  | `.block-heading--page` | var(--text-lg) |  |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:4916` |  | `.block-heading--section` | var(--text-md) |  |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:4920` |  | `.block-heading--subsection` | var(--text-base) | var(--weight-semibold) |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:4935` |  | `.callout__title` | var(--text-base) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:4966` |  | `.block-question-set__title` | var(--text-lg) | var(--weight-bold) | var(--navy) |  | var(--tracking-tight) |  | 0 0 4px |
| teaching | `apps/teaching/src/styles/app.css:5062` |  | `.block-section__title` | var(--font-size-section) |  | var(--ink) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:5421` |  | `.block-cloze__title, .block-self-check__title` | var(--text-md) |  | var(--depth) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:5603` |  | `.scope-timeline .home-heading` |  |  |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:5628` |  | `.scope-sequence-compare__title` | var(--text-lg) |  | var(--ink) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:6091` |  | `.scope-gantt__empty h2` | 16.5px | var(--weight-bold) | var(--navy) |  |  |  | 0 0 6px |
| teaching | `apps/teaching/src/styles/app.css:6697` | @media (max-width: 720px) | `.page-header__title` | var(--text-xl) |  |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:6701` | @media (max-width: 720px) | `.page-header__eyebrow` | var(--text-2xs) |  |  |  |  |  | var(--space-1) |
| teaching | `apps/teaching/src/styles/app.css:6780` | @media (max-width: 720px) | `.home-dashboard__hero-time` | var(--font-size-page) |  |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:6973` |  | `.create-modal__title` | var(--font-size-section) | var(--weight-bold) | var(--depth) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:7074` |  | `.entity-card-expand__title, .entity-card-expand__title-input` | var(--font-size-card) | var(--weight-semibold) | var(--depth) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:7125` |  | `.home-dashboard__hero-time` | var(--font-size-hero) | var(--weight-bold) | var(--depth) |  |  | 1.05 |  |
| teaching | `apps/teaching/src/styles/app.css:7134` |  | `.home-dashboard__hero-date` | var(--font-size-body) |  | var(--muted) |  |  |  | var(--space-1) |
| teaching | `apps/teaching/src/styles/app.css:7325` |  | `.block-collection__title` | var(--text-base) |  |  |  |  |  | 0 0 var(--space-2) |
| teaching | `apps/teaching/src/styles/app.css:7395` |  | `.search-palette__heading` | var(--text-2xs) | var(--weight-semibold) | var(--muted) | uppercase | var(--tracking-caps) |  |  |
| teaching | `apps/teaching/src/styles/app.css:7417` |  | `.search-palette__title` | var(--text-base) | var(--weight-semibold) |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:7464` |  | `.templates-page__title` |  | var(--weight-semibold) |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:7743` | @media (max-width: 640px) | `.trash-page__table .trash-page__title` |  | var(--weight-semibold) |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:7805` |  | `.history-panel__heading` | var(--text-base) | var(--weight-semibold) | var(--depth) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:8233` |  | `.alchemy-lab-card h2` | var(--text-sm) |  |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:8499` |  | `.lesson-page__title` | var(--text-xl) | var(--weight-semibold) | var(--ink) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:8961` |  | `.lessons-table__title` |  | var(--weight-semibold) | var(--ink) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:8967` |  | `.lessons-table__title:hover` |  |  | var(--wave) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:9122` |  | `.outcome-list__title` | var(--text-sm) | 600 |  |  |  |  | 0 0 var(--space-1) |
| teaching | `apps/teaching/src/styles/app.css:9135` |  | `.block-outcomes__title` | var(--text-2xs) | 600 | var(--muted) | uppercase | 0.08em |  | 0 0 var(--space-3) |
| teaching | `apps/teaching/src/styles/app.css:9157` |  | `.outcome-picker__title` | var(--text-lg) |  |  |  |  |  | 0 0 var(--space-3) |
| teaching | `apps/teaching/src/styles/app.css:9260` |  | `.block-whiteboard__title` | var(--text-md) | var(--weight-semibold) | var(--ink) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:9331` |  | `.block-annotation__title` | var(--text-lg) | 600 |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:9998` |  | `.block-editor__annotation-section-title` | var(--text-sm) |  |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:10054` |  | `.student-feedback__title` |  |  |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:10516` |  | `.block-annotation__element-sec h4` | var(--text-2xs, 0.6875rem) | 700 | #878a9a | uppercase | 0.12em |  | 0 0 0.35rem |
| teaching | `apps/teaching/src/styles/app.css:11078` |  | `.block-editor__annotation-bar-menu-heading` | 0.75rem | 600 | var(--muted, #5b6170) | uppercase | 0.04em |  | var(--space-2) var(--space-1) 0 |
| teaching | `apps/teaching/src/styles/app.css:11297` |  | `.annotation-technique-sheet__title` | var(--text-lg, 1.125rem) |  |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:11772` |  | `.block-anthology__title` | var(--text-lg) | 600 |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/block-pulse.css:153` |  | `.pulse__title` | var(--text-2xs) | var(--weight-semibold) | var(--ink-muted) | uppercase | 0.06em |  | 0 |
| teaching | `apps/teaching/src/styles/class-examples.css:110` |  | `.cx-tabs__eyebrow` | var(--text-2xs) | var(--weight-semibold) | var(--muted) | uppercase | var(--tracking-caps) |  |  |
| teaching | `apps/teaching/src/styles/toolkit.css:83` |  | `.tk-card__title` | var(--text-lg) | var(--weight-bold) | var(--navy) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/toolkit.css:124` |  | `.tk-card--tool .tk-card__title, .tk-card--tool .tk-card__definition` |  |  | #fff |  |  |  |  |
| teaching | `apps/teaching/src/styles/toolkit.css:135` |  | `.tk-card--value .tk-card__title, .tk-card--value .tk-card__definition` |  |  | var(--depth) |  |  |  |  |
| teaching | `apps/teaching/src/styles/toolkit.css:235` |  | `.tk-step__title` |  | var(--weight-bold) | var(--navy) |  |  |  |  |
| teaching | `apps/teaching/src/styles/toolkit.css:659` |  | `.tk-quadrant__name` |  | var(--weight-bold) | var(--navy) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/toolkit.css:881` |  | `.tk-note__title` |  | var(--weight-bold) | var(--navy) |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/toolkit.css:1105` |  | `.tk-ed__heading` | var(--text-sm) | var(--weight-bold) | var(--navy) |  |  |  | 0 |
| travel | `apps/travel/src/styles/journal.css:72` |  | `.journal-toolbar__title` | var(--text-md) | var(--weight-semibold) |  |  |  |  | 0 |
| travel | `apps/travel/src/styles/journal.css:203` |  | `.journal-leg__title` | var(--text-lg) | var(--weight-bold) |  |  |  |  | 0 0 var(--space-4) |
| travel | `apps/travel/src/styles/journal.css:210` | @media (min-width: 720px) | `.journal-leg__title` | var(--text-xl, 1.5rem) |  |  |  |  |  |  |
| travel | `apps/travel/src/styles/journal.css:354` |  | `.journal-map-panel__title` | var(--text-md) | var(--weight-semibold) |  |  |  |  | 0 |
| travel | `apps/travel/src/styles/journal.css:1044` |  | `.journal-conflict__title` | var(--text-md) |  |  |  |  |  | 0 0 var(--space-2) |
| travel | `apps/travel/src/styles/journal.css:1134` |  | `.journal-pin-panel__title` | var(--text-md) |  |  |  |  |  | 0 |
| travel | `apps/travel/src/styles/journal.css:1244` |  | `.journal-trash__title` |  | 600 |  |  |  |  | 0 |
| travel | `apps/travel/src/styles/journal.css:1346` |  | `.journal-souvenirs__title` | var(--text-md) |  |  |  |  |  | 0 |
| travel | `apps/travel/src/styles/travel.css:28` |  | `h1, h2, h3` |  |  |  |  |  |  | 0 |
| travel | `apps/travel/src/styles/travel.css:61` |  | `.top h1` | 2.1rem | 800 | var(--navy) |  | -.02em | 1.05 | 4px |
| travel | `apps/travel/src/styles/travel.css:147` |  | `.trips-list__card h3` | 1.0625rem |  |  |  |  |  | 0 |
| travel | `apps/travel/src/styles/travel.css:181` |  | `.scene h2` | 2.5rem | 800 |  |  | -.02em | 1 | 4px |
| travel | `apps/travel/src/styles/travel.css:279` |  | `.card h3` | 1rem | 600 |  |  |  |  | 2px |
| travel | `apps/travel/src/styles/travel.css:438` |  | `.sheet h3` | 1.125rem |  |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:506` |  | `.addform h3` |  |  |  |  |  |  | 12px |
| travel | `apps/travel/src/styles/travel.css:581` | @media (max-width: 600px) | `.top h1` | 1.75rem |  |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:582` | @media (max-width: 600px) | `.scene h2` | 2rem |  |  |  |  |  |  |
