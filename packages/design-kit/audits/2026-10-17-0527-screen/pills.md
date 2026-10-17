# Pills, chips, badges, segments, filters

Kit pill button (`.hub-pills__btn`): padding `0.35rem 0.75rem`, min-height `2.2rem`, radius full when loose, `--text-sm`, color `--ink`. Chip (`.hub-chip`): padding `0.2rem 0.55rem`, radius full, `--text-xs`, lilac pastel. Filter (`.hub-filter`): min-height `2.2rem`, radius `--radius-sm`, `--text-sm`.

| Hub | Where | Selector | Size | Weight | Min-height | Padding | Radius | Color | Background | Border |
|---|---|---|---|---|---|---|---|---|---|---|
| kit | `packages/design-kit/calendar-almanac.css:59` | `.alm-t-pill` | 11.5px | 600 |  |  |  |  |  |  |
| kit | `packages/design-kit/calendar-mobile-day.css:116` | `.hub-calendar__day-pill` |  |  | var(--space-12) | var(--space-2) var(--space-1) | var(--radius-sm) | var(--ink) | var(--warm-white) | 1px solid var(--line) |
| kit | `packages/design-kit/calendar-mobile-day.css:136` | `.hub-calendar__day-pill[data-selected='true']` |  |  |  |  |  | var(--on-dark) | var(--navy) | var(--navy) |
| kit | `packages/design-kit/calendar-mobile-day.css:142` | `.hub-calendar__day-pill-letter` | var(--text-2xs) | var(--weight-semibold) |  |  |  | inherit |  |  |
| kit | `packages/design-kit/calendar-mobile-day.css:151` | `.hub-calendar__day-pill-num` | var(--text-sm) | var(--weight-bold) |  |  |  |  |  |  |
| kit | `packages/design-kit/calendar-mobile-day.css:157` | `.hub-calendar__day-pill-marks, .hub-calendar__mobile-month-marks` |  |  | var(--space-1) |  |  |  |  |  |
| kit | `packages/design-kit/calendar-mobile-day.css:165` | `.hub-calendar__day-pill-dot, .hub-calendar__mobile-month-dot` |  |  |  |  | var(--radius-full) |  | var(--pastel-sage-ink) |  |
| kit | `packages/design-kit/calendar-mobile-day.css:173` | `.hub-calendar__day-pill[data-selected='true'] .hub-calendar__day-pill-dot` |  |  |  |  |  |  | var(--on-dark) |  |
| kit | `packages/design-kit/calendar-mobile-day.css:178` | `.hub-calendar__day-pill-dot[data-tint='blue'], .hub-calendar__mobile-month-dot[data-tint='blue']` |  |  |  |  |  |  | var(--pastel-blue-ink) |  |
| kit | `packages/design-kit/calendar-mobile-day.css:180` | `.hub-calendar__day-pill-dot[data-tint='sage'], .hub-calendar__mobile-month-dot[data-tint='sage']` |  |  |  |  |  |  | var(--pastel-sage-ink) |  |
| kit | `packages/design-kit/calendar-mobile-day.css:182` | `.hub-calendar__day-pill-dot[data-tint='peach'], .hub-calendar__mobile-month-dot[data-tint='peach']` |  |  |  |  |  |  | var(--pastel-peach-ink) |  |
| kit | `packages/design-kit/calendar-mobile-day.css:184` | `.hub-calendar__day-pill-dot[data-tint='gold'], .hub-calendar__mobile-month-dot[data-tint='gold']` |  |  |  |  |  |  | var(--pastel-gold-ink) |  |
| kit | `packages/design-kit/calendar-mobile-day.css:186` | `.hub-calendar__day-pill-dot[data-tint='lilac'], .hub-calendar__mobile-month-dot[data-tint='lilac']` |  |  |  |  |  |  | var(--pastel-lilac-ink) |  |
| kit | `packages/design-kit/calendar-mobile-day.css:188` | `.hub-calendar__day-pill-dot[data-tint='sand'], .hub-calendar__mobile-month-dot[data-tint='sand']` |  |  |  |  |  |  | var(--high-sea-ink) |  |
| kit | `packages/design-kit/calendar-mobile-day.css:256` | `.hub-calendar__mobile-segments` |  |  |  | var(--space-1) | var(--radius-sm) |  | var(--cotton) | 1px solid var(--line) |
| kit | `packages/design-kit/calendar-mobile-day.css:266` | `.hub-calendar__mobile-segment` | var(--text-sm) | var(--weight-semibold) | var(--space-10) | var(--space-2) var(--space-3) | var(--radius-xs) | var(--muted) | transparent | 0 |
| kit | `packages/design-kit/calendar-mobile-day.css:280` | `.hub-calendar__mobile-segment[aria-selected='true']` |  |  |  |  |  | var(--ink) | var(--warm-white) |  |
| kit | `packages/design-kit/calendar-tideline.css:36` | `.cal__views .hub-pills:not(.hub-pills--loose)>.hub-pills__btn` | var(--text-sm) |  | 2rem | 0.25rem 0.7rem |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:159` | `.cal-wall__pill` | var(--text-2xs) | var(--weight-semibold) |  | 0 9px | 10px | #fff | var(--navy) |  |
| kit | `packages/design-kit/calendar-tideline.css:165` | `.cal-chip` |  |  |  | var(--py,5px) 8px var(--py,5px) 10px | 9px |  | color-mix(in srgb,var(--k-stripe) calc((1 - var(--t,1)) * 60%),var(--chip-bg)) | 1px solid color-mix(in srgb,var(--navy) calc(var(--t,1) * 10%),transparent) |
| kit | `packages/design-kit/calendar-tideline.css:178` | `.cal-chip::before` |  |  |  |  |  |  | var(--k-stripe) |  |
| kit | `packages/design-kit/calendar-tideline.css:179` | `.cal-chip__title` | var(--text-xs) | var(--weight-semibold) |  |  |  | var(--k-ink,var(--ink)) |  |  |
| kit | `packages/design-kit/calendar-tideline.css:180` | `.cal-chip__meta` | var(--text-2xs) |  |  |  |  | var(--muted) |  |  |
| kit | `packages/design-kit/calendar-tideline.css:184` | `.cal-chip__acts button,.cal-due__move button` |  |  |  | 4px 8px | 6px | var(--navy) | #fff | 1px solid var(--line) |
| kit | `packages/design-kit/calendar-tideline.css:185` | `.cal-chip__acts button.is-yes,.cal-due__move button` |  |  |  |  |  | #fff | var(--navy) | var(--navy) |
| kit | `packages/design-kit/calendar-tideline.css:190` | `.cal-chip__proposal` | var(--text-2xs) | var(--weight-semibold) |  |  |  | var(--navy) |  |  |
| kit | `packages/design-kit/calendar-tideline.css:191` | `.cal-chip.is-ghost` |  |  |  |  |  |  | color-mix(in srgb,var(--chip-bg) calc(var(--solid,0) * 100%),var(--cal-ghost-fill)) | color-mix(in srgb,var(--navy) calc(var(--solid,0) * 10%),transparent) |
| kit | `packages/design-kit/calendar-tideline.css:192` | `.cal-chip.is-ghost::after` |  |  |  |  | inherit |  |  | 1.5px dashed var(--cal-ghost-line) |
| kit | `packages/design-kit/calendar-tideline.css:194` | `.cal-chip.is-over-item` |  |  |  |  |  |  | color-mix(in srgb,var(--warm-white) 88%,transparent) |  |
| kit | `packages/design-kit/calendar-tideline.css:195` | `.cal-chip.is-skipped .cal-chip__title` |  |  |  |  |  | var(--muted) |  |  |
| kit | `packages/design-kit/calendar-tideline.css:197` | `.cal-chip.is-done` |  |  |  |  |  |  | var(--chip-bg) |  |
| kit | `packages/design-kit/calendar-tideline.css:199` | `.cal-chip.is-done .cal-chip__title,.cal-due.is-done b` |  | var(--weight-medium) |  |  |  | var(--muted) |  |  |
| kit | `packages/design-kit/calendar-tideline.css:210` | `.cal-chip.is-corey` |  |  |  |  |  |  | linear-gradient(135deg,color-mix(in srgb,var(--pastel-peach) 62%,#fff),var(--pastel-peach)) | color-mix(in srgb,var(--pastel-peach-ink) 22%,transparent) |
| kit | `packages/design-kit/calendar-tideline.css:211` | `.cal-chip.is-corey.is-ghost` |  |  |  |  |  |  | color-mix(in srgb,var(--pastel-peach) calc(35% + var(--solid,0) * 45%),transparent) |  |
| kit | `packages/design-kit/calendar-tideline.css:298` | `.cal-chip.is-pin` |  |  |  | 2px 8px | var(--radius-full) |  | var(--paper) | 1px solid color-mix(in srgb,var(--wave) 35%,transparent) |
| kit | `packages/design-kit/calendar-tideline.css:301` | `.cal-chip.is-pin .cal-chip__title` | var(--text-2xs) |  |  |  |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:332` | `.cal-chip__grip::after` |  |  |  |  | 2px |  | color-mix(in srgb,var(--navy) 35%,transparent) |  |
| kit | `packages/design-kit/calendar-tideline.css:362` | `.cal-card__pill` | var(--text-xs) | var(--weight-semibold) | 2rem | 2px var(--space-3) | var(--radius-full) | var(--navy) | var(--paper) | 1px solid var(--line) |
| kit | `packages/design-kit/calendar-tideline.css:363` | `.cal-card__pill:hover` |  |  |  |  |  |  | color-mix(in srgb,var(--wave) 6%,var(--paper)) |  |
| kit | `packages/design-kit/calendar-tideline.css:364` | `.cal-card__pill.is-active` |  |  |  |  |  | #fff | var(--navy) | var(--navy) |
| kit | `packages/design-kit/calendar-tideline.css:365` | `.cal-card__pill[data-status="done"].is-active` |  |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage-ink) |
| kit | `packages/design-kit/calendar-tideline.css:389` | `.cal-chip.is-ambient .cal-chip__title` |  | var(--weight-medium) |  |  |  | color-mix(in srgb,var(--ink) 78%,transparent) |  |  |
| kit | `packages/design-kit/calendar-tideline.css:458` | `.cal-chip__bm` | var(--text-2xs) |  |  |  |  | var(--navy) |  |  |
| kit | `packages/design-kit/calendar-zoom-bar.css:30` | `:is(.cal__views,.dd__nav,.tr__nav,.alm__nav) > .hub-pills[data-part="zoom-pills"]:not(.hub-pills--loose) > .hub-pills__btn` | var(--text-sm) |  | 2.75rem | 0 2px |  |  |  |  |
| kit | `packages/design-kit/calendar.css:285` | `.hub-calendar__day .event-chip` | var(--text-2xs) | var(--weight-semibold) |  | var(--space-1) var(--space-2) |  |  |  |  |
| kit | `packages/design-kit/calendar.css:302` | `.event-chip` | var(--text-sm) | var(--weight-semibold) |  | var(--space-2) var(--space-3) | var(--radius-sm) |  |  | 0 |
| kit | `packages/design-kit/calendar.css:323` | `.event-chip__meta` | var(--text-2xs) | var(--weight-medium) |  |  |  |  |  |  |
| kit | `packages/design-kit/calendar.css:329` | `.event-chip[data-tint='blue']` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| kit | `packages/design-kit/calendar.css:334` | `.event-chip[data-tint='sage']` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| kit | `packages/design-kit/calendar.css:339` | `.event-chip[data-tint='peach']` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) |  |
| kit | `packages/design-kit/calendar.css:344` | `.event-chip[data-tint='gold']` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| kit | `packages/design-kit/calendar.css:349` | `.event-chip[data-tint='lilac']` |  |  |  |  |  | var(--pastel-lilac-ink) | var(--pastel-lilac) |  |
| kit | `packages/design-kit/calendar.css:354` | `.event-chip[data-tint='sand']` |  |  |  |  |  | var(--high-sea-ink) | var(--sand) |  |
| kit | `packages/design-kit/calendar.css:376` | `.event-chip-more` | var(--text-2xs) | var(--weight-bold) |  |  |  | var(--muted) | transparent | 0 |
| kit | `packages/design-kit/calendar.css:853` | `.event-chip--timed` |  |  |  | 2px var(--space-2) 2px 0.65rem |  |  |  |  |
| kit | `packages/design-kit/calendar.css:984` | `.hub-calendar__day .event-chip` |  |  |  | 0.15rem 0.35rem |  |  |  |  |
| kit | `packages/design-kit/cards.css:106` | `.event-chip` |  |  |  | var(--space-2) var(--space-3) | var(--radius-sm) | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| kit | `packages/design-kit/cards.css:117` | `.event-chip__title` | var(--text-sm) | var(--weight-semibold) |  |  |  |  |  |  |
| kit | `packages/design-kit/cards.css:122` | `.event-chip__meta` | var(--text-xs) |  |  |  |  |  |  |  |
| kit | `packages/design-kit/cards.css:127` | `.event-chip[data-tint="blue"]` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| kit | `packages/design-kit/cards.css:128` | `.event-chip[data-tint="sage"]` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| kit | `packages/design-kit/cards.css:129` | `.event-chip[data-tint="peach"]` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) |  |
| kit | `packages/design-kit/cards.css:130` | `.event-chip[data-tint="gold"]` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| kit | `packages/design-kit/cards.css:131` | `.event-chip[data-tint="lilac"]` |  |  |  |  |  | var(--pastel-lilac-ink) | var(--pastel-lilac) |  |
| kit | `packages/design-kit/cards.css:133` | `.status-badge` | var(--text-xs) | var(--weight-semibold) |  | var(--space-px) var(--space-2) | var(--radius-full) | var(--muted) | color-mix(in srgb, var(--muted) 18%, var(--paper)) |  |
| kit | `packages/design-kit/cards.css:145` | `.status-badge--published, .status-badge--success, .status-badge--done` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| kit | `packages/design-kit/cards.css:152` | `.status-badge--draft, .status-badge--open` |  |  |  |  |  | var(--muted) | color-mix(in srgb, var(--muted) 18%, var(--paper)) |  |
| kit | `packages/design-kit/cards.css:158` | `.status-badge--review, .status-badge--in_progress, .status-badge--warn` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| kit | `packages/design-kit/cards.css:165` | `.status-badge--archived, .status-badge--deferred` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) |  |
| kit | `packages/design-kit/cards.css:171` | `.status-badge--blocked, .status-badge--danger, .status-badge--urgent` |  |  |  |  |  | var(--danger) | var(--danger-surface) |  |
| kit | `packages/design-kit/confirm-card.css:133` | `.confirm-card :is(.confirm-card__pills, .hub-chips)` |  |  |  | 0 |  |  |  |  |
| kit | `packages/design-kit/confirm-card.css:142` | `.confirm-card :is(.confirm-card__pill, .hub-chips .chip)` | 0.78125rem | 500 |  | 0.1875rem 0.5625rem | 999px | var(--ink, #13233a) | var(--cc-tint) | 0 |
| kit | `packages/design-kit/confirm-card.css:160` | `.confirm-card .confirm-card__pill-label` |  | 500 |  |  |  | var(--muted, #6b7788) |  |  |
| kit | `packages/design-kit/entity-links.css:162` | `.entity-chips__list` |  |  |  | 0 |  |  |  |  |
| kit | `packages/design-kit/entity-links.css:170` | `.entity-chip` |  |  |  | var(--space-1) var(--space-2) | var(--radius-sm) |  | var(--surface) | 1px solid var(--line) |
| kit | `packages/design-kit/entity-links.css:186` | `.entity-chip--tag` |  |  |  | 0.35rem 0.45rem 0.35rem 0.7rem | var(--radius-full) |  | var(--wash) |  |
| kit | `packages/design-kit/entity-links.css:198` | `.entity-chip__label--link` |  |  |  |  |  | inherit |  |  |
| kit | `packages/design-kit/entity-links.css:219` | `.entity-chip__meta` | var(--text-sm) |  |  |  |  | var(--muted) |  |  |
| kit | `packages/design-kit/entity-links.css:225` | `.entity-chip--tag .entity-chip__meta` | var(--text-xs) |  |  | 0.1rem 0.4rem | var(--radius-full) |  | var(--surface) |  |
| kit | `packages/design-kit/entity-links.css:232` | `.entity-chip__action` |  |  |  | 0 var(--space-1) |  | var(--muted) | transparent | 0 |
| kit | `packages/design-kit/entity-links.css:241` | `.entity-chip__action--remove` | 1rem |  |  | 0 | var(--radius-full) |  |  |  |
| kit | `packages/design-kit/entity-links.css:251` | `.entity-chip__action:hover, .entity-chip__action:focus-visible` |  |  |  |  |  | var(--ink) |  |  |
| kit | `packages/design-kit/entity-links.css:256` | `.entity-chip__action--remove:hover, .entity-chip__action--remove:focus-visible` |  |  |  |  |  |  | var(--surface) |  |
| kit | `packages/design-kit/filters.css:51` | `.hub-filter` | var(--text-sm) |  | 2.2rem | 0.35rem 0.6rem | var(--radius-sm) | var(--ink) | var(--paper) | 1px solid var(--line) |
| kit | `packages/design-kit/filters.css:68` | `.hub-filter:hover, .hub-filter[aria-expanded="true"]` |  |  |  |  |  |  | var(--cotton) |  |
| kit | `packages/design-kit/filters.css:73` | `.hub-filter__key` |  | var(--weight-regular) |  |  |  | var(--muted) |  |  |
| kit | `packages/design-kit/filters.css:87` | `.hub-filter.is-set` |  | var(--weight-medium) |  |  |  | var(--pastel-blue-ink) | color-mix(in srgb, var(--pastel-blue) 55%, #fff) | color-mix(in srgb, var(--wave) 45%, var(--line)) |
| kit | `packages/design-kit/filters.css:94` | `.hub-filter.is-set .hub-filter__key` |  |  |  |  |  | color-mix(in srgb, var(--pastel-blue-ink) 70%, transparent) |  |  |
| kit | `packages/design-kit/filters.css:100` | `.hub-pills` |  |  |  | var(--space-px) | var(--radius-xs) |  | color-mix(in srgb, var(--shore) 70%, var(--warm-white)) |  |
| kit | `packages/design-kit/filters.css:112` | `.hub-pills__thumb` |  |  |  |  | calc(var(--radius-xs) - 1px) |  | var(--paper) |  |
| kit | `packages/design-kit/filters.css:138` | `.hub-pills__btn` | var(--text-sm) |  | 2.2rem | 0.35rem 0.75rem | var(--radius-full) | var(--ink) | var(--glass) | 1px solid var(--line) |
| kit | `packages/design-kit/filters.css:150` | `.hub-pills:not(.hub-pills--loose) > .hub-pills__btn` |  | var(--weight-medium) |  |  | var(--radius-xs) | var(--muted) | transparent | 0 |
| kit | `packages/design-kit/filters.css:166` | `.hub-pills__btn.is-active, .hub-pills__btn.is-selected, .hub-pills__btn[aria-selected="true"], .hub-pills__btn[aria-checked="true"], .hub-pills__btn[aria-pressed="true"]` |  | var(--weight-semibold) |  |  |  | var(--pastel-blue-ink) | color-mix(in srgb, var(--pastel-blue) 55%, #fff) | color-mix(in srgb, var(--wave) 45%, transparent) |
| kit | `packages/design-kit/filters.css:177` | `.hub-pills:not(.hub-pills--loose) > .hub-pills__btn.is-active, .hub-pills:not(.hub-pills--loose) > .hub-pills__btn.is-selected, .hub-pills:not(.hub-pills--loose) > .hub-pills__btn[aria-selected="true"], .hub-pills:not(.h` |  |  |  |  |  | var(--ink) | transparent | transparent |
| kit | `packages/design-kit/filters.css:188` | `.hub-pills--loose` |  |  |  | 0 |  |  | transparent |  |
| kit | `packages/design-kit/filters.css:207` | `.hub-chip` | var(--text-xs) |  |  | 0.2rem 0.55rem | var(--radius-full) | var(--pastel-lilac-ink) | var(--pastel-lilac) | 0 |
| kit | `packages/design-kit/filters.css:223` | `.hub-chip.is-active` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| kit | `packages/design-kit/hub-chat-viewport.css:236` | `.page-header.is-chat-rail .date-chip, .page-header.is-chat-rail .system-chip` |  |  | 2rem |  |  |  |  |  |
| kit | `packages/design-kit/hub-chat-viewport.css:326` | `.chat-view__toolbar .date-chip, .chat-view__toolbar .system-chip` |  |  | 2rem |  |  |  |  |  |
| kit | `packages/design-kit/hub-compose.css:110` | `.hub-compose__chip` | var(--text-sm) |  |  | 0 var(--space-3) |  | var(--muted) | var(--paper) |  |
| kit | `packages/design-kit/hub-compose.css:135` | `.hub-compose__chip svg` |  |  |  |  |  | var(--shallow) |  |  |
| kit | `packages/design-kit/hub-compose.css:141` | `.hub-compose__chip input` |  |  |  | 0 |  |  |  | 0 |
| kit | `packages/design-kit/hub-interactions.css:184` | `.chat-attach-chip` | var(--text-sm) |  |  | 0.15rem 0.6rem | var(--radius-full) | var(--pastel-blue-ink) | var(--pastel-blue) | 1px solid color-mix(in srgb, var(--ink) 18%, transparent) |
| kit | `packages/design-kit/hub-interactions.css:318` | `.hub-chip-edit, .hub-tag` | var(--text-sm) |  | 1.75rem | 0 var(--space-2) | var(--radius-xs) | var(--ink) | var(--cotton) | 1px solid var(--line) |
| kit | `packages/design-kit/hub-list.css:363` | `.hub-list__chip` | var(--text-sm) | var(--weight-medium) | var(--space-8) | 0 var(--space-3) | var(--radius-full) | var(--marine) | #fff | 1px solid color-mix(in srgb, var(--navy) 14%, transparent) |
| kit | `packages/design-kit/hub-list.css:379` | `.hub-list__chip:hover` |  |  |  |  |  |  | color-mix(in srgb, var(--wave) 6%, #fff) |  |
| knowledge | `apps/knowledge/src/protocols/style.css:17` | `.protocol-card__front .agent-protocol-pills__tip, .protocol-card__voice .agent-protocol-pills__tip, .protocol-portrait .agent-protocol-pills__tip` | var(--text-xs) |  |  | var(--space-2) var(--space-3) | var(--radius-sm) | #e9dfca | rgba(14,12,22,.94) | 1px solid rgba(228,201,138,.35) |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:792` | `.descent-kinds .hub-pills__btn` |  |  | 2.25rem | 0.25rem 0.65rem |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:802` | `.descent-kinds .hub-pills__btn::before` |  |  |  |  | 50% |  | var(--k) |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:809` | `.descent-kinds .hub-pills__btn[aria-pressed="true"]` |  |  |  |  |  | var(--ink) | color-mix(in srgb, var(--k) 12%, var(--paper)) | var(--k) |
| knowledge | `apps/knowledge/src/shelf/wireless.css:632` | `.wl-ro__seg` | var(--text-2xs) | var(--weight-bold) |  |  |  | var(--seg) |  |  |
| knowledge | `apps/knowledge/src/style.css:285` | `.viewbar` |  |  |  | 0 | 0 |  | transparent |  |
| knowledge | `apps/knowledge/src/style.css:297` | `.viewbar__btn` | var(--text-base) | var(--weight-semibold) |  | var(--space-2) var(--space-3) | 0 | var(--muted) | transparent | 0 |
| knowledge | `apps/knowledge/src/style.css:310` | `.viewbar__btn.is-active` |  |  |  |  |  | var(--navy) | transparent |  |
| knowledge | `apps/knowledge/src/style.css:853` | `.agent-protocol-pills__tip` | var(--text-sm) |  |  | 0.75rem | var(--radius-md) | var(--ink) | var(--paper) | 1px solid var(--line) |
| knowledge | `apps/knowledge/src/style.css:1627` | `.graph-preview .tag-pill` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| knowledge | `apps/knowledge/src/style.css:2887` | `.understand__pills` |  |  | 4rem |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:2894` | `.understand__pill` | var(--text-sm) |  |  | 0.35rem 0.75rem | 999px |  |  | 0 |
| knowledge | `apps/knowledge/src/style.css:2904` | `.understand__pill--black` |  |  |  |  |  | #f5f2eb | #1a1a18 |  |
| knowledge | `apps/knowledge/src/style.css:2905` | `.understand__pill--blue` |  |  |  |  |  | #fff | #1d4ed8 |  |
| knowledge | `apps/knowledge/src/style.css:2906` | `.understand__pill--orange` |  |  |  |  |  | #fff | #c05621 |  |
| knowledge | `apps/knowledge/src/style.css:3069` | `.tag-pill` | var(--text-sm) | var(--weight-medium) |  | 0.35rem 0.75rem | 999px | var(--navy) | var(--shallow) | 0 |
| knowledge | `apps/knowledge/src/style.css:3081` | `.tag-pill.is-selected` |  |  |  |  |  | var(--on-dark) | var(--navy) |  |
| knowledge | `apps/knowledge/src/style.css:3228` | `.origin-pill__kind` | var(--text-2xs) | var(--weight-semibold) |  |  |  | var(--muted) |  |  |
| knowledge | `apps/knowledge/src/style.css:3236` | `.origin-pill.is-selected .origin-pill__kind, .origin-pill.is-selected .origin-pill__edit` |  |  |  |  |  | var(--on-dark) |  |  |
| knowledge | `apps/knowledge/src/style.css:3242` | `.origin-pill__edit, .origin-pill__label` |  |  |  |  |  | inherit |  |  |
| knowledge | `apps/knowledge/src/style.css:3248` | `.origin-pill__edit` |  |  |  | 0 |  |  | transparent | 0 |
| knowledge | `apps/knowledge/src/style.css:3261` | `.origin-pill__remove` |  |  |  | 0 0 0 var(--space-1) |  | inherit | transparent | 0 |
| knowledge | `apps/knowledge/src/style.css:3492` | `.agent-protocol-pills__eyebrow` | var(--text-sm) | var(--weight-semibold) |  |  |  | var(--muted) |  |  |
| knowledge | `apps/knowledge/src/style.css:3567` | `.using-notes__chip` | var(--text-xs) | var(--weight-medium) |  | 0.25rem 0.65rem | var(--radius-full) | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| knowledge | `apps/knowledge/src/style.css:3711` | `.chat-overlay .agent-protocol-pills .hub-pills__btn` |  |  | 2.75rem |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4178` | `.gpa-chip__hit` |  |  | 2.5rem | var(--space-1) var(--space-3) | var(--radius-full) | var(--on-dark) | var(--navy) | 0 |
| knowledge | `apps/knowledge/src/style.css:4192` | `.gpa-chip__eyebrow, .gpa-chip__scale` | var(--text-2xs) |  |  |  |  | var(--on-dark-muted) |  |  |
| knowledge | `apps/knowledge/src/style.css:4200` | `.gpa-chip__value` | var(--text-lg) | var(--weight-semibold) |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4205` | `.gpa-chip__panel` |  |  |  | var(--space-4) | var(--radius-md) |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4220` | `.gpa-chip__lead, .gpa-chip__meta` | var(--text-sm) |  |  |  |  | var(--muted) |  |  |
| knowledge | `apps/knowledge/src/style.css:4227` | `.gpa-chip__toggle` | var(--text-sm) |  |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4234` | `.gpa-chip__degrees` |  |  |  | 0 |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4242` | `.gpa-chip__degrees li` | var(--text-sm) |  |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:6137` | `.neural-dock__row button.is-active, .neural-dock__segments button.is-active` |  |  |  |  |  | #fbf8f2 | #13233a | #13233a |
| knowledge | `apps/knowledge/src/style.css:6328` | `.graph-wrap.is-neural .neural-dock__row button.is-active, .graph-wrap.is-neural .neural-dock__segments button.is-active` |  |  |  |  |  | #03050a | #f4efe6 | #f4efe6 |
| life | `apps/life/css/aesthetics.css:45` | `.aes-chips` |  |  |  | 0 |  |  | none |  |
| life | `apps/life/css/app.css:251` | `.date-chip, .system-chip` | var(--text-xs) | 600 | 44px | 0.62rem 0.85rem | 999px | var(--muted) | rgba(255,255,255,0.62) | 1px solid var(--line) |
| life | `apps/life/css/app.css:252` | `.system-chip` |  |  |  |  |  | #8d4c12 | #fff4e8 | rgba(246,134,32,0.22) |
| life | `apps/life/css/app.css:373` | `.now-chip` |  |  |  | 0.25rem 0.75rem | var(--radius-full) | var(--on-dark) | transparent | 1px solid var(--on-dark-line) |
| life | `apps/life/css/app.css:390` | `.now-chip[aria-pressed="true"]` |  |  |  |  |  | var(--depth) | rgba(255, 255, 255, 0.92) | transparent |
| life | `apps/life/css/app.css:997` | `.date-chip, .system-chip` | var(--text-2xs) |  | 2.75rem | 0.38rem 0.65rem |  |  |  |  |
| life | `apps/life/css/app.css:1027` | `.sign-in-card, .metric-card, .week-card, .home-paths-card, .warning-panel, .unavailable-panel, .date-chip, .system-chip, .hub-mobile-nav` |  |  |  |  |  |  | #fff |  |
| life | `apps/life/css/app.css:1609` | `.trend-badge` | var(--text-xs) | var(--weight-bold) |  | 0.3rem 0.6rem | 999px | var(--muted) | rgba(20,43,81,0.06) |  |
| life | `apps/life/css/app.css:1610` | `.trend-badge[data-colour="green"]` |  |  |  |  |  | #1f7a52 | rgba(31,122,82,0.1) |  |
| life | `apps/life/css/app.css:1611` | `.trend-badge[data-colour="red"]` |  |  |  |  |  | #8d351f | rgba(141,53,31,0.1) |  |
| life | `apps/life/css/app.css:2639` | `.home-sprint-card__chip` | var(--text-2xs) | 700 | 1.75rem | 0.15rem 0.55rem | 999px | var(--muted) | rgba(255, 255, 255, 0.72) | 1px solid var(--line) |
| life | `apps/life/css/app.css:2652` | `.home-sprint-card__chip[data-status="on_track"]` |  |  |  |  |  | #32715b | rgba(101, 167, 136, 0.1) | rgba(101, 167, 136, 0.22) |
| life | `apps/life/css/app.css:2657` | `.home-sprint-card__chip[data-status="stalled"]` |  |  |  |  |  | #8d4c12 | #fff4e8 | rgba(246, 134, 32, 0.22) |
| life | `apps/life/css/app.css:2662` | `.home-sprint-card__chip[data-status="unavailable"], .home-sprint-card__chip[data-status="no_evidence"]` |  |  |  |  |  | var(--muted) |  |  |
| life | `apps/life/css/app.css:2847` | `.fitness-tag, .fitness-focus-pill` | var(--text-xs) | 700 |  | 0.3rem 0.65rem | 0.65rem | var(--marine) | rgba(46, 123, 214, 0.1) |  |
| life | `apps/life/css/app.css:2860` | `.fitness-focus-pill span` |  | 600 |  |  |  | var(--muted) |  |  |
| life | `apps/life/css/app.css:3032` | `.fitness-logger__pain-chip` | var(--text-sm) |  | 44px | var(--space-1) var(--space-3) | var(--radius-full) | var(--marine) | var(--warm-white) | 1px solid var(--line) |
| life | `apps/life/css/app.css:3217` | `.gym-chip` | var(--text-sm) | 650 | 44px | 0.4rem 0.9rem | 999px | var(--on-dark) | transparent | 1px solid var(--on-dark-line) |
| life | `apps/life/css/app.css:3229` | `.gym-chip:hover` |  |  |  |  |  |  | var(--on-dark-hover) |  |
| life | `apps/life/css/app.css:3230` | `.gym-chip.is-active, .gym-chip--strong` |  |  |  |  |  | var(--depth) | var(--on-dark) | var(--on-dark) |
| life | `apps/life/css/app.css:3237` | `.gym-chip--failure.is-active` |  |  |  |  |  | var(--depth) | var(--high-sea) | var(--high-sea) |
| life | `apps/life/css/app.css:3420` | `.gym-pills` |  |  |  | 0 |  |  | transparent |  |
| life | `apps/life/css/app.css:3431` | `.gym .gym-pills .hub-pills__btn` | var(--text-sm) |  | 44px | 0.35rem 0.8rem | 999px | var(--on-dark-muted) | transparent | 1px solid var(--on-dark-line) |
| life | `apps/life/css/app.css:3441` | `.gym .gym-pills .hub-pills__btn.is-active` |  |  |  |  |  | var(--depth) | var(--on-dark) | var(--on-dark) |
| life | `apps/life/css/app.css:3586` | `.gym-sheet .gym-chip` |  |  |  |  |  | var(--depth) |  | var(--line) |
| life | `apps/life/css/app.css:3629` | `.gym-sheet .gym-pills .hub-pills__btn` | var(--text-sm) |  | 40px | 0.3rem 0.75rem | 999px | var(--muted) | var(--warm-white) | 1px solid var(--line) |
| life | `apps/life/css/app.css:3639` | `.gym-sheet .gym-pills .hub-pills__btn.is-active` |  |  |  |  |  | white | var(--depth) | var(--depth) |
| life | `apps/life/css/app.css:3640` | `.gym-pills--small .hub-pills__btn` | var(--text-xs) |  |  |  |  |  |  |  |
| life | `apps/life/css/app.css:3806` | `.gym-chip--twinge.is-active` |  |  |  |  |  | white | var(--danger) | var(--danger-line) |
| life | `apps/life/css/app.css:3948` | `.gym-card__chip` | var(--text-xs) | 700 |  | 0.2rem 0.6rem | 999px |  | color-mix(in srgb, var(--depth) 45%, transparent) | 1px solid var(--on-dark-line) |
| life | `apps/life/css/app.css:3957` | `.gym-card__chip--hot` |  |  |  |  |  | var(--depth) | var(--high-sea) | var(--high-sea) |
| life | `apps/life/css/app.css:4198` | `.skincare-card__now-chip` | var(--text-2xs) | 700 |  | 0.15rem 0.55rem | 999px | #1a1424 | #B99EE0 |  |
| life | `apps/life/css/app.css:4253` | `.skincare-product-pill__hint` | var(--text-xs) |  |  |  |  | var(--muted) |  |  |
| life | `apps/life/css/app.css:4260` | `.skincare-chip` | var(--text-xs) |  |  | 0.35rem 0.7rem | 999px |  | var(--warm-white) | 1px solid var(--line) |
| life | `apps/life/css/app.css:4270` | `.skincare-chip[data-active="true"]` |  |  |  |  |  | var(--depth) | rgba(185, 158, 224, 0.25) | #B99EE0 |
| life | `apps/life/css/app.css:4275` | `.skincare-product-pill__menu` |  |  |  | 0 0.45rem | 999px | var(--muted) | var(--warm-white) | 1px solid var(--line) |
| life | `apps/life/css/app.css:4285` | `.skincare-product-pill__menu-panel` |  |  |  | 0.35rem | 0.75rem |  | var(--warm-white) | 1px solid var(--line) |
| life | `apps/life/css/app.css:4298` | `.skincare-product-pill__menu-action` | var(--text-xs) |  |  | 0.45rem 0.65rem | 0.55rem | var(--ink) | transparent | 0 |
| life | `apps/life/css/app.css:4309` | `.skincare-product-pill__menu-action:hover, .skincare-product-pill__menu-action:focus-visible` |  |  |  |  |  |  | rgba(185, 158, 224, 0.18) |  |
| life | `apps/life/css/app.css:4893` | `.body-tape-chip` | var(--text-2xs) | 700 |  | 0.08rem 0.35rem | 0.35rem | var(--muted) | rgba(28, 42, 34, 0.06) |  |
| life | `apps/life/css/app.css:4909` | `.body-tape-chip[data-colour="green"]` |  |  |  |  |  | #2a7a4b | rgba(42, 122, 75, 0.12) |  |
| life | `apps/life/css/app.css:4913` | `.body-tape-chip[data-colour="red"]` |  |  |  |  |  | #b3261e | rgba(179, 38, 30, 0.1) |  |
| life | `apps/life/css/app.css:4917` | `.body-tape-chip[data-colour="neutral"]` |  |  |  |  |  | var(--muted) | rgba(28, 42, 34, 0.06) |  |
| life | `apps/life/css/app.css:4921` | `.body-tape-chip[data-colour="low"]` |  |  |  |  |  | var(--high-sea) | rgba(246, 134, 32, 0.14) |  |
| life | `apps/life/css/app.css:5076` | `.bloods-bar__segment[data-tone="in-range"]` |  |  |  |  |  |  | var(--success) |  |
| life | `apps/life/css/app.css:5077` | `.bloods-bar__segment[data-tone="high"]` |  |  |  |  |  |  | var(--danger) |  |
| life | `apps/life/css/app.css:5078` | `.bloods-bar__segment[data-tone="low"]` |  |  |  |  |  |  | var(--high-sea) |  |
| life | `apps/life/css/app.css:6070` | `.agent-protocol-pills__tip` | var(--text-sm) | var(--weight-regular) |  | var(--space-3) | var(--radius-md) | var(--ink) | var(--paper) | 1px solid var(--line) |
| life | `apps/life/css/app.css:6409` | `.cn-chip` | var(--text-xs) | var(--weight-semibold) |  | var(--space-px) var(--space-2) | var(--radius-xs) | var(--ink) | var(--glass) | 1px solid var(--line) |
| life | `apps/life/css/app.css:6420` | `.cn-chip--strong` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) | transparent |
| life | `apps/life/css/app.css:6421` | `.cn-chip--moderate` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) | transparent |
| life | `apps/life/css/app.css:6422` | `.cn-chip--weak` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) | transparent |
| life | `apps/life/css/app.css:7768` | `.mind-theme-chip` |  |  |  | 0.35rem 0.65rem | var(--radius-md) | var(--marine) | var(--glass) |  |
| life | `apps/life/css/app.css:8042` | `.pr-badge` | var(--text-2xs) | 700 |  | 0.25rem 0.55rem | 0.55rem | #b85a0c | rgba(246, 134, 32, 0.16) |  |
| life | `apps/life/css/app.css:9363` | `.medical-card__pill` | var(--text-2xs) | var(--weight-semibold) |  | 0.2rem 0.6rem | var(--radius-full) | var(--depth) | color-mix(in srgb, var(--pastel-sage) 55%, var(--paper)) |  |
| life | `apps/life/css/app.css:9542` | `.medical-form__chip` |  |  | 2.75rem |  |  |  |  |  |
| life | `apps/life/css/app.css:10251` | `.nutrition-rings__chip` | var(--text-xs) |  |  | var(--space-1) var(--space-2) | 999px | var(--muted) | var(--cotton) |  |
| life | `apps/life/css/app.css:10252` | `.nutrition-rings__chip b` |  |  |  |  |  | var(--depth) |  |  |
| life | `apps/life/css/food-journal.css:117` | `.food-filters .hub-filter` |  |  | 44px |  |  |  |  |  |
| life | `apps/life/css/garage-home.css:42` | `.gh-chip, .gh-kind, .gh-status` | var(--text-2xs) | var(--weight-semibold) |  | 2px 8px | var(--radius-full) |  |  |  |
| life | `apps/life/css/garage-home.css:43` | `.gh-chip--gold` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| life | `apps/life/css/garage-home.css:44` | `.gh-chip--sage` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| life | `apps/life/css/garage-home.css:45` | `.gh-chip--lilac` |  |  |  |  |  | var(--pastel-lilac-ink) | var(--pastel-lilac) |  |
| life | `apps/life/css/garage-home.css:46` | `.gh-chip--none, .gh-kind` |  |  |  |  |  | var(--muted) | var(--glass) | 1px solid var(--line) |
| life | `apps/life/css/property.css:25` | `.prop-pill` | var(--text-2xs) | var(--weight-semibold) |  | 2px 8px | var(--radius-full) |  |  |  |
| life | `apps/life/css/property.css:26` | `.prop-pill--est` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| life | `apps/life/css/property.css:27` | `.prop-pill--stale` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) |  |
| life | `apps/life/css/property.css:28` | `.prop-pill--ok` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| life | `apps/life/css/property.css:32` | `.prop-seg` |  |  |  | 3px | var(--radius-full) |  | var(--glass) | 1px solid var(--line) |
| life | `apps/life/css/property.css:33` | `.prop-seg button` | var(--text-sm) | var(--weight-semibold) | 2.25rem | 0 var(--space-4) | var(--radius-full) | var(--muted) | transparent | 0 |
| life | `apps/life/css/property.css:34` | `.prop-seg button[aria-pressed="true"]` |  |  |  |  |  | var(--on-dark) | var(--navy) |  |
| life | `apps/life/css/property.css:287` | `.prop-chip` | var(--text-sm) |  | 2.75rem | 0 var(--space-3) | var(--radius-full) | var(--orca) | var(--glass) | 1px solid var(--line) |
| life | `apps/life/css/property.css:288` | `.prop-chip[aria-pressed="true"]` |  | var(--weight-semibold) |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) | transparent |
| professional | `apps/professional/src/styles/comm-page.css:19` | `.chip` | var(--text-xs) | var(--weight-semibold) |  | 0 var(--space-3) | var(--radius-full) | var(--muted) | var(--cotton) |  |
| professional | `apps/professional/src/styles/comm-page.css:33` | `.chip--comm` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| professional | `apps/professional/src/styles/event-page.css:183` | `.event-page .hub-pills__btn, .event-page .talk-add .btn, .event-page .confirm-card__actions .btn` |  |  | 2.75rem |  |  |  |  |  |
| professional | `apps/professional/src/styles/event-page.css:197` | `.event-format-editor .morphing-popover__actions .btn, .event-format-editor .hub-pills__btn` |  |  | 2.75rem |  |  |  |  |  |
| professional | `apps/professional/src/styles/event-page.css:199` | `.event-page .entity-chip__action` |  |  | 2.75rem |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:717` | `.schedule-db__pill` | var(--text-sm) | 600 |  | 4px 10px | var(--radius-sm) | var(--ink) | var(--paper) | 1px solid var(--line) |
| professional | `apps/professional/src/styles/hub.css:728` | `.schedule-db__pill.is-active` |  |  |  |  |  | var(--on-dark) | var(--depth) | var(--depth) |
| professional | `apps/professional/src/styles/hub.css:1375` | `.miniworld__seg` |  |  |  | 3px | var(--radius-sm) |  | var(--shore) |  |
| professional | `apps/professional/src/styles/hub.css:1382` | `.miniworld__seg button` |  |  |  | 7px 14px | calc(var(--radius-sm) - 2px) | var(--muted) | transparent | 0 |
| professional | `apps/professional/src/styles/hub.css:1392` | `.miniworld__seg button[aria-pressed='true']` |  |  |  |  |  | var(--ink) | var(--paper) |  |
| professional | `apps/professional/src/styles/hub.css:1681` | `.miniworld__pill` | 11px | 600 |  | 3px 9px | 999px | var(--sage-ink, #3c5949) | var(--sage, #dfe9e1) |  |
| professional | `apps/professional/src/styles/hub.css:1690` | `.miniworld__pill.dormant` |  |  |  |  |  | #6b6a63 | #ecebe6 |  |
| professional | `apps/professional/src/styles/hub.css:1695` | `.miniworld__pill.bridge` |  |  |  |  |  | #294c71 | var(--pastel-blue, #dceafa) |  |
| professional | `apps/professional/src/styles/hub.css:1700` | `.miniworld__pill.new` |  |  |  |  |  | #6c581f | var(--pastel-gold, #f1e2b6) |  |
| professional | `apps/professional/src/styles/hub.css:2213` | `.pro-home__chip-tag` | var(--text-xs) | var(--weight-semibold) |  | 4px var(--space-3) | var(--radius-full) |  |  |  |
| professional | `apps/professional/src/styles/hub.css:2223` | `.pro-home__chip-tag--sage` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| professional | `apps/professional/src/styles/hub.css:2228` | `.pro-home__chip-tag--blue` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| professional | `apps/professional/src/styles/hub.css:2233` | `.pro-home__chip-tag--muted` |  |  |  |  |  | var(--muted) | var(--shore) |  |
| professional | `apps/professional/src/styles/hub.css:2603` | `.event-compose__chip` | var(--text-xs) | var(--weight-semibold) | 2.25rem | 0.4rem 0.9rem | var(--radius-full) | var(--ink) | rgba(255, 255, 255, 0.7) | 1px solid var(--line) |
| professional | `apps/professional/src/styles/hub.css:2616` | `.event-compose__chip.is-on` |  |  |  |  |  | #fff | var(--navy) | var(--navy) |
| professional | `apps/professional/src/styles/hub.css:2622` | `.event-compose__chip-add` |  |  |  |  |  | var(--muted) | transparent |  |
| professional | `apps/professional/src/styles/hub.css:2628` | `.event-form .event-compose__chip-input` | var(--text-xs) |  | 2.25rem | 0.4rem 0.9rem | var(--radius-full) |  |  |  |
| professional | `apps/professional/src/styles/hub.css:3073` | `.entity-detail__tabs.hub-pills` |  |  |  | 0 | 0 |  | transparent |  |
| professional | `apps/professional/src/styles/hub.css:3085` | `.entity-detail__tabs.hub-pills:not(.hub-pills--loose) > .hub-pills__btn` |  |  | 2.75rem | var(--space-2) 0 | 0 |  | transparent | 0 |
| professional | `apps/professional/src/styles/hub.css:3094` | `.entity-detail__tabs.hub-pills:not(.hub-pills--loose) > .hub-pills__btn[aria-selected='true'], .entity-detail__tabs.hub-pills:not(.hub-pills--loose) > .hub-pills__btn.is-active` |  |  |  |  |  | var(--navy) | transparent |  |
| professional | `apps/professional/src/styles/hub.css:3243` | `.people-page__pills` |  |  |  | 0 var(--space-4) var(--space-3) |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:3250` | `.people-page__pill` | var(--text-2xs) | 600 |  | 5px 10px | 99px | var(--pastel-blue-ink) | var(--pastel-blue) | 0 |
| professional | `apps/professional/src/styles/hub.css:3427` | `.people-crest--badge` | 6px |  |  |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:3512` | `.people-pane__chip` | var(--text-xs) | 600 |  | 5px 10px | 99px | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| professional | `apps/professional/src/styles/hub.css:3533` | `.people-pane__chip--relationship` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| professional | `apps/professional/src/styles/hub.css:3538` | `.people-pane__chip--warmth` |  |  |  |  |  | var(--ink) | transparent | 1px solid var(--line) |
| professional | `apps/professional/src/styles/hub.css:3544` | `.people-pane__chip--proposal` |  |  |  |  | var(--radius-sm) | var(--ink) | transparent | 1px dashed var(--line) |
| professional | `apps/professional/src/styles/hub.css:3551` | `.people-pane__chip-act` | var(--text-xs) |  |  | 0 2px |  | var(--ink) | transparent | 0 |
| professional | `apps/professional/src/styles/hub.css:3561` | `.people-pane__chip-act:hover, .people-pane__chip-act:focus-visible` |  |  |  |  |  | var(--high-sea-ink) |  |  |
| professional | `apps/professional/src/styles/hub.css:4063` | `.orgs-page__pill` | var(--text-sm) | 600 |  | 4px 10px | var(--radius-sm) | var(--ink) | var(--paper) | 1px solid var(--line) |
| professional | `apps/professional/src/styles/hub.css:4074` | `.orgs-page__pill.is-active` |  |  |  |  |  | var(--on-dark) | var(--depth) | var(--depth) |
| professional | `apps/professional/src/styles/hub.css:4243` | `.orgs-rchip` | var(--text-2xs) |  |  | 2px 8px | 999px | var(--ink) | var(--glass) | 1px solid var(--line) |
| professional | `apps/professional/src/styles/hub.css:4265` | `.orgs-rchip__yr` |  |  |  |  |  | var(--muted) |  |  |
| professional | `apps/professional/src/styles/hub.css:4273` | `.orgs-rchip--work` |  |  |  |  |  |  | color-mix(in srgb, var(--wave) 16%, var(--paper)) |  |
| professional | `apps/professional/src/styles/hub.css:4362` | `.orgs-how__pill` | var(--text-2xs) | 600 |  | 4px 10px | 99px | var(--muted) | var(--paper) | 1px solid var(--line) |
| professional | `apps/professional/src/styles/hub.css:4373` | `.orgs-how__pill.is-active` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) | transparent |
| professional | `apps/professional/src/styles/hub.css:4379` | `.orgs-how__seg` |  |  |  | 3px | 10px |  | var(--cotton) |  |
| professional | `apps/professional/src/styles/hub.css:4388` | `.orgs-how__seg-btn` | var(--text-2xs) | 600 |  | 5px 10px | 8px | var(--muted) | transparent | 0 |
| professional | `apps/professional/src/styles/hub.css:4399` | `.orgs-how__seg-btn.is-active` |  |  |  |  |  | var(--ink) | var(--paper) |  |
| professional | `apps/professional/src/styles/hub.css:4963` | `.career-river__chip` | var(--text-sm) |  |  | var(--space-1) var(--space-2) | var(--radius-sm) | var(--ink) | var(--glass) | 1px solid var(--line) |
| professional | `apps/professional/src/styles/hub.css:4975` | `.career-river__chip.is-selected` |  |  |  |  |  |  | color-mix(in srgb, var(--chip-color, var(--high-sea)) 12%, var(--paper)) | var(--chip-color, var(--high-sea)) |
| professional | `apps/professional/src/styles/hub.css:4984` | `.career-river__chip--fading` |  |  |  |  |  | var(--career-fading) |  |  |
| professional | `apps/professional/src/styles/hub.css:4988` | `.career-river__chip--parked` |  |  |  |  |  | var(--muted) |  |  |
| professional | `apps/professional/src/styles/hub.css:5086` | `.career-future__chip` | var(--text-sm) |  |  | 2px 8px | var(--radius-sm) | var(--high-sea) | var(--paper) | 1px solid var(--line) |
| professional | `apps/professional/src/styles/hub.css:5234` | `.career-scan__source-chip, .career-scan__apst, .career-scan__future-dot, .career-scan__witness` | var(--text-sm) |  |  | 2px 8px | var(--radius-sm) | var(--ink) | var(--glass) | 1px solid var(--line) |
| professional | `apps/professional/src/styles/hub.css:5667` | `.people-page__type-badge` | 0.6875rem | 600 |  | 0 6px | 999px | var(--depth) |  | 1px solid var(--line) |
| professional | `apps/professional/src/styles/meeting-page.css:31` | `.chip--meet` |  |  |  |  |  | var(--pastel-lilac-ink) | var(--pastel-lilac) |  |
| professional | `apps/professional/src/styles/meeting-page.css:36` | `.chip--warn` |  |  |  |  |  | var(--high-sea-ink) | var(--warning-surface) |  |
| tasks | `apps/tasks/src/personal-line/personal-line.css:159` | `.pl-chip label` |  | 600 | 40px | 0 14px | 999px | #13233a | #fff | 2px solid #dcd8cf |
| tasks | `apps/tasks/src/personal-line/personal-line.css:160` | `.pl-chip input:checked + label` |  |  |  |  |  | #fff | #13233a | #13233a |
| tasks | `apps/tasks/src/personal-line/personal-line.css:161` | `.pl-chip--sm label` | 13px |  | 36px | 0 12px |  |  |  |  |
| tasks | `apps/tasks/src/personal-line/personal-line.css:162` | `.pl-chip--sm input:checked + label` |  |  |  |  |  | var(--pl-line-ink, #fff) | var(--pl-line, #13233a) | var(--pl-line, #13233a) |
| tasks | `apps/tasks/src/styles/backlog.css:38` | `.backlog-header-actions .hub-filter` | var(--text-xs) |  | 0 | 0 |  | var(--muted) | transparent | 0 |
| tasks | `apps/tasks/src/styles/cards.css:32` | `.status-badge` | var(--text-xs) | var(--weight-semibold) |  | 0.125rem var(--space-2) | var(--radius-full) | var(--muted) | color-mix(in srgb, var(--muted) 18%, var(--paper)) |  |
| tasks | `apps/tasks/src/styles/cards.css:46` | `.status-badge--in_progress, .status-badge--active, .status-badge--revived` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| tasks | `apps/tasks/src/styles/cards.css:53` | `.status-badge--done` |  |  |  |  |  | var(--success) | var(--success-surface) |  |
| tasks | `apps/tasks/src/styles/cards.css:58` | `.status-badge--open` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| tasks | `apps/tasks/src/styles/cards.css:66` | `.status-badge--deferred, .status-badge--stalled, .status-badge--paused` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) |  |
| tasks | `apps/tasks/src/styles/cards.css:73` | `.status-badge--dead, .status-badge--archived_dead` |  |  |  |  |  | var(--danger) | var(--danger-surface) |  |
| tasks | `apps/tasks/src/styles/cards.css:79` | `.status-badge--planned` |  |  |  |  |  | var(--muted) | var(--shore) |  |
| tasks | `apps/tasks/src/styles/cards.css:84` | `.status-badge--completed` |  |  |  |  |  | var(--success) | var(--success-surface) |  |
| tasks | `apps/tasks/src/styles/cards.css:89` | `.status-badge--on_the_go` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| tasks | `apps/tasks/src/styles/cards.css:94` | `.status-badge--planning` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| tasks | `apps/tasks/src/styles/cards.css:99` | `.status-badge--not_started` |  |  |  |  |  | var(--orca) | color-mix(in srgb, var(--shallow) 22%, var(--paper)) |  |
| tasks | `apps/tasks/src/styles/cards.css:104` | `.status-badge--needs_attention` |  |  |  |  |  | var(--danger) | var(--danger-surface) |  |
| tasks | `apps/tasks/src/styles/cards.css:177` | `.hub-chip[data-area]` |  |  |  |  |  | var(--muted) | var(--shore) |  |
| tasks | `apps/tasks/src/styles/cards.css:182` | `.hub-chip[data-area='design'], .hub-chip[data-area='health']` |  |  |  |  |  | var(--pastel-lilac-ink) | var(--pastel-lilac) |  |
| tasks | `apps/tasks/src/styles/cards.css:188` | `.hub-chip[data-area='website'], .hub-chip[data-area='teaching']` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| tasks | `apps/tasks/src/styles/cards.css:194` | `.hub-chip[data-area='copy']` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) |  |
| tasks | `apps/tasks/src/styles/cards.css:199` | `.hub-chip[data-area='wedding']` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| tasks | `apps/tasks/src/styles/cards.css:204` | `.hub-chip[data-area='dev'], .hub-chip[data-area='life']` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| tasks | `apps/tasks/src/styles/cards.css:210` | `.hub-chip[data-area='other']` |  |  |  |  |  | var(--muted) | var(--shore) |  |
| tasks | `apps/tasks/src/styles/cards.css:215` | `.hub-chip--attach` |  |  |  |  |  | var(--ink) | var(--shore) |  |
| tasks | `apps/tasks/src/styles/cards.css:229` | `.hub-chip__kind` | var(--text-2xs) | var(--weight-semibold) |  |  |  | var(--muted) |  |  |
| tasks | `apps/tasks/src/styles/cards.css:243` | `.date-badge` | var(--text-2xs) | var(--weight-semibold) |  | 0.2rem 0.55rem | var(--radius-full) | var(--muted) | var(--shore) |  |
| tasks | `apps/tasks/src/styles/cards.css:549` | `.due-chip` | var(--text-2xs) | var(--weight-semibold) |  | 0.15rem 0.5rem | var(--radius-full) |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:558` | `.due-chip--today` |  |  |  |  |  | var(--danger) | var(--danger-surface) |  |
| tasks | `apps/tasks/src/styles/cards.css:563` | `.due-chip--soon` |  |  |  |  |  | var(--warning) | var(--warning-surface) |  |
| tasks | `apps/tasks/src/styles/cards.css:568` | `.due-chip--later` |  |  |  |  |  | var(--muted) | var(--shore) |  |
| tasks | `apps/tasks/src/styles/cards.css:689` | `button.status-badge, button.priority-chip, button.hub-chip` |  |  |  |  |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/cards.css:697` | `.priority-chip` | var(--text-xs) | var(--weight-medium) |  | 0.2rem 0.55rem | var(--radius-full) |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:709` | `.priority-chip[data-priority='urgent']` |  |  |  |  |  | var(--danger) | var(--danger-surface) |  |
| tasks | `apps/tasks/src/styles/cards.css:714` | `.priority-chip[data-priority='high']` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) |  |
| tasks | `apps/tasks/src/styles/cards.css:719` | `.priority-chip[data-priority='medium']` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| tasks | `apps/tasks/src/styles/cards.css:724` | `.priority-chip[data-priority='low']` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| tasks | `apps/tasks/src/styles/cards.css:774` | `.chip-float` | var(--text-xs) | var(--weight-semibold) |  | 0.5rem 0.85rem | var(--radius-full) | var(--warning) | linear-gradient( 145deg, color-mix(in srgb, var(--hub-glass-fill) 100%, white), color-mix(in srgb, var(--hub-glass-fill) 75%, transparent) ) | 1px solid rgba(255, 255, 255, 0.92) |
| tasks | `apps/tasks/src/styles/cards.css:799` | `.chip-float__dot` |  |  |  |  | 50% |  | var(--high-sea) |  |
| tasks | `apps/tasks/src/styles/cards.css:807` | `.chip-float strong` |  | var(--weight-bold) |  |  |  | var(--ink) |  |  |
| tasks | `apps/tasks/src/styles/cards.css:1084` | `.hub-canvas .hub-row .hub-chip--attach, .hub-canvas .hub-card:not(.page-card) .hub-chip--attach` | var(--text-2xs) | var(--weight-medium) |  | 0 |  | var(--muted) | transparent |  |
| tasks | `apps/tasks/src/styles/cards.css:1100` | `.hub-canvas .hub-row .hub-chip--attach .hub-chip__kind, .hub-canvas .hub-card:not(.page-card) .hub-chip--attach .hub-chip__kind` | inherit | var(--weight-semibold) |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:1107` | `.hub-canvas .hub-row .hub-chip--attach .hub-chip__name, .hub-canvas .hub-card:not(.page-card) .hub-chip--attach .hub-chip__name` |  | var(--weight-medium) |  |  |  | var(--orca) |  |  |
| tasks | `apps/tasks/src/styles/cards.css:1168` | `.hub-canvas .hub-chip, .hub-canvas .priority-chip, .hub-canvas .due-chip, .hub-canvas .status-badge, .hub-canvas .date-badge, .hub-canvas button.hub-chip, .hub-canvas button.priority-chip, .hub-canvas button.status-badge` | var(--text-2xs) | var(--weight-medium) | 0 | 0.05rem 0.3rem |  |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:1262` | `.block-editor input, .block-editor textarea, .block-editor select, .block-editor__rich, .page-editor .hub-search, .page-editor .hub-filter, .page-card__title-input` | 1rem |  |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/daily-dial.css:158` | `.daily-dial__chip` | var(--text-2xs) |  |  | var(--space-1) var(--space-2) | var(--radius-xs) |  | var(--warm-white) | 1px solid var(--line) |
| tasks | `apps/tasks/src/styles/daily-dial.css:184` | `.daily-dial__chip-dot` |  |  |  |  | var(--radius-full) |  |  |  |
| tasks | `apps/tasks/src/styles/daily-dial.css:195` | `.daily-dial__chip-time` |  |  |  |  |  | var(--muted) |  |  |
| tasks | `apps/tasks/src/styles/daily-dial.css:200` | `.daily-dial__chip-title` |  | var(--weight-medium) |  |  |  | var(--ink) |  |  |
| tasks | `apps/tasks/src/styles/daily-dial.css:325` | `.daily-dial__chip` | var(--text-xs) |  |  | var(--space-1) var(--space-2) |  |  |  |  |
| tasks | `apps/tasks/src/styles/gantt.css:3` | `.chip--critical` |  |  |  |  |  | var(--high-sea-ink) | color-mix(in srgb, var(--high-sea) 20%, transparent) |  |
| tasks | `apps/tasks/src/styles/gantt.css:8` | `.chip--priority-high, .chip--priority-urgent` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) |  |
| tasks | `apps/tasks/src/styles/gantt.css:14` | `.chip--priority-medium` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| tasks | `apps/tasks/src/styles/gantt.css:19` | `.chip--priority-low` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| tasks | `apps/tasks/src/styles/gantt.css:24` | `.chip--domain` |  |  |  |  |  | var(--orca) | var(--shore) |  |
| tasks | `apps/tasks/src/styles/gantt.css:45` | `.gantt-toolbar .hub-pills__btn--critical.is-active, .gantt-toolbar .hub-pills__btn--critical[aria-pressed="true"]` |  |  |  |  |  | var(--high-sea-ink) | color-mix(in srgb, var(--high-sea) 14%, transparent) | color-mix(in srgb, var(--high-sea) 30%, transparent) |
| tasks | `apps/tasks/src/styles/goals.css:27` | `.runway__chip--ongoing` |  |  |  |  |  | var(--muted) |  |  |
| tasks | `apps/tasks/src/styles/goals.css:97` | `.runway__chip` | var(--text-2xs) | var(--weight-bold) |  | 0 var(--space-1) | var(--radius-xs) | var(--muted) |  | 1px solid var(--line) |
| tasks | `apps/tasks/src/styles/goals.css:120` | `.goal-page__dream-chip` | var(--text-sm) | var(--weight-semibold) |  | 0 var(--space-2) | var(--radius-xs) | var(--navy) | var(--pastel-gold, #f5e6c8) | 1px solid var(--line) |
| tasks | `apps/tasks/src/styles/goals.css:243` | `.hammond-chip` | var(--text-sm) |  |  | var(--space-2) var(--space-2) var(--space-2) var(--space-3) | var(--radius-sm) |  | var(--on-dark-hover) | 1px solid var(--on-dark-line) |
| tasks | `apps/tasks/src/styles/goals.css:244` | `.hammond-chip button` | var(--text-xs) | var(--weight-semibold) |  | var(--space-1) var(--space-3) | var(--radius-sm) |  |  | none |
| tasks | `apps/tasks/src/styles/goals.css:245` | `.hammond-chip .is-confirm` |  |  |  |  |  | var(--depth) | var(--on-dark) |  |
| tasks | `apps/tasks/src/styles/goals.css:246` | `.hammond-chip .is-discard` |  |  |  |  |  | var(--on-dark-muted) | transparent |  |
| tasks | `apps/tasks/src/styles/goals.css:268` | `.goals-plan-card__choices .btn, .goals-checkin__nav .btn, .goals-checkin .hub-chip, .goal-page .hub-chip, .goals-plan-card .hub-chip, .runway-phone__card` |  |  | 2.75rem |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/graph.css:143` | `.graph-service-pill` |  |  |  | 0 14px 0 10px | var(--radius-full) | var(--success) | var(--success-surface) | 1px solid transparent |
| tasks | `apps/tasks/src/styles/graph.css:158` | `.graph-service-pill i` |  |  |  |  | 50% |  | currentColor |  |
| tasks | `apps/tasks/src/styles/graph.css:166` | `.graph-service-pill b` |  | 600 |  |  |  | var(--ink) |  |  |
| tasks | `apps/tasks/src/styles/graph.css:171` | `.graph-service-pill--good_service` |  |  |  |  |  | var(--success) | var(--success-surface) |  |
| tasks | `apps/tasks/src/styles/graph.css:176` | `.graph-service-pill--minor_delays` |  |  |  |  |  | var(--high-sea-ink) | var(--warning-surface) |  |
| tasks | `apps/tasks/src/styles/graph.css:181` | `.graph-service-pill--major_delays` |  |  |  |  |  | var(--danger) | var(--danger-surface) |  |
| tasks | `apps/tasks/src/styles/graph.css:186` | `.graph-service-pill--suspended` |  |  |  |  |  | var(--danger) | var(--danger-surface) | color-mix(in srgb, var(--danger) 35%, transparent) |
| tasks | `apps/tasks/src/styles/graph.css:193` | `.graph-service-pill--arrived` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| tasks | `apps/tasks/src/styles/graph.css:252` | `.graph-line__chip` |  |  |  |  | 3px |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:118` | `.lesson-editor__linked-badge` | var(--text-2xs) | var(--weight-semibold) |  | var(--space-px) var(--space-2) | var(--radius-sm) | var(--marine) | color-mix(in srgb, var(--wave) 14%, var(--glass)) | 1px solid color-mix(in srgb, var(--wave) 30%, transparent) |
| tasks | `apps/tasks/src/styles/lesson-engine.css:366` | `.agent-protocol-pills__tip` | var(--text-sm) |  |  | 0.75rem | var(--radius-md) | var(--ink) | var(--paper) | 1px solid var(--line) |
| tasks | `apps/tasks/src/styles/views.css:267` | `.chip` | var(--text-2xs) | var(--weight-medium) |  | 0.0625rem var(--space-1) | var(--radius-xs) | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| tasks | `apps/tasks/src/styles/views.css:278` | `.chip--muted` |  |  |  |  |  | var(--muted) | rgba(23, 55, 94, 0.06) |  |
| tasks | `apps/tasks/src/styles/views.css:283` | `.chip--urgency-danger` |  |  |  |  |  | var(--danger) | var(--danger-surface) |  |
| tasks | `apps/tasks/src/styles/views.css:288` | `.chip--urgency-warning` |  |  |  |  |  | var(--warning) | var(--warning-surface) |  |
| tasks | `apps/tasks/src/styles/views.css:293` | `.chip--urgency-success` |  |  |  |  |  | var(--success) | var(--success-surface) |  |
| tasks | `apps/tasks/src/styles/views.css:298` | `.chip--urgency-calm` |  |  |  |  |  | var(--muted) | var(--shore) |  |
| tasks | `apps/tasks/src/styles/views.css:303` | `.chip--source-task` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| tasks | `apps/tasks/src/styles/views.css:308` | `.chip--source-project` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| tasks | `apps/tasks/src/styles/views.css:313` | `.chip--source-excursion` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| tasks | `apps/tasks/src/styles/views.css:391` | `.hub-filters__toggle.is-set` |  |  |  |  |  | var(--pastel-blue-ink) | color-mix(in srgb, var(--pastel-blue) 55%, #fff) | color-mix(in srgb, var(--wave) 45%, var(--line)) |
| tasks | `apps/tasks/src/styles/views.css:970` | `.someday-chip` | var(--text-2xs) | var(--weight-semibold) |  | var(--space-1) var(--space-2) | var(--radius-xs) | var(--orca) | var(--shore) |  |
| tasks | `apps/tasks/src/styles/views.css:984` | `.someday-chip--horizon` |  |  |  |  |  | var(--pastel-lilac-ink) | var(--pastel-lilac) |  |
| tasks | `apps/tasks/src/styles/views.css:989` | `.someday-chip--area` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| tasks | `apps/tasks/src/styles/views.css:1415` | `.someday-odyssey__chip` | var(--text-sm) |  |  | var(--space-1) var(--space-3) var(--space-1) var(--space-1) | var(--radius-full) | var(--ink) | var(--glass) | 1px solid var(--line) |
| tasks | `apps/tasks/src/styles/views.css:1430` | `.someday-odyssey__chip-dot` | var(--text-xs) | var(--weight-bold) |  |  | 50% | #fff |  |  |
| tasks | `apps/tasks/src/styles/views.css:1442` | `.someday-odyssey__chip--wave .someday-odyssey__chip-dot` |  |  |  |  |  |  | var(--wave) |  |
| tasks | `apps/tasks/src/styles/views.css:1443` | `.someday-odyssey__chip--success .someday-odyssey__chip-dot` |  |  |  |  |  |  | var(--success) |  |
| tasks | `apps/tasks/src/styles/views.css:1444` | `.someday-odyssey__chip--lilac .someday-odyssey__chip-dot` |  |  |  |  |  |  | var(--pastel-lilac-ink) |  |
| tasks | `apps/tasks/src/styles/views.css:1446` | `.someday-odyssey__chip--wave.is-focused` |  |  |  |  |  |  | var(--pastel-blue) | var(--wave) |
| tasks | `apps/tasks/src/styles/views.css:1447` | `.someday-odyssey__chip--success.is-focused` |  |  |  |  |  |  | var(--pastel-sage) | var(--success) |
| tasks | `apps/tasks/src/styles/views.css:1448` | `.someday-odyssey__chip--lilac.is-focused` |  |  |  |  |  |  | var(--pastel-lilac) | var(--pastel-lilac-ink) |
| tasks | `apps/tasks/src/styles/views.css:1454` | `.someday-odyssey__chip-badge` | 0.6rem | var(--weight-bold) |  | 0 0.3rem | var(--radius-full) | #fff | var(--orca) |  |
| tasks | `apps/tasks/src/styles/views.css:3115` | `.agent-protocol-pills__tip` | var(--text-sm) |  |  | 0.75rem | var(--radius-md) | var(--ink) | var(--paper) | 1px solid var(--line) |
| tasks | `apps/tasks/src/styles/views.css:4220` | `.quick-add .hub-search, .quick-add .hub-filter, .quick-add .btn` | var(--text-sm) |  | 2.25rem |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:4604` | `.pipe-segment__water-layer` |  |  |  |  | 999px |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:4957` | `.map-strands__chip` | 15px | 800 |  | 0 | 50% | var(--strand-letter, var(--paper)) | var(--strand-disc, var(--wave)) | 0 |
| tasks | `apps/tasks/src/styles/views.css:6143` | `.calendar-touched-chip` | var(--text-xs) |  |  | var(--space-2) var(--space-3) | var(--radius-full) |  | var(--warm-white) | 1px solid var(--line) |
| tasks | `apps/tasks/src/styles/views.css:6154` | `.calendar-touched-chip__name` |  | var(--weight-semibold) |  |  |  | var(--ink) |  |  |
| tasks | `apps/tasks/src/styles/views.css:6158` | `.calendar-touched-chip__age` |  |  |  |  |  | var(--muted) |  |  |
| tasks | `apps/tasks/src/styles/views.css:6204` | `.calendar-horizon-bar__segment` |  | var(--weight-semibold) |  | 0.2rem 0.6rem | var(--radius-full) | var(--ink) | var(--warm-white) | 1px solid var(--line) |
| tasks | `apps/tasks/src/styles/views.css:7621` | `.dashboard-overview__chip` | var(--text-xs) |  |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:7845` | `.dashboard-row__meta .chip` | var(--text-2xs) |  |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:8391` | `.dashboard-row__meta .chip, .dashboard-row__date, .dashboard-row__when` | var(--text-2xs) |  |  |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:8891` | `.hub-chip.tint-blue` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| tasks | `apps/tasks/src/styles/views.css:8896` | `.hub-chip.tint-sage, .status-badge.tint-sage` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| tasks | `apps/tasks/src/styles/views.css:8902` | `.hub-chip.tint-peach, .status-badge.tint-peach` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) |  |
| tasks | `apps/tasks/src/styles/views.css:8908` | `.hub-chip.tint-gold` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| tasks | `apps/tasks/src/styles/views.css:8913` | `.hub-chip.tint-lilac` |  |  |  |  |  | var(--pastel-lilac-ink) | var(--pastel-lilac) |  |
| tasks | `apps/tasks/src/styles/views.css:9266` | `.schedule-diff__chip` | 0.65rem |  |  | 0.15rem 0.25rem | 999px |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:9276` | `.schedule-diff__chip--from` |  |  |  |  |  |  | color-mix(in srgb, var(--muted) 18%, transparent) |  |
| tasks | `apps/tasks/src/styles/views.css:9281` | `.schedule-diff__chip--to` |  | 600 |  |  |  | var(--navy) | color-mix(in srgb, var(--wave) 16%, transparent) | 1.5px dashed var(--wave) |
| tasks | `apps/tasks/src/views/programs-network.css:70` | `.pn-mix__seg` |  |  |  | 0 6px |  | #fff |  |  |
| teaching | `apps/teaching/src/styles/alchemy-assistant.css:6` | `.alchemy-block-button__badge` | 10px |  |  |  | 50% | var(--cotton) | var(--alchemy-accent) |  |
| teaching | `apps/teaching/src/styles/app.css:653` | `.lesson-editor__linked-badge` | var(--text-2xs) | var(--weight-semibold) |  | var(--space-px) var(--space-2) | var(--radius-sm) | var(--marine) | color-mix(in srgb, var(--wave) 14%, var(--glass)) | 1px solid color-mix(in srgb, var(--wave) 30%, transparent) |
| teaching | `apps/teaching/src/styles/app.css:915` | `.agent-protocol-pills__tip` | var(--text-sm) |  |  | 0.75rem | var(--radius-md) | var(--ink) | var(--paper) | 1px solid var(--line) |
| teaching | `apps/teaching/src/styles/app.css:3549` | `.schedule-modal__unit-badge` | var(--text-xs) |  |  |  |  | var(--muted) |  |  |
| teaching | `apps/teaching/src/styles/app.css:3919` | `.event-chip` | var(--text-sm) | var(--weight-semibold) |  | var(--space-2) var(--space-3) | var(--radius-sm) |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:3937` | `.event-chip__meta` | var(--text-2xs) | var(--weight-medium) |  |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:3943` | `.event-chip[data-tint='blue'], .scope-timeline__item[data-tint='blue'], .scope-overview__bar[data-tint='blue']` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| teaching | `apps/teaching/src/styles/app.css:3950` | `.event-chip[data-tint='sage'], .scope-timeline__item[data-tint='sage'], .scope-overview__bar[data-tint='sage']` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| teaching | `apps/teaching/src/styles/app.css:3957` | `.event-chip[data-tint='peach'], .scope-timeline__item[data-tint='peach'], .scope-overview__bar[data-tint='peach']` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) |  |
| teaching | `apps/teaching/src/styles/app.css:3964` | `.event-chip[data-tint='gold'], .scope-timeline__item[data-tint='gold'], .scope-overview__bar[data-tint='gold']` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| teaching | `apps/teaching/src/styles/app.css:3971` | `.event-chip[data-tint='lilac'], .scope-timeline__item[data-tint='lilac'], .scope-overview__bar[data-tint='lilac']` |  |  |  |  |  | var(--pastel-lilac-ink) | var(--pastel-lilac) |  |
| teaching | `apps/teaching/src/styles/app.css:5761` | `.scope-timeline__zoom` |  |  |  | 3px | var(--radius-full) |  | color-mix(in srgb, var(--shore) 70%, #fff) |  |
| teaching | `apps/teaching/src/styles/app.css:5769` | `.scope-timeline__zoom-btn` | var(--text-xs) | var(--weight-semibold) |  | 6px 12px | var(--radius-full) | var(--muted) | transparent | 0 |
| teaching | `apps/teaching/src/styles/app.css:5781` | `.scope-timeline__zoom-btn--active, .scope-timeline__zoom-btn[aria-pressed='true']` |  |  |  |  |  | #fff | var(--navy) |  |
| teaching | `apps/teaching/src/styles/app.css:5889` | `.scope-gantt__today-badge` | 10px | var(--weight-bold) |  |  | 50% | #fff | var(--danger) |  |
| teaching | `apps/teaching/src/styles/app.css:6006` | `.scope-gantt__chip` | 12.5px | var(--weight-bold) |  | 5px 10px | 7px | var(--pastel-blue-ink) | var(--pastel-blue) | 0 |
| teaching | `apps/teaching/src/styles/app.css:6019` | `.scope-gantt__chip[data-tint='blue']` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| teaching | `apps/teaching/src/styles/app.css:6023` | `.scope-gantt__chip[data-tint='sage']` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| teaching | `apps/teaching/src/styles/app.css:6027` | `.scope-gantt__chip[data-tint='peach']` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) |  |
| teaching | `apps/teaching/src/styles/app.css:6031` | `.scope-gantt__chip[data-tint='gold']` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| teaching | `apps/teaching/src/styles/app.css:6035` | `.scope-gantt__chip[data-tint='lilac']` |  |  |  |  |  | var(--pastel-lilac-ink) | var(--pastel-lilac) |  |
| teaching | `apps/teaching/src/styles/app.css:8790` | `.lessons-lib__recent-chip, .lessons-lib__tag` | var(--text-xs) |  |  | 0.2rem 0.55rem | 999px | var(--pastel-lilac-ink) | var(--pastel-lilac) |  |
| teaching | `apps/teaching/src/styles/app.css:8822` | `.status-badge` | var(--text-xs) | var(--weight-semibold) |  | 0.1rem 0.5rem | 999px |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:8832` | `.status-badge--published` |  |  |  |  |  | var(--pastel-sage-ink) | var(--pastel-sage) |  |
| teaching | `apps/teaching/src/styles/app.css:8837` | `.status-badge--draft` |  |  |  |  |  | var(--orca) | color-mix(in srgb, var(--muted) 18%, #fff) |  |
| teaching | `apps/teaching/src/styles/app.css:8842` | `.status-badge--needs_review` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| teaching | `apps/teaching/src/styles/app.css:8847` | `.status-badge--archived` |  |  |  |  |  | var(--pastel-peach-ink) | var(--pastel-peach) |  |
| teaching | `apps/teaching/src/styles/app.css:9046` | `.outcome-chip` | var(--text-xs) | 600 | 1.75rem | 0.15rem 0.5rem | var(--radius-xs) | var(--pastel-blue-ink) | var(--pastel-blue) | 0 |
| teaching | `apps/teaching/src/styles/app.css:9061` | `.outcome-chip.is-open` |  |  |  |  |  | var(--on-dark) | var(--marine) |  |
| teaching | `apps/teaching/src/styles/app.css:9066` | `.outcome-chip--add` |  | 500 |  |  |  | var(--muted) | transparent | 1px dashed var(--line) |
| teaching | `apps/teaching/src/styles/app.css:9513` | `.block-annotation__layer-chip` | var(--text-xs) |  |  | 0.15rem 0.55rem | 999px |  | color-mix(in srgb, var(--wave) 16%, transparent) |  |
| teaching | `apps/teaching/src/styles/app.css:10231` | `.block-annotation__chip` | var(--text-sm) |  | 2.75rem | 0 var(--space-3) | 999px |  | color-mix(in srgb, var(--wave) 16%, var(--paper, #fff)) | 1px solid var(--line) |
| teaching | `apps/teaching/src/styles/app.css:10255` | `.block-annotation__chip--teacher` |  |  |  |  |  |  | color-mix(in srgb, var(--navy, #1b2a4a) 18%, var(--paper, #fff)) |  |
| teaching | `apps/teaching/src/styles/app.css:10260` | `.block-annotation__chip--sub` | var(--text-xs) |  |  |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:10264` | `.block-annotation__chip--sand` |  |  |  |  |  |  | color-mix(in srgb, var(--sand) 22%, var(--paper, #fff)) |  |
| teaching | `apps/teaching/src/styles/app.css:10267` | `.block-annotation__chip--high-sea` |  |  |  |  |  |  | color-mix(in srgb, var(--high-sea) 18%, var(--paper, #fff)) |  |
| teaching | `apps/teaching/src/styles/app.css:10270` | `.block-annotation__chip--shore` |  |  |  |  |  |  | color-mix(in srgb, var(--shore) 22%, var(--paper, #fff)) |  |
| teaching | `apps/teaching/src/styles/app.css:10273` | `.block-annotation__chip--marine` |  |  |  |  |  |  | color-mix(in srgb, var(--marine) 18%, var(--paper, #fff)) |  |
| teaching | `apps/teaching/src/styles/app.css:10276` | `.block-annotation__chip--navy` |  |  |  |  |  |  | color-mix(in srgb, var(--navy, #1b2a4a) 16%, var(--paper, #fff)) |  |
| teaching | `apps/teaching/src/styles/app.css:10279` | `.block-annotation__chip--coral` |  |  |  |  |  |  | color-mix(in srgb, var(--coral, #c96b4a) 18%, var(--paper, #fff)) |  |
| teaching | `apps/teaching/src/styles/app.css:10282` | `.block-annotation__chip--mist` |  |  |  |  |  |  | color-mix(in srgb, var(--mist, #9aa4b2) 22%, var(--paper, #fff)) |  |
| teaching | `apps/teaching/src/styles/app.css:10455` | `.block-annotation__element-badge` |  |  |  |  | 14px |  | linear-gradient(160deg, color-mix(in srgb, var(--c) 20%, #fff), #fff) | 1.5px solid var(--c) |
| teaching | `apps/teaching/src/styles/app.css:10495` | `.block-annotation__element-chip` | var(--text-xs, 0.75rem) | 600 |  | 0.25rem 0.6rem | 8px | #54576a | #fff | 1px solid var(--line, #d7d2c8) |
| teaching | `apps/teaching/src/styles/app.css:10510` | `.block-annotation__element-chip--family` |  |  |  |  |  | #fff | var(--c) | var(--c) |
| teaching | `apps/teaching/src/styles/app.css:10542` | `.block-annotation__element-chip--lang` |  |  |  |  |  | color-mix(in srgb, var(--c) 60%, #33343d) |  | color-mix(in srgb, var(--c) 40%, var(--line, #d7d2c8)) |
| teaching | `apps/teaching/src/styles/app.css:10691` | `.block-annotation__element-relchip, .block-annotation__element-spot` | var(--text-xs, 0.8125rem) | 600 | 36px | 0.3rem 0.7rem | 999px | #33343d | #fff | 1px solid var(--line, #d7d2c8) |
| teaching | `apps/teaching/src/styles/app.css:11386` | `.block-annotation__thread-chip, .block-annotation__thread-pick` | var(--text-sm) |  | 2.75rem | 0 var(--space-3) 0 var(--space-2) | var(--radius-sm, 0.35rem) |  | var(--paper, #fff) | 1px solid var(--line) |
| teaching | `apps/teaching/src/styles/app.css:11415` | `.block-annotation__thread-chip.is-focused, .block-annotation__thread-chip[aria-pressed='true']` |  |  |  |  |  |  | color-mix(in srgb, var(--thread-c) 12%, var(--paper, #fff)) | var(--thread-c) |
| teaching | `apps/teaching/src/styles/app.css:11571` | `.block-annotation__thread-chip-count` | var(--text-xs) |  |  | 0.05rem 0.45rem | 999px | var(--muted) | var(--paper, #fff) |  |
| teaching | `apps/teaching/src/styles/class-examples.css:338` | `.cx-chip` | var(--text-2xs) | var(--weight-semibold) |  | 0.15rem 0.55rem | var(--radius-full) | var(--muted) | rgba(23, 55, 94, 0.06) |  |
| teaching | `apps/teaching/src/styles/class-examples.css:353` | `.cx-chip--wave` |  |  |  |  |  | var(--pastel-blue-ink) | var(--pastel-blue) |  |
| teaching | `apps/teaching/src/styles/class-examples.css:358` | `.cx-chip--gold` |  |  |  |  |  | var(--pastel-gold-ink) | var(--pastel-gold) |  |
| teaching | `apps/teaching/src/styles/class-examples.css:363` | `.cx-chip--success` |  |  |  |  |  | var(--success) | var(--success-surface) |  |
| teaching | `apps/teaching/src/styles/class-examples.css:368` | `.cx-chip--danger` |  |  |  |  |  | var(--danger) | var(--danger-surface) |  |
| teaching | `apps/teaching/src/styles/class-examples.css:373` | `.cx-chip__pulse` |  |  |  |  | 50% |  | currentColor |  |
| teaching | `apps/teaching/src/styles/toolkit.css:347` | `.tk-chip--skill` |  |  |  |  |  | var(--navy) | #fff | 1px solid var(--line) |
| teaching | `apps/teaching/src/styles/toolkit.css:353` | `.tk-chip--tool` |  |  |  |  |  | #fff | var(--depth) | var(--depth) |
| teaching | `apps/teaching/src/styles/toolkit.css:359` | `.tk-chip--value` |  |  |  |  |  | var(--depth) | var(--high-sea) | var(--high-sea) |
| teaching | `apps/teaching/src/styles/toolkit.css:365` | `.tk-chip--community` |  |  |  |  |  | var(--navy) | var(--shore) | var(--line) |
| teaching | `apps/teaching/src/styles/toolkit.css:887` | `.tk-note__pill` | 11px | var(--weight-bold) |  | 1px 8px | 999px | var(--high-sea-ink) | #fff | 1px solid color-mix(in srgb, var(--high-sea) 45%, transparent) |
| travel | `apps/travel/src/styles/journal.css:96` | `.journal-moment__corey-badge` | var(--text-xs) | var(--weight-medium) |  |  |  | var(--ink-muted) |  |  |
| travel | `apps/travel/src/styles/travel.css:121` | `.status-chip` | .8125rem |  |  | 8px 12px | var(--radius-sm) |  | rgba(251,248,242,.94) |  |
| travel | `apps/travel/src/styles/travel.css:125` | `.chips` |  |  |  | 12px 2px 4px |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:127` | `.chip` |  |  |  | 8px 14px 9px | var(--radius-md) |  | var(--paper) | 0 |
| travel | `apps/travel/src/styles/travel.css:128` | `.chip b` | .875rem |  |  |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:129` | `.chip span` | .75rem |  |  |  |  | var(--muted) |  |  |
| travel | `apps/travel/src/styles/travel.css:130` | `.chip.is-on` |  |  |  |  |  | #fff | var(--city) |  |
| travel | `apps/travel/src/styles/travel.css:131` | `.chip.is-on span` |  |  |  |  |  | rgba(255,255,255,.85) |  |  |
| travel | `apps/travel/src/styles/travel.css:132` | `.chip .todo-dot` |  |  |  |  | 50% |  | var(--high-sea) |  |
| travel | `apps/travel/src/styles/travel.css:133` | `.chip--add` |  |  |  |  |  |  | transparent |  |
| travel | `apps/travel/src/styles/travel.css:134` | `.chip--add b` |  |  |  |  |  | var(--navy) |  |  |
| travel | `apps/travel/src/styles/travel.css:186` | `.daybtn` | .8125rem | 600 |  | 6px 12px | var(--radius-sm) | var(--city-ink) | rgba(255,255,255,.65) | 0 |
| travel | `apps/travel/src/styles/travel.css:187` | `.daybtn small` | .6875rem | 500 |  |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:188` | `.daybtn.is-on` |  |  |  |  |  | #fff | var(--city-ink) |  |
| travel | `apps/travel/src/styles/travel.css:584` | `.status-chip` | .75rem |  |  |  |  |  |  |  |
