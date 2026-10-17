# Buttons

Kit `.btn`: min-height 2.5rem, padding `--space-2 --space-4`, size `--font-size-card` (15px), weight 600, radius `--radius-sm` (14px). Phone icon button is 2.75rem. Primary is white on `--navy`.

| Hub | Where | Selector | Size | Weight | Min-height | Height | Padding | Radius | Color | Background |
|---|---|---|---|---|---|---|---|---|---|---|
| kit | `packages/design-kit/actions.css:20` | `.hub-icon-btn` |  |  |  | 2rem | 0 | var(--radius-xs) | var(--shallow) | transparent |
| kit | `packages/design-kit/actions.css:32` | `.hub-icon-btn:hover:not(:disabled), .hub-icon-btn:focus-visible` |  |  |  |  |  |  | var(--muted) | transparent |
| kit | `packages/design-kit/actions.css:44` | `.hub-icon-btn svg` |  |  |  | 1.125rem |  |  |  |  |
| kit | `packages/design-kit/actions.css:51` | `.hub-icon-btn` |  |  |  | 2.75rem |  |  |  |  |
| kit | `packages/design-kit/actions.css:60` | `.btn` | var(--font-size-card) | var(--weight-semibold) | 2.5rem |  | var(--space-2) var(--space-4) | var(--radius-sm) |  |  |
| kit | `packages/design-kit/actions.css:79` | `.btn--primary, .btn--decisive` |  |  |  |  |  |  | #fff | var(--navy) |
| kit | `packages/design-kit/actions.css:87` | `.btn--primary:hover:not(:disabled), .btn--decisive:hover:not(:disabled)` |  |  |  |  |  |  |  | var(--navy-2) |
| kit | `packages/design-kit/actions.css:93` | `.btn--secondary` |  |  |  |  |  |  | var(--marine) | rgba(255, 255, 255, 0.62) |
| kit | `packages/design-kit/actions.css:100` | `.btn--ghost` |  |  |  |  |  |  | var(--ink) | var(--glass) |
| kit | `packages/design-kit/actions.css:106` | `.btn--high-sea` |  |  |  |  |  |  | var(--depth) | var(--high-sea) |
| kit | `packages/design-kit/calendar-almanac.css:112` | `.alm-open__btns .btn` | var(--text-xs) |  | 1.875rem |  | var(--space-1) var(--space-3) |  |  |  |
| kit | `packages/design-kit/calendar-almanac.css:115` | `.alm-draft .btn` | var(--text-xs) |  | 1.75rem |  | 2px var(--space-3) |  |  |  |
| kit | `packages/design-kit/calendar-almanac.css:129` | `.alm-pop__acts .btn` | var(--text-sm) |  | 2rem |  | var(--space-1) var(--space-3) |  |  |  |
| kit | `packages/design-kit/calendar-day-dial.css:88` | `.dd-acts .btn` | var(--text-xs) |  | 1.75rem |  | 2px var(--space-3) |  |  |  |
| kit | `packages/design-kit/calendar-day-dial.css:111` | `.dd-pop__acts .btn` | var(--text-sm) |  | 2rem |  | var(--space-1) var(--space-3) |  |  |  |
| kit | `packages/design-kit/calendar-day-dial.css:228` | `.dd-face__dots button` |  |  |  | 24px | 0 |  |  | transparent |
| kit | `packages/design-kit/calendar-day-dial.css:229` | `.dd-face__dots button::before` |  |  |  | 8px |  | 999px |  | var(--line) |
| kit | `packages/design-kit/calendar-day-dial.css:230` | `.dd-face__dots button[aria-current="true"]::before` |  |  |  |  |  |  |  | var(--navy) |
| kit | `packages/design-kit/calendar-readiness.css:160` | `.rf-actions .btn` |  |  | 44px |  |  |  |  |  |
| kit | `packages/design-kit/calendar-term-river.css:96` | `.tr-pop__acts .btn` | var(--text-sm) |  | 2rem |  | var(--space-1) var(--space-3) |  |  |  |
| kit | `packages/design-kit/calendar-term-river.css:131` | `.tr-pop button,.tr-pop a` |  |  | 2.75rem |  |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:42` | `.cal-source-errors__line .btn` |  |  | 2.75rem |  | var(--space-1) var(--space-3) |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:49` | `.cal__tray .btn` | var(--text-sm) |  | 2rem |  | var(--space-1) var(--space-3) |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:184` | `.cal-chip__acts button,.cal-due__move button` |  |  |  |  | 4px 8px | 6px | var(--navy) | #fff |
| kit | `packages/design-kit/calendar-tideline.css:185` | `.cal-chip__acts button.is-yes,.cal-due__move button` |  |  |  |  |  |  | #fff | var(--navy) |
| kit | `packages/design-kit/calendar-tideline.css:238` | `.cal-pop__acts .btn` | var(--text-sm) |  | 2rem |  | var(--space-1) var(--space-3) |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:255` | `.cal-review__acts .btn` | var(--text-sm) |  | 2rem |  | var(--space-1) var(--space-3) |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:262` | `.cal-toast button` |  |  |  |  | 4px 8px | 6px | var(--navy) | #fff |
| kit | `packages/design-kit/calendar-tideline.css:274` | `.cal-strip button` |  |  |  |  | 6px 2px | 10px | var(--ink) | var(--glass) |
| kit | `packages/design-kit/calendar-tideline.css:275` | `.cal-strip button[aria-pressed="true"]` |  |  |  |  |  |  |  | color-mix(in srgb,var(--pastel-blue) 55%,#fff) |
| kit | `packages/design-kit/calendar-tideline.css:370` | `.cal-card__plan .btn` | var(--text-xs) |  | 2rem |  | 2px var(--space-3) |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:378` | `.cal-pop__acts .btn,.cal-review__acts .btn` |  |  | 44px |  |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:424` | `.cal-rescue__late .btn` |  |  | 2.25rem |  |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:432` | `.cal-rescue__acts .btn` |  |  | 2.5rem |  |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:448` | `.cal-review-q__opts button` | var(--text-xs) | var(--weight-medium) | 2.75rem |  | 10px 4px | 10px | var(--ink) | var(--glass) |
| kit | `packages/design-kit/calendar-tideline.css:449` | `.cal-review-q__opts button[aria-pressed="true"]` |  |  |  |  |  |  | #fff | var(--navy) |
| kit | `packages/design-kit/calendar-tideline.css:479` | `.cal-card__ask .btn,.cal-card__drop .btn` | var(--text-xs) |  | 2rem |  | 2px var(--space-3) |  |  |  |
| kit | `packages/design-kit/calendar-zoom-bar.css:45` | `:is(.cal__nav,.dd__nav,.tr__nav,.alm__nav) > .btn` | var(--text-sm) |  | 2.25rem |  | 0.3rem 0.85rem |  |  |  |
| kit | `packages/design-kit/calendar.css:704` | `.calendar-command__list button` |  |  |  |  | var(--space-2) var(--space-3) | var(--radius-sm) | var(--ink) | transparent |
| kit | `packages/design-kit/calendar.css:715` | `.calendar-command__list button:hover, .calendar-command__list button:focus-visible` |  |  |  |  |  |  |  | color-mix(in srgb, var(--wave) 10%, var(--warm-white)) |
| kit | `packages/design-kit/chrome.css:223` | `.hub-icon-btn` |  |  |  | 2rem | 0 | var(--radius-xs) | var(--shallow) | transparent |
| kit | `packages/design-kit/chrome.css:237` | `.hub-icon-btn` |  |  |  | 2.75rem |  |  |  |  |
| kit | `packages/design-kit/chrome.css:242` | `.hub-icon-btn:hover:not(:disabled), .hub-icon-btn:focus-visible` |  |  |  |  |  |  | var(--muted) | transparent |
| kit | `packages/design-kit/chrome.css:254` | `.hub-icon-btn svg` |  |  |  | 1.125rem |  |  |  |  |
| kit | `packages/design-kit/chrome.css:265` | `.btn` | var(--font-size-card) | var(--weight-semibold) | 2.5rem |  | var(--space-2) var(--space-4) | var(--radius-sm) |  |  |
| kit | `packages/design-kit/chrome.css:284` | `.btn--primary, .btn--decisive` |  |  |  |  |  |  | #fff | var(--navy) |
| kit | `packages/design-kit/chrome.css:292` | `.btn--primary:hover:not(:disabled), .btn--decisive:hover:not(:disabled)` |  |  |  |  |  |  |  | var(--navy-2) |
| kit | `packages/design-kit/chrome.css:298` | `.btn--secondary` |  |  |  |  |  |  | var(--marine) | rgba(255, 255, 255, 0.62) |
| kit | `packages/design-kit/chrome.css:305` | `.btn--ghost` |  |  |  |  |  |  | var(--ink) | var(--glass) |
| kit | `packages/design-kit/chrome.css:311` | `.btn--high-sea` |  |  |  |  |  |  | var(--depth) | var(--high-sea) |
| kit | `packages/design-kit/confirm-card.css:316` | `.confirm-card .confirm-card__actions .btn` | 0.8125rem | 600 | 1.875rem |  | 0 0.875rem | 999px |  |  |
| kit | `packages/design-kit/confirm-card.css:328` | `.confirm-card .confirm-card__actions :is(.btn--ghost, .btn--secondary)` |  |  |  |  |  |  | var(--muted, #6b7788) | transparent |
| kit | `packages/design-kit/confirm-card.css:333` | `.confirm-card .confirm-card__actions :is(.btn--ghost, .btn--secondary):hover:not(:disabled)` |  |  |  |  |  |  | var(--depth, #0a1536) | var(--cc-tint) |
| kit | `packages/design-kit/confirm-card.css:339` | `.confirm-card .confirm-card__actions .btn--primary` |  |  |  |  |  |  | #fff | var(--depth, #0a1536) |
| kit | `packages/design-kit/confirm-card.css:344` | `.confirm-card .confirm-card__actions .btn--primary:hover:not(:disabled)` |  |  |  |  |  |  |  | color-mix(in srgb, var(--depth, #0a1536) 86%, var(--wave, #376fb7)) |
| kit | `packages/design-kit/confirm-card.css:406` | `.confirm-card .confirm-card__actions :is(.btn, .confirm-card__more)` |  |  | calc(var(--space-10) + var(--space-1)) |  | 0 var(--space-4) |  |  |  |
| kit | `packages/design-kit/hub-chat-viewport.css:345` | `.page-header.is-chat-rail .chat-new-button, .page-header.is-chat-rail [data-new-chat], .chat-view:not([data-panel-mode]) > .chat-view__toolbar .btn` |  |  | 2.75rem |  |  |  |  |  |
| kit | `packages/design-kit/hub-list.css:746` | `.block-editor .block-editor__toolbar-btn.btn` | var(--text-xs) | var(--weight-medium) | 1.875rem |  | 0 var(--space-3) | calc(var(--radius-xs) - var(--space-px)) | var(--marine) | transparent |
| kit | `packages/design-kit/hub-list.css:758` | `.block-editor .block-editor__toolbar-btn.btn:hover:not(:disabled), .block-editor .block-editor__toolbar-btn.btn[aria-pressed='true']` |  |  |  |  |  |  |  | #fff |
| kit | `packages/design-kit/hub-list.css:895` | `.lesson-page__toolbar .lesson-page__done.btn` | var(--text-sm) |  | 2rem |  | 0 var(--space-4) | var(--radius-full) |  |  |
| kit | `packages/design-kit/hub-list.css:903` | `.lesson-page__toolbar .btn--ghost` | var(--text-sm) | var(--weight-medium) | 2rem |  | 0 var(--space-3) |  |  |  |
| kit | `packages/design-kit/mobile.css:87` | `.hub-more-sheet__nav a, .hub-more-sheet__nav button` | var(--text-base) | var(--weight-semibold) | 48px |  | var(--space-3) var(--space-4) | var(--radius-md) | var(--depth, var(--navy)) | rgba(255, 255, 255, 0.72) |
| kit | `packages/design-kit/mobile.css:107` | `.hub-more-sheet__nav a:active, .hub-more-sheet__nav button:active` |  |  |  |  |  |  |  | rgba(55, 111, 183, 0.1) |
| kit | `packages/design-kit/mobile.css:156` | `.hub-mobile-nav a, .hub-mobile-nav button` | var(--text-2xs) | var(--weight-bold) | 44px |  | var(--space-1) | var(--radius-sm) | var(--muted) | transparent |
| kit | `packages/design-kit/mobile.css:176` | `.hub-mobile-nav a[aria-current="page"], .hub-mobile-nav a.is-current, .hub-mobile-nav button[aria-current="page"], .hub-mobile-nav button.is-current, .hub-mobile-nav button.is-active` |  |  |  |  |  |  | var(--depth, var(--navy)) | rgba(55, 111, 183, 0.08) |
| kit | `packages/design-kit/rail.css:134` | `button.hub-rail__section:hover, button.hub-rail__section:focus-visible` |  |  |  |  |  |  | var(--on-dark) |  |
| knowledge | `apps/knowledge/src/protocols/style.css:64` | `.protocol-intake .btn--ghost,.protocol-session .btn--ghost` |  |  |  |  |  |  | #e9dfca | rgba(0,0,0,.32) |
| knowledge | `apps/knowledge/src/protocols/style.css:65` | `.protocol-intake .btn--ghost:hover:not(:disabled),.protocol-session .btn--ghost:hover:not(:disabled)` |  |  |  |  |  |  |  | rgba(0,0,0,.48) |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:406` | `.shelf-card li button` |  |  |  |  | 0 |  | var(--ink) | none |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:416` | `.shelf-card li button:hover` |  |  |  |  |  |  | var(--wave) |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2284` | `.isles-card__routes button` |  |  |  |  | 0 |  | var(--wave) | none |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3425` | `.shelf-sheet__actions .btn` |  |  | 44px |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:325` | `.wl-nudge .btn` | var(--text-lg) |  | 2.75rem |  | 0 |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:596` | `.wl-ro__item button` |  |  |  |  | var(--space-2) var(--space-3) | var(--radius-sm) | var(--ink) | transparent |
| knowledge | `apps/knowledge/src/shelf/wireless.css:611` | `.wl-ro__item button:not(:disabled):hover` |  |  |  |  |  |  |  | var(--cotton) |
| knowledge | `apps/knowledge/src/shelf/wireless.css:615` | `.wl-ro__item.is-now button` |  |  |  |  |  |  |  | color-mix(in srgb, var(--seg) 14%, var(--paper)) |
| knowledge | `apps/knowledge/src/studio/studio.css:143` | `.studio-ghost svg, .btn svg` |  |  |  | 18px |  |  |  |  |
| knowledge | `apps/knowledge/src/studio/studio.css:278` | `button.studio-noterow__title:hover` |  |  |  |  |  |  | var(--wave) |  |
| knowledge | `apps/knowledge/src/style.css:700` | `.alchemist-card button` |  | var(--weight-semibold) |  |  | 0 |  | var(--marine) | transparent |
| knowledge | `apps/knowledge/src/style.css:1544` | `.graph-modes button` |  | var(--weight-semibold) |  |  | 0.4rem 0.9rem | 999px | var(--navy) | transparent |
| knowledge | `apps/knowledge/src/style.css:1553` | `.graph-modes button.is-active` |  |  |  |  |  |  | var(--on-dark) | var(--navy) |
| knowledge | `apps/knowledge/src/style.css:2030` | `.wiki-card__pair button` |  |  | 2.75rem |  | var(--space-2) 0 |  | inherit | transparent |
| knowledge | `apps/knowledge/src/style.css:2083` | `.wiki .btn` |  |  | 2.75rem |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:2109` | `.wiki-links button` |  |  |  |  | 0 |  | var(--ink) | none |
| knowledge | `apps/knowledge/src/style.css:2414` | `.graph-modes button` | var(--text-xs) |  |  |  | 0.3rem 0.65rem |  |  |  |
| knowledge | `apps/knowledge/src/style.css:2448` | `.universe-zoom .btn` |  |  | 2.75rem |  | 0 | 0 |  |  |
| knowledge | `apps/knowledge/src/style.css:2507` | `.chat__book-add input, .chat__book-add .btn` |  |  | 44px |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:2596` | `.coach.chat .alchemist__actions .btn, .coach.chat.chat--from-book .chat__note-form .btn, .compose__capture .btn, .reader__actions .btn, .origin-add .btn, .origin-add select, .origin-add input` |  |  | 44px |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:2683` | `.quiz-card__actions button` |  | var(--weight-semibold) |  |  | 0.7rem 1rem | 12px | #fff | var(--navy) |
| knowledge | `apps/knowledge/src/style.css:2692` | `.quiz-card__actions button[data-quiz-rate="1"]` |  |  |  |  |  |  |  | var(--danger, #8f2d2d) |
| knowledge | `apps/knowledge/src/style.css:2693` | `.quiz-card__actions button[data-quiz-rate="2"]` |  |  |  |  |  |  |  | #8a5a2b |
| knowledge | `apps/knowledge/src/style.css:2694` | `.quiz-card__actions button[data-quiz-rate="3"]` |  |  |  |  |  |  |  | var(--navy) |
| knowledge | `apps/knowledge/src/style.css:2695` | `.quiz-card__actions button[data-quiz-rate="4"]` |  |  |  |  |  |  |  | #2c5e45 |
| knowledge | `apps/knowledge/src/style.css:2696` | `.quiz-card__actions button[data-quiz-end], .quiz-card__actions button[data-quiz-home]` |  |  |  |  |  |  | var(--navy) | transparent |
| knowledge | `apps/knowledge/src/style.css:2711` | `.quiz-modes button` |  | var(--weight-semibold) |  |  | 0.4rem 0.9rem | 999px |  | transparent |
| knowledge | `apps/knowledge/src/style.css:2719` | `.quiz-modes button.is-active` |  |  |  |  |  |  | #fff | var(--navy) |
| knowledge | `apps/knowledge/src/style.css:2748` | `.dump-tabs button` | 0.7rem |  |  |  | 0.7rem 0.5rem |  | #888 | none |
| knowledge | `apps/knowledge/src/style.css:2758` | `.dump-tabs button.is-active` |  |  |  |  |  |  | #f5f2eb | #1a1a18 |
| knowledge | `apps/knowledge/src/style.css:3009` | `.compose__capture .topbar__action, .compose__capture .btn` |  |  | 44px |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:3746` | `.chat-overlay__save .btn` |  |  | 44px |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:3809` | `.chat-overlay .chat-form .btn, .chat-overlay__book input, .chat-overlay__book .btn` |  |  | 44px |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:3951` | `.uni-tl__toolbar .btn` |  |  | 2rem |  | var(--space-1) var(--space-3) |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5551` | `.universe-replay .btn` | var(--text-xs) |  | 2rem |  | 0.25rem 0.75rem |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5923` | `.universe-system__actions .btn` | var(--text-xs) |  | 2rem |  | 0.25rem 0.75rem |  |  |  |
| knowledge | `apps/knowledge/src/style.css:6126` | `.neural-dock__row button, .neural-dock__panel button` |  |  | 30px |  | 7px 10px | 999px | var(--ink, #13233a) | rgba(251, 248, 242, 0.88) |
| knowledge | `apps/knowledge/src/style.css:6137` | `.neural-dock__row button.is-active, .neural-dock__segments button.is-active` |  |  |  |  |  |  | #fbf8f2 | #13233a |
| knowledge | `apps/knowledge/src/style.css:6183` | `.neural-dock__steps button` | 13px |  |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:6241` | `.neural-dock__steps button small` | 11px |  |  |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:6246` | `.neural-dock__steps button.is-forgotten small` |  |  |  |  |  |  | #c25a14 |  |
| knowledge | `apps/knowledge/src/style.css:6282` | `.graph-wrap.is-neural .neural-dock__steps button.is-forgotten small` |  |  |  |  |  |  | #ffb070 |  |
| knowledge | `apps/knowledge/src/style.css:6321` | `.graph-wrap.is-neural .neural-dock__row button, .graph-wrap.is-neural .neural-dock__panel button:not(.neural-dock__quiet)` |  |  |  |  |  |  | #f4efe6 | rgba(20, 26, 40, 0.82) |
| knowledge | `apps/knowledge/src/style.css:6328` | `.graph-wrap.is-neural .neural-dock__row button.is-active, .graph-wrap.is-neural .neural-dock__segments button.is-active` |  |  |  |  |  |  | #03050a | #f4efe6 |
| knowledge | `apps/knowledge/src/style.css:6341` | `.graph-wrap.is-neural .neural-dock__panel .neural-dock__steps button, .graph-wrap.is-neural .neural-dock__panel .neural-dock__quiet` |  |  |  |  |  |  | #f4efe6 | transparent |
| knowledge | `apps/knowledge/src/style.css:6353` | `.neural-dock__row button` |  |  |  |  | 6px 9px |  |  |  |
| knowledge | `apps/knowledge/src/style.css:6441` | `.neural-dock__row button, .neural-dock__panel button, .neural-dock__panel select, .graph-zoom__btn` |  |  | 44px |  |  |  |  |  |
| life | `apps/life/css/aesthetics.css:50` | `.aes-btn` | var(--text-sm) | var(--weight-semibold) | 2.5rem |  | 0.5rem 1rem | var(--radius-full) | var(--ink) | var(--glass) |
| life | `apps/life/css/aesthetics.css:61` | `.aes-btn--ink` |  |  |  |  |  |  | var(--warm-white) | var(--ink) |
| life | `apps/life/css/aesthetics.css:114` | `.aes-stage .aes-btn` |  |  |  |  |  |  | var(--aes-stage-ink) | color-mix(in srgb, var(--warm-white) 8%, transparent) |
| life | `apps/life/css/aesthetics.css:115` | `.aes-stage .aes-btn:hover` |  |  |  |  |  |  |  | color-mix(in srgb, var(--warm-white) 16%, transparent) |
| life | `apps/life/css/aesthetics.css:116` | `.aes-stage .aes-btn--primary` |  |  |  |  |  |  | var(--depth) | var(--aes-stage-ink) |
| life | `apps/life/css/app.css:405` | `.now-capture__toast a, .now-capture__toast button` |  |  |  |  | 0 |  | #ffd2a6 | none |
| life | `apps/life/css/app.css:732` | `.meal-history__header > .btn` | var(--text-sm) |  | var(--space-10) |  | var(--space-1) var(--space-2) |  |  |  |
| life | `apps/life/css/app.css:776` | `.meal-history__header > .btn` |  |  | calc(var(--space-10) + var(--space-1)) |  |  |  |  |  |
| life | `apps/life/css/app.css:880` | `.unavailable-panel button` |  |  | 44px |  | 0.6rem 1rem | 999px | white | var(--marine) |
| life | `apps/life/css/app.css:935` | `.more-sheet-retired__nav button, .more-sheet-retired__nav a` | var(--text-base) | 600 | 48px |  | 0.7rem 0.85rem | 0.9rem | var(--depth) | rgba(255, 255, 255, 0.72) |
| life | `apps/life/css/app.css:952` | `.more-sheet-retired__nav button:active, .more-sheet-retired__nav a:active` |  |  |  |  |  |  |  | rgba(55, 111, 183, 0.1) |
| life | `apps/life/css/app.css:998` | `.quiet-button` |  |  |  |  | 0.5rem 0.65rem |  |  |  |
| life | `apps/life/css/app.css:2672` | `.home-sprint-card__cta, .home-sprint-card__secondary, .home-sprint-card__actions .btn` |  |  | 44px |  |  |  |  |  |
| life | `apps/life/css/app.css:3120` | `.gym-icon-btn` | var(--text-sm) | 650 | 44px |  | 0.35rem 0.75rem | 0.8rem | var(--on-dark) | transparent |
| life | `apps/life/css/app.css:3132` | `.gym-icon-btn:hover` |  |  |  |  |  |  |  | var(--on-dark-hover) |
| life | `apps/life/css/app.css:3134` | `.gym-icon-btn[aria-pressed="true"]` |  |  |  |  |  |  |  | var(--on-dark-hover) |
| life | `apps/life/css/app.css:3565` | `.gym-sheet .gym-icon-btn` |  |  |  |  |  |  | var(--depth) |  |
| life | `apps/life/css/app.css:3568` | `.gym-sheet .gym-icon-btn:hover` |  |  |  |  |  |  |  | rgba(20, 43, 81, 0.06) |
| life | `apps/life/css/app.css:6442` | `.cn-pair-bars button` |  |  | 4px |  | 0 | 2px 2px 0 0 |  |  |
| life | `apps/life/css/app.css:7246` | `.mind-constellation__head .btn` | var(--text-sm) |  | 2.25rem |  | var(--space-1) var(--space-3) |  |  |  |
| life | `apps/life/css/app.css:7251` | `.mind-constellation__head .btn[aria-pressed="true"]` |  |  |  |  |  |  | var(--high-sea-ink) |  |
| life | `apps/life/css/app.css:8310` | `.chat-view[data-panel-mode="overlay"] .chat-view__actions .btn` |  |  | 2.2rem |  |  |  |  |  |
| life | `apps/life/css/app.css:8557` | `#mind-waffle button` |  |  | 0.85rem |  | 0 | 2px |  | var(--glass) |
| life | `apps/life/css/app.css:8565` | `#mind-waffle button[data-mood="great"]` |  |  |  |  |  |  |  | var(--mood-great) |
| life | `apps/life/css/app.css:8566` | `#mind-waffle button[data-mood="good"]` |  |  |  |  |  |  |  | var(--mood-good) |
| life | `apps/life/css/app.css:8567` | `#mind-waffle button[data-mood="neutral"]` |  |  |  |  |  |  |  | var(--mood-neutral) |
| life | `apps/life/css/app.css:8568` | `#mind-waffle button[data-mood="low"]` |  |  |  |  |  |  |  | var(--mood-low) |
| life | `apps/life/css/app.css:8569` | `#mind-waffle button[data-mood="bad"]` |  |  |  |  |  |  |  | var(--mood-bad) |
| life | `apps/life/css/app.css:8616` | `.mind-watchlist__head .btn` | var(--text-sm) |  | 2.25rem |  | var(--space-1) var(--space-3) |  |  |  |
| life | `apps/life/css/app.css:9587` | `.medical-sheet [data-part="form-actions"] .btn` |  |  | 2.75rem |  |  |  |  |  |
| life | `apps/life/css/app.css:9729` | `.hub-map__zoom button` | var(--text-md) |  |  | 1.75rem |  | 50% | var(--marine) | transparent |
| life | `apps/life/css/app.css:9738` | `.hub-map__zoom button:hover` |  |  |  |  |  |  |  | var(--pastel-blue) |
| life | `apps/life/css/food-journal.css:99` | `.food-rating .btn` |  |  | 44px |  | var(--space-2) var(--space-3) |  |  |  |
| life | `apps/life/css/food-journal.css:155` | `.food-sheet__actions .btn` |  |  | 44px |  |  |  |  |  |
| life | `apps/life/css/food-journal.css:271` | `.food-toolbar .btn` |  |  | 44px |  |  |  |  |  |
| life | `apps/life/css/garage-home.css:24` | `.gh-bar .btn, .gh-inline-actions .btn, .gh-section-head .btn` |  |  | 2.75rem |  |  |  |  |  |
| life | `apps/life/css/garage-home.css:26` | `.gh-seg button` | var(--text-sm) | var(--weight-semibold) | 2.75rem |  | 0 var(--space-4) | var(--radius-full) | var(--muted) | transparent |
| life | `apps/life/css/garage-home.css:27` | `.gh-seg button[aria-selected="true"], .gh-seg button[aria-pressed="true"]` |  |  |  |  |  |  | var(--on-dark) | var(--navy) |
| life | `apps/life/css/garage-home.css:28` | `.gh-seg--small button` |  |  | 2.5rem |  | 0 var(--space-3) |  |  |  |
| life | `apps/life/css/garage-home.css:143` | `button.gh-timeline__row:hover, .gh-timeline__row.is-on` |  |  |  |  |  |  |  | var(--glass) |
| life | `apps/life/css/garage-home.css:196` | `.gh-sheet__foot .btn` |  |  | 2.75rem |  |  |  |  |  |
| life | `apps/life/css/garage-home.css:224` | `.gh-seg button` |  |  |  |  | 0 var(--space-2) |  |  |  |
| life | `apps/life/css/property.css:33` | `.prop-seg button` | var(--text-sm) | var(--weight-semibold) | 2.25rem |  | 0 var(--space-4) | var(--radius-full) | var(--muted) | transparent |
| life | `apps/life/css/property.css:34` | `.prop-seg button[aria-pressed="true"]` |  |  |  |  |  |  | var(--on-dark) | var(--navy) |
| life | `apps/life/css/property.css:37` | `.prop-lens__actions .btn` |  |  | 2.75rem |  |  |  |  |  |
| life | `apps/life/css/property.css:83` | `.prop-countdown .btn` |  |  | 2.75rem |  |  |  |  |  |
| life | `apps/life/css/property.css:148` | `.prop-tm__value .btn` |  |  | 2.75rem |  |  |  |  |  |
| life | `apps/life/css/property.css:151` | `.prop-tm .btn--ghost` |  |  |  |  |  |  | var(--on-dark) | transparent |
| life | `apps/life/css/property.css:194` | `.prop-cc-foot .btn` |  |  | 2.75rem |  |  |  |  |  |
| life | `apps/life/css/property.css:213` | `.prop-stmt .btn` |  |  | 2.75rem |  |  |  |  |  |
| life | `apps/life/css/property.css:284` | `.prop-sheet__foot .btn` |  |  | 2.75rem |  |  |  |  |  |
| life | `apps/life/css/property.css:308` | `.prop-lens__actions .btn` |  |  |  |  | 0 var(--space-3) |  |  |  |
| professional | `apps/professional/src/styles/event-page.css:183` | `.event-page .hub-pills__btn, .event-page .talk-add .btn, .event-page .confirm-card__actions .btn` |  |  | 2.75rem |  |  |  |  |  |
| professional | `apps/professional/src/styles/event-page.css:197` | `.event-format-editor .morphing-popover__actions .btn, .event-format-editor .hub-pills__btn` |  |  | 2.75rem |  |  |  |  |  |
| professional | `apps/professional/src/styles/event-page.css:210` | `.event-page__tasks .btn` |  |  | 2.75rem |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:407` | `.person-card__edit.btn, .person-card .entity-detail__role-edit` | var(--text-sm) |  | 0 |  | 0 |  | var(--wave) | transparent |
| professional | `apps/professional/src/styles/hub.css:1383` | `.miniworld__seg button` |  |  |  |  | 7px 14px | calc(var(--radius-sm) - 2px) | var(--muted) | transparent |
| professional | `apps/professional/src/styles/hub.css:1392` | `.miniworld__seg button[aria-pressed='true']` |  |  |  |  |  |  | var(--ink) | var(--paper) |
| professional | `apps/professional/src/styles/hub.css:1546` | `.miniworld__zoom button` |  |  |  | 36px |  |  | var(--navy) | transparent |
| professional | `apps/professional/src/styles/hub.css:1559` | `.miniworld__zoom button.fit` | 11px | 600 |  |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:1893` | `.miniworld__insights button` |  |  |  |  | 8px 10px | var(--radius-sm) | var(--ink) | transparent |
| professional | `apps/professional/src/styles/hub.css:1904` | `.miniworld__insights button:hover` |  |  |  |  |  |  |  | var(--ground, var(--shore)) |
| professional | `apps/professional/src/styles/hub.css:2577` | `.event-compose__stepper button` | 1.125rem | var(--weight-semibold) |  | 2.25rem |  | var(--radius-full) | var(--navy) | #fff |
| professional | `apps/professional/src/styles/hub.css:3182` | `.people-page__title-row .btn` |  |  | 2.5rem |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:4430` | `.orgs-flow__zoom .btn` |  |  |  |  | 0 0.5rem |  |  |  |
| professional | `apps/professional/src/styles/hub.css:5852` | `button.org-chart__unit-label:hover` |  |  |  |  |  |  | var(--high-sea-ink) |  |
| professional | `apps/professional/src/styles/hub.css:5857` | `button.org-chart__unit-label:focus-visible` |  |  |  |  |  | 4px |  |  |
| professional | `apps/professional/src/styles/hub.css:6336` | `.org-chart__head-actions .btn` | var(--text-xs) |  | 2rem |  | 0 10px |  |  |  |
| professional | `apps/professional/src/styles/hub.css:6381` | `.people-page .person-editor .add-person-form__actions .btn` |  |  | 2.75rem |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:6401` | `.event-compose__footer .btn` |  |  | 2.75rem |  |  |  |  |  |
| professional | `apps/professional/src/styles/meeting-page.css:400` | `.meeting-page .btn` | var(--text-sm) |  | 2rem |  | var(--space-1) var(--space-3) |  |  |  |
| tasks | `apps/tasks/src/grove-world-preview/preview.css:7` | `.world-preview__controls .btn` | var(--text-xl) |  | 44px |  |  |  |  |  |
| tasks | `apps/tasks/src/grove-world-preview/preview.css:22` | `.world-preview__activity button` |  |  | 44px |  |  |  |  |  |
| tasks | `apps/tasks/src/personal-line/personal-line.css:131` | `.pl-next button` |  |  |  |  | 6px 0 | 6px | inherit | none |
| tasks | `apps/tasks/src/styles/cards.css:587` | `.hub-icon-btn--danger:hover, .hub-icon-btn--danger:focus-visible` |  |  |  |  |  |  | var(--danger) | var(--danger-surface) |
| tasks | `apps/tasks/src/styles/cards.css:1121` | `.hub-canvas .hub-row .hub-icon-btn, .hub-card .hub-icon-btn, .card-menu` |  |  |  | 2.75rem |  |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:1168` | `.hub-canvas .hub-chip, .hub-canvas .priority-chip, .hub-canvas .due-chip, .hub-canvas .status-badge, .hub-canvas .date-badge, .hub-canvas button.hub-chip, .hub-canvas button.priority-chip, .hub-canvas button.status-badge` | var(--text-2xs) | var(--weight-medium) | 0 |  | 0.05rem 0.3rem |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:1214` | `.hub-canvas .hub-row .card-menu, .hub-canvas .hub-card .card-menu, .hub-canvas .hub-row .hub-icon-btn, .hub-canvas .hub-card .hub-icon-btn` |  |  |  | 1.75rem |  |  |  |  |
| tasks | `apps/tasks/src/styles/goals.css:152` | `.hammond .btn--secondary` |  |  |  |  |  |  | var(--on-dark) | var(--on-dark-hover) |
| tasks | `apps/tasks/src/styles/goals.css:157` | `.hammond .btn--secondary:hover` |  |  |  |  |  |  |  | rgba(255, 255, 255, 0.18) |
| tasks | `apps/tasks/src/styles/goals.css:221` | `.focus-strip .btn` |  |  |  |  |  |  | var(--on-dark) |  |
| tasks | `apps/tasks/src/styles/goals.css:227` | `.hammond__stamp button` |  |  |  |  | 0 |  | var(--on-dark) | none |
| tasks | `apps/tasks/src/styles/goals.css:244` | `.hammond-chip button` | var(--text-xs) | var(--weight-semibold) |  |  | var(--space-1) var(--space-3) | var(--radius-sm) |  |  |
| tasks | `apps/tasks/src/styles/goals.css:268` | `.goals-plan-card__choices .btn, .goals-checkin__nav .btn, .goals-checkin .hub-chip, .goal-page .hub-chip, .goals-plan-card .hub-chip, .runway-phone__card` |  |  | 2.75rem |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/goals.css:291` | `.goals-plan-sheet .btn, .goals-checkin-sheet .btn, .runway__row` |  |  | 2.75rem |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/timeline.css:223` | `.tl-tray .btn` | var(--text-sm) |  | 2.25rem |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:211` | `.property-row__actions .btn` |  |  | 2.6rem |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:918` | `.btn--sm` | var(--text-xs) |  | 1.75rem |  | var(--space-1) var(--space-3) |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:3573` | `.chat-view[data-panel-mode='overlay'] .chat-view__toolbar .btn` | var(--text-sm) |  | 2rem |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:3801` | `.chat-view #chat-send, .chat-view .chat-form__tools .btn` |  |  | 44px |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:4220` | `.quick-add .hub-search, .quick-add .hub-filter, .quick-add .btn` | var(--text-sm) |  | 2.25rem |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:4259` | `.pinch-card__actions .btn` | var(--text-xs) |  |  |  | 0.4rem 0.65rem |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:5776` | `.viz-alt .btn.is-active` |  |  |  |  |  |  |  | var(--cotton) |
| tasks | `apps/tasks/src/styles/views.css:6881` | `.universe-zoom .btn` |  |  | 2.75rem |  | 0 | 0 |  |  |
| tasks | `apps/tasks/src/styles/views.css:7378` | `button.projects-mix__center:hover, button.projects-mix__center.is-active, a.projects-mix__center:hover` |  |  |  |  |  |  |  | color-mix(in srgb, var(--pastel-gold) 40%, transparent) |
| tasks | `apps/tasks/src/styles/views.css:7464` | `button.projects-mix__legend-row:hover, button.projects-mix__legend-row.is-active, .projects-mix__legend-row.is-active` |  |  |  |  |  |  |  | color-mix(in srgb, var(--shore) 55%, transparent) |
| tasks | `apps/tasks/src/styles/views.css:7701` | `.dashboard-next .btn--primary, .dashboard-next .btn--decisive` |  |  |  |  |  |  | var(--navy) | var(--warm-white) |
| tasks | `apps/tasks/src/styles/views.css:7709` | `.dashboard-next .btn--primary:hover:not(:disabled), .dashboard-next .btn--decisive:hover:not(:disabled)` |  |  |  |  |  |  |  | var(--cotton) |
| tasks | `apps/tasks/src/styles/views.css:8189` | `button.column-bar--row` |  |  |  |  | var(--space-1) var(--space-2) | var(--radius-xs) |  |  |
| tasks | `apps/tasks/src/styles/views.css:8196` | `button.column-bar--row:hover, button.column-bar--row.is-active` |  |  |  |  |  |  |  | color-mix(in srgb, var(--pastel-blue) 40%, transparent) |
| tasks | `apps/tasks/src/styles/views.css:8373` | `.dashboard-next > .btn` | var(--text-xs) |  |  |  | var(--space-2) var(--space-3) |  |  |  |
| tasks | `apps/tasks/src/views/city/city.css:90` | `.city-tools .btn, .city-panel .btn, .city-legend .btn` |  |  | 2.75rem |  |  |  |  |  |
| tasks | `apps/tasks/src/views/city/city.css:141` | `.city-a11y button` | var(--text-sm) |  | 2.75rem |  | 0 var(--space-3) | var(--radius-sm) | var(--ink) | var(--paper) |
| tasks | `apps/tasks/src/views/programs-network.css:12` | `.pn button` |  |  |  |  |  |  | inherit |  |
| teaching | `apps/teaching/src/styles/alchemy-assistant.css:18` | `.alchemy-review__composer button` |  |  | 44px |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/alchemy-assistant.css:20` | `.alchemy-review__actions button` |  |  | 44px |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:289` | `.teacher-layout__rail .hub-icon-btn` |  |  |  |  |  |  | var(--on-dark-muted) |  |
| teaching | `apps/teaching/src/styles/app.css:293` | `.teacher-layout__rail .hub-icon-btn:hover:not(:disabled), .teacher-layout__rail .hub-icon-btn:focus-visible` |  |  |  |  |  |  | var(--on-dark) |  |
| teaching | `apps/teaching/src/styles/app.css:354` | `.teacher-layout__rail .btn--ghost` |  |  |  |  |  |  | var(--on-dark-muted) | transparent |
| teaching | `apps/teaching/src/styles/app.css:360` | `.teacher-layout__rail .btn--ghost:hover:not(:disabled)` |  |  |  |  |  |  | #fff | var(--on-dark-hover) |
| teaching | `apps/teaching/src/styles/app.css:365` | `.teacher-layout__rail .btn--secondary` |  |  |  |  |  |  | #fff | rgba(255, 255, 255, 0.1) |
| teaching | `apps/teaching/src/styles/app.css:372` | `.teacher-layout__rail .btn--secondary:hover:not(:disabled)` |  |  |  |  |  |  |  | rgba(255, 255, 255, 0.16) |
| teaching | `apps/teaching/src/styles/app.css:779` | `.lesson-editor__composition-modal-footer .btn` |  |  | 44px |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:2697` | `.entity-banner__dialog .btn` |  |  | 44px |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:2996` | `.seq__controls button.hub-list__more` |  |  |  | var(--space-6) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:3618` | `.timetable-modal .btn` |  |  | 44px |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:7482` | `.lessons-lib__icon-btn, .lessons-lib .list-row-actions .public-link__trigger` | var(--text-base) |  | 2.1rem |  | 0 | var(--radius-xs) | var(--muted) | color-mix(in srgb, #fff 60%, transparent) |
| teaching | `apps/teaching/src/styles/app.css:7501` | `.lessons-lib__icon-btn:hover, .lessons-lib .list-row-actions .public-link__trigger:hover` |  |  |  |  |  |  | var(--navy) | #fff |
| teaching | `apps/teaching/src/styles/app.css:7753` | `.trash-page__actions .btn` |  |  | 44px |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:9750` | `.block-editor__annotation-voice-actions .btn, .block-editor__annotation-voice-clip-actions .btn, .block-editor__annotation-voice-toolbar .btn, .block-editor__annotation-voice-kinds .btn` |  |  | 44px |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:9966` | `.block-editor__annotation-voice-recovered-row .btn` |  |  | 44px |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:10031` | `.feedback-page__actions .btn, .feedback-page__card-actions .btn` |  |  | 44px |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/block-pulse.css:215` | `.pulse__actions .btn` | var(--text-xs) |  |  |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/class-examples.css:469` | `.cx-row__actions .btn` | var(--text-sm) |  | 2.25rem |  | 0.4rem 0.85rem |  |  |  |
| teaching | `apps/teaching/src/styles/class-examples.css:703` | `.cx-row__actions .btn, .cx-unlock__row .btn, .cx-actions .btn, .cx-slot__code-btn, .cx-tab` |  |  | 44px |  |  |  |  |  |
| travel | `apps/travel/src/styles/journal.css:137` | `.journal-empty__actions .btn` |  |  | 2.75rem |  |  |  |  |  |
| travel | `apps/travel/src/styles/journal.css:374` | `.journal-map-panel__actions .btn` |  |  | 44px |  |  |  |  |  |
| travel | `apps/travel/src/styles/journal.css:931` | `.journal-edit-moment__place-actions .btn` |  |  | 2.75rem |  |  |  |  |  |
| travel | `apps/travel/src/styles/journal.css:1195` | `.journal-pin-panel__zoom.maplibregl-ctrl-group button` |  |  |  | 44px |  |  |  |  |
| travel | `apps/travel/src/styles/journal.css:1223` | `.journal-pin-panel__actions .btn` |  |  | 3rem |  |  |  |  |  |
| travel | `apps/travel/src/styles/journal.css:1261` | `.journal-trash__actions .btn` |  |  | 2.75rem |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:29` | `button` |  |  |  |  |  |  | inherit |  |
| travel | `apps/travel/src/styles/travel.css:34` | `.btn` | .8125rem | 600 |  |  | 9px 14px | var(--radius-sm) | #fff | var(--navy) |
| travel | `apps/travel/src/styles/travel.css:35` | `.btn.ghost` |  |  |  |  |  |  | var(--ink) | var(--paper) |
| travel | `apps/travel/src/styles/travel.css:36` | `.btn.city` |  |  |  |  |  |  | #fff | var(--city) |
| travel | `apps/travel/src/styles/travel.css:37` | `.btn svg` |  |  |  | 16px |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:157` | `.trips-list .top .acts .btn` |  |  | 2.75rem |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:159` | `.trip-empty-cities .btn` |  |  | 2.75rem |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:161` | `.place-suggestions .btn` | .8125rem |  | 2.5rem |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:186` | `.daybtn` | .8125rem | 600 |  |  | 6px 12px | var(--radius-sm) | var(--city-ink) | rgba(255,255,255,.65) |
| travel | `apps/travel/src/styles/travel.css:187` | `.daybtn small` | .6875rem | 500 |  |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:188` | `.daybtn.is-on` |  |  |  |  |  |  | #fff | var(--city-ink) |
| travel | `apps/travel/src/styles/travel.css:291` | `.safe-mark` | .75rem | 600 |  |  | 4px 10px 4px 8px | 999px | var(--pastel-sage-ink) | var(--pastel-sage) |
| travel | `apps/travel/src/styles/travel.css:295` | `.safe-mark svg` |  |  |  | 14px |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:296` | `.safe-mark.is-safe` |  |  |  |  |  |  | var(--success) | #d7eddf |
| travel | `apps/travel/src/styles/travel.css:297` | `.safe-mark__btn` |  |  | 2rem |  |  |  | var(--success) | var(--paper) |
| travel | `apps/travel/src/styles/travel.css:302` | `.safe-mark__btn:hover` |  |  |  |  |  |  |  | #d7eddf |
| travel | `apps/travel/src/styles/travel.css:303` | `.safe-mark__photo-btn` |  |  | 2rem |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:304` | `.safe-mark__photo-btn svg` |  |  |  | 14px |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:306` | `.safe-mark__photo` |  |  |  |  |  | var(--radius-sm) |  |  |
| travel | `apps/travel/src/styles/travel.css:360` | `.pen .btn` |  |  |  |  | 6px 12px |  |  |  |
| travel | `apps/travel/src/styles/travel.css:402` | `.addform__actions .btn, .sheet .row .btn` | 1rem |  | 2.75rem |  | 0.75rem 1.1rem |  |  |  |
| travel | `apps/travel/src/styles/travel.css:432` | `.addform__actions .btn, .sheet .row .btn` |  |  | 3rem |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:492` | `.zoom-ctl button` | 1.25rem | 600 |  | 38px |  |  | var(--ink) | none |
| travel | `apps/travel/src/styles/travel.css:494` | `.zoom-ctl button:hover` |  |  |  |  |  |  |  | var(--cotton) |
| travel | `apps/travel/src/styles/travel.css:508` | `.seg button` | .8125rem | 600 |  |  | 7px 10px | .625rem | var(--muted) | none |
| travel | `apps/travel/src/styles/travel.css:509` | `.seg button[aria-checked="true"]` |  |  |  |  |  |  | var(--ink) | var(--paper) |
| travel | `apps/travel/src/styles/travel.css:524` | `.sugg button` | .75rem | 500 |  |  | 4px 10px | 999px | var(--ink) | var(--paper) |
| travel | `apps/travel/src/styles/travel.css:529` | `.btn.danger` |  |  |  |  |  |  | #fff | #9b2c2c |
| travel | `apps/travel/src/styles/travel.css:530` | `.btn.ghost.danger` |  |  |  |  |  |  | #9b2c2c | var(--paper) |
