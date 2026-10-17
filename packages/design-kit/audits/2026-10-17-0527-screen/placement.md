# Placement

Rules that set `position` to fixed, absolute, or sticky. Companion offsets on the same rule are included when the parser saw them as the same declaration block (matched by file + selector + context).

| Hub | Where | Context | Selector | Position | Top | Right | Bottom | Left | Z-index |
|---|---|---|---|---|---|---|---|---|---|
| kit | `packages/design-kit/adaptive-slider.css:120` |  | `.hub-slider__dots` | absolute |  |  |  |  | 2 |
| kit | `packages/design-kit/adaptive-slider.css:139` |  | `.hub-slider__fill` | absolute | 0 |  |  | 0 | 1 |
| kit | `packages/design-kit/adaptive-slider.css:153` |  | `.hub-slider__input` | absolute |  |  |  |  | 4 |
| kit | `packages/design-kit/adaptive-slider.css:169` |  | `.hub-slider__thumb` | absolute | 0 |  |  | calc((var(--hub-slider-pct) / 100) * (100% - var(--hub-slider-thumb))) | 3 |
| kit | `packages/design-kit/calendar-almanac.css:117` |  | `.alm-mark::before,.alm-mark::after` | absolute | 0 |  |  |  |  |
| kit | `packages/design-kit/calendar-almanac.css:120` |  | `.alm-pop` | absolute |  |  |  |  | 30 |
| kit | `packages/design-kit/calendar-almanac.css:130` |  | `.alm-toast` | absolute |  | var(--space-6) | var(--space-6) |  | 20 |
| kit | `packages/design-kit/calendar-almanac.css:131` |  | `.alm-toast::before` | absolute | 12px |  |  | 14px |  |
| kit | `packages/design-kit/calendar-almanac.css:133` |  | `.alm-sr` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/calendar-day-dial.css:92` |  | `.dd-mark::before,.dd-mark::after` | absolute | 0 |  |  |  |  |
| kit | `packages/design-kit/calendar-day-dial.css:104` |  | `.dd-pop` | absolute |  |  |  |  | 30 |
| kit | `packages/design-kit/calendar-day-dial.css:112` |  | `.dd-toast` | absolute |  | var(--space-6) | var(--space-6) |  | 20 |
| kit | `packages/design-kit/calendar-day-dial.css:113` |  | `.dd-toast::before` | absolute | 12px |  |  | 14px |  |
| kit | `packages/design-kit/calendar-day-dial.css:115` |  | `.dd-sr` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/calendar-day-dial.css:241` |  | `.dd-watch__front,.dd-watch__back` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/calendar-mobile-day.css:392` | @media (max-width: 720px) | `.hub-calendar__fab` | absolute |  | var(--space-4) | var(--space-4) |  | 5 |
| kit | `packages/design-kit/calendar-term-river-rows.css:7` |  | `.tr-rows__label` | sticky |  |  |  | 0 | 2 |
| kit | `packages/design-kit/calendar-term-river-rows.css:33` |  | `.tr-rows__bar` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/calendar-term-river-rows.css:46` |  | `.tr-rows-tooltip` | fixed |  |  |  |  | 1000 |
| kit | `packages/design-kit/calendar-term-river.css:84` |  | `.tr-pop` | absolute |  |  |  |  | 30 |
| kit | `packages/design-kit/calendar-term-river.css:97` |  | `.tr-toast` | absolute |  | var(--space-6) | var(--space-6) |  | 20 |
| kit | `packages/design-kit/calendar-term-river.css:98` |  | `.tr-toast::before` | absolute | 12px |  |  | 14px |  |
| kit | `packages/design-kit/calendar-term-river.css:100` |  | `.tr-sr` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/calendar-term-river.css:128` | @media(max-width:719px) | `.tr-pop,.tr-pop.cal-pop--card` | fixed | auto | var(--space-3) | calc(4.65rem + env(safe-area-inset-bottom,0px) + var(--space-2)) | var(--space-3) | 40 |
| kit | `packages/design-kit/calendar-term-river.css:130` | @media(max-width:719px) | `.tr-pop .cal-pop__acts` | sticky |  |  | 0 |  |  |
| kit | `packages/design-kit/calendar-tideline.css:105` |  | `.cal-cap__fill` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:128` |  | `.cal-band` | absolute |  | 0 |  | 0 |  |
| kit | `packages/design-kit/calendar-tideline.css:137` |  | `.cal-sleeplab` | absolute |  | 0 |  | 0 |  |
| kit | `packages/design-kit/calendar-tideline.css:143` |  | `.cal-bg` | absolute |  | 0 |  | 0 |  |
| kit | `packages/design-kit/calendar-tideline.css:146` |  | `.cal-line` | absolute |  | 0 |  | 0 |  |
| kit | `packages/design-kit/calendar-tideline.css:148` |  | `.cal-hour` | absolute |  | 0 |  | 0 |  |
| kit | `packages/design-kit/calendar-tideline.css:150` |  | `.cal-hour span` | absolute | 1px |  |  | 8px |  |
| kit | `packages/design-kit/calendar-tideline.css:151` |  | `.cal-sleep` | absolute |  | 0 |  | 0 |  |
| kit | `packages/design-kit/calendar-tideline.css:153` |  | `.cal-free` | absolute |  | 6px |  | 6px |  |
| kit | `packages/design-kit/calendar-tideline.css:155` |  | `.cal-now` | absolute |  | 0 |  | -5px | 4 |
| kit | `packages/design-kit/calendar-tideline.css:156` |  | `.cal-now::before` | absolute | -5px |  |  | 0 |  |
| kit | `packages/design-kit/calendar-tideline.css:157` |  | `.cal-now span` | absolute | -18px | 4px |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:158` |  | `.cal-wall` | absolute | 0 | 0 |  | 0 | 1 |
| kit | `packages/design-kit/calendar-tideline.css:165` |  | `.cal-chip` | absolute |  | 6px |  | 6px | 2 |
| kit | `packages/design-kit/calendar-tideline.css:178` |  | `.cal-chip::before` | absolute | 0 |  | 0 | 0 |  |
| kit | `packages/design-kit/calendar-tideline.css:187` |  | `.cal-chip__agent` | absolute | 5px | 5px |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:192` |  | `.cal-chip.is-ghost::after` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:203` |  | `.cal-tick::after` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:207` |  | `.cal-tick.is-done::before` | absolute | 1px |  |  | 3.5px |  |
| kit | `packages/design-kit/calendar-tideline.css:214` |  | `.cal-mark::before,.cal-mark::after` | absolute | 0 |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:228` |  | `.cal-pop` | absolute |  |  |  |  | 30 |
| kit | `packages/design-kit/calendar-tideline.css:258` |  | `.cal-toast` | absolute |  | var(--space-6) | var(--space-6) |  | 20 |
| kit | `packages/design-kit/calendar-tideline.css:259` |  | `.cal-toast::before` | absolute | 12px |  |  | 14px |  |
| kit | `packages/design-kit/calendar-tideline.css:263` |  | `.cal-sr` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/calendar-tideline.css:326` |  | `.cal-drag-float` | fixed |  |  |  |  | 1000 |
| kit | `packages/design-kit/calendar-tideline.css:327` |  | `.cal-drag-float__when` | absolute |  |  | calc(100% + 4px) | 0 |  |
| kit | `packages/design-kit/calendar-tideline.css:329` |  | `.cal-chip__grip` | absolute |  | 0 |  | 0 | 2 |
| kit | `packages/design-kit/calendar-tideline.css:332` |  | `.cal-chip__grip::after` | absolute |  |  |  | 50% |  |
| kit | `packages/design-kit/calendar-tideline.css:376` | @media (max-width:719px) | `.cal-pop,.cal-pop.cal-pop--card` | fixed | auto | var(--space-3) | calc(4.65rem + env(safe-area-inset-bottom,0px) + var(--space-2)) | var(--space-3) | 40 |
| kit | `packages/design-kit/calendar-tideline.css:377` | @media (max-width:719px) | `.cal-pop__acts` | sticky |  |  | 0 |  |  |
| kit | `packages/design-kit/calendar-tideline.css:408` |  | `.cal-rescue` | fixed |  |  |  |  | 1000 |
| kit | `packages/design-kit/calendar-tideline.css:464` |  | `.cal-tex` | absolute |  | 0 |  | 0 |  |
| kit | `packages/design-kit/calendar-tideline.css:501` |  | `.cal-deadline` | absolute |  | 6px |  | 6px | 4 |
| kit | `packages/design-kit/calendar.css:669` |  | `.calendar-command` | fixed |  |  |  |  | 40 |
| kit | `packages/design-kit/calendar.css:747` |  | `.hub-calendar__time-corner, .hub-calendar__time-allday-label` | sticky |  |  |  | 0 | 2 |
| kit | `packages/design-kit/calendar.css:762` |  | `.hub-calendar__time-gutter` | sticky |  |  |  | 0 | 2 |
| kit | `packages/design-kit/calendar.css:853` |  | `.event-chip--timed` | absolute |  |  |  |  | 1 |
| kit | `packages/design-kit/calendar.css:863` |  | `.hub-calendar__now` | absolute |  | 0 |  | 0 | 2 |
| kit | `packages/design-kit/calendar.css:874` |  | `.hub-calendar__now::before` | absolute | -0.3rem |  |  | -0.3rem |  |
| kit | `packages/design-kit/chart-info.css:32` |  | `.hub-chart-info::after` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/chart-info.css:49` |  | `.hub-chart-info__note` | fixed |  |  |  |  | 50 |
| kit | `packages/design-kit/filters.css:112` |  | `.hub-pills__thumb` | absolute | 0 |  |  | 0 | 0 |
| kit | `packages/design-kit/filters.css:228` |  | `.hub-menu` | fixed |  |  |  |  | 60 |
| kit | `packages/design-kit/hub-compose.css:9` |  | `.hub-compose .sr-only` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/hub-compose.css:72` |  | `.hub-compose__when` | absolute | 0 | 0 |  | 0 | 2 |
| kit | `packages/design-kit/hub-compose.css:141` |  | `.hub-compose__chip input` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/hub-compose.css:220` |  | `.hub-compose__schedule` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/hub-interactions.css:14` |  | `.hub-toast` | fixed |  |  | var(--space-6) | 50% | 80 |
| kit | `packages/design-kit/hub-interactions.css:377` |  | `.hub-command` | fixed |  |  |  |  | 70 |
| kit | `packages/design-kit/hub-interactions.css:590` |  | `.hub-scroll-island` | sticky |  |  | var(--space-4) |  | 5 |
| kit | `packages/design-kit/hub-interactions.css:878` |  | `.prod-card__ghost-block` | absolute |  | 0 |  | 0 |  |
| kit | `packages/design-kit/hub-interactions.css:1094` |  | `.hub-calendar__protected-bg` | absolute |  | 0 |  | 0 | 0 |
| kit | `packages/design-kit/hub-list.css:170` |  | `.hub-list__gap::before` | absolute | 50% | var(--space-8) |  | var(--space-8) |  |
| kit | `packages/design-kit/hub-list.css:181` |  | `.hub-list__insert` | absolute | 50% |  |  | 50% | 2 |
| kit | `packages/design-kit/hub-list.css:272` |  | `.hub-list--items > .hub-list__row + .hub-list__gap + .hub-list__row::before` | absolute | calc(-1 * var(--space-1) - 0.5px) | var(--space-8) |  | var(--space-8) |  |
| kit | `packages/design-kit/hub-list.css:391` |  | `.hub-action-menu` | fixed |  |  |  |  | 80 |
| kit | `packages/design-kit/hub-list.css:484` |  | `.hub-action-menu__item--hold::before` | absolute |  |  |  |  | 0 |
| kit | `packages/design-kit/hub-list.css:837` |  | `.block-editor__table-column-menu` | absolute | 50% | var(--space-1) |  |  |  |
| kit | `packages/design-kit/hub-list.css:911` |  | `.lesson-page__block > .lesson-page__block-menu.hub-list__more` | absolute | var(--space-4) | var(--space-2) |  |  | 2 |
| kit | `packages/design-kit/hub-pdf-viewer.css:5` |  | `.hub-pdf-viewer` | fixed |  |  |  |  | 80 |
| kit | `packages/design-kit/hub-pdf-viewer.css:53` |  | `.hub-pdf-viewer__text` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/hub-pdf-viewer.css:63` |  | `.hub-pdf-viewer__text span` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/hub-places-map.css:14` |  | `.hub-places-map__canvas` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/mobile.css:26` |  | `.hub-more-sheet__panel` | fixed |  |  |  |  | 40 |
| kit | `packages/design-kit/mobile.css:140` | @media (max-width: 720px) | `.hub-mobile-nav` | fixed |  |  |  |  | 30 |
| kit | `packages/design-kit/morphing-popover.css:43` |  | `.morphing-popover__panel.is-floating` | fixed |  |  |  |  | 60 |
| kit | `packages/design-kit/motion.css:51` |  | `.hub-count__fx` | absolute | 0 |  |  | 0 |  |
| kit | `packages/design-kit/motion.css:110` |  | `.hub-kinetic__sr` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/motion.css:202` |  | `.hub-morph-dialog` | fixed |  |  |  |  | 45 |
| kit | `packages/design-kit/motion.css:232` |  | `.hub-morph-dialog__close` | absolute | var(--space-3) | var(--space-3) |  |  | 2 |
| kit | `packages/design-kit/view-on-map.css:33` |  | `.view-on-map__trigger-bg` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/view-on-map.css:95` |  | `.view-on-map__media` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/view-on-map.css:114` |  | `.view-on-map__loading` | absolute |  |  |  |  |  |
| kit | `packages/design-kit/view-on-map.css:122` |  | `.view-on-map__loading .visually-hidden` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/protocols/style.css:5` |  | `.protocol-library::before` | absolute |  |  |  |  | -1 |
| knowledge | `apps/knowledge/src/protocols/style.css:13` |  | `.protocol-card__front,.protocol-card__back` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/protocols/style.css:14` |  | `.protocol-card__back-media` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/protocols/style.css:17` |  | `.protocol-card__front .agent-protocol-pills__tip, .protocol-card__voice .agent-protocol-pills__tip, .protocol-portrait .agent-protocol-pills__tip` | absolute |  |  |  |  | 5 |
| knowledge | `apps/knowledge/src/protocols/style.css:24` |  | `.protocol-card__front::before,.protocol-card__back::before` | absolute |  |  |  |  | 1 |
| knowledge | `apps/knowledge/src/protocols/style.css:25` |  | `.protocol-card__front::after` | absolute |  |  |  |  | 0 |
| knowledge | `apps/knowledge/src/protocols/style.css:26` |  | `.protocol-card__front-art` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/protocols/style.css:29` |  | `.protocol-card__corner` | absolute | var(--space-5) | var(--space-5) |  |  |  |
| knowledge | `apps/knowledge/src/protocols/style.css:34` |  | `.protocol-card__back::after` | absolute |  |  |  |  | 0 |
| knowledge | `apps/knowledge/src/protocols/style.css:44` |  | `.protocol-bg` | absolute |  |  |  |  | -2 |
| knowledge | `apps/knowledge/src/protocols/style.css:45` |  | `.protocol-bg__layer` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/protocols/style.css:47` |  | `.protocol-intake::before` | absolute |  |  |  |  | -2 |
| knowledge | `apps/knowledge/src/protocols/style.css:48` |  | `.protocol-session:not(:has(.protocol-bg))::before` | absolute |  |  |  |  | -2 |
| knowledge | `apps/knowledge/src/protocols/style.css:49` |  | `.protocol-intake::after,.protocol-session::after` | absolute |  |  |  |  | -1 |
| knowledge | `apps/knowledge/src/protocols/style.css:103` |  | `.protocol-reply__visually-hidden` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:46` |  | `.shelf-tools__menu` | absolute | calc(100% + var(--space-2)) | 0 |  |  | 20 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:101` |  | `.shelf-reading-pop__panel` | absolute | calc(100% + var(--space-2)) | 0 |  |  | 20 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:113` |  | `.shelf-reading-pop__panel::before` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:154` |  | `.shelf-row::after` | absolute |  | 0 | -15px | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:164` |  | `.shelf-plaque` | absolute |  |  | -2.1rem |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:206` |  | `.shelf-book::before` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:223` |  | `.shelf-book__title` | absolute | -14px | var(--space-2) |  | var(--space-2) |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:239` |  | `.shelf-book__empty` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:249` |  | `.shelf-mark` | absolute |  | 7% |  | 7% |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:277` |  | `.shelf-ribbon` | absolute |  | -14px |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:287` |  | `.shelf-slips` | absolute | -27px | 12px |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:310` |  | `.shelf-threads` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:317` |  | `.shelf-tip` | absolute |  |  |  |  | 5 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:457` |  | `.descent` | fixed |  |  |  |  | 20 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:468` |  | `.descent__bar` | sticky | 0 |  |  |  | 4 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:562` |  | `.descent__strip` | sticky | 6.5rem |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:573` |  | `.descent__strip i` | absolute |  | 5px |  | 5px |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:581` |  | `.descent__bracket` | absolute |  | -7px |  | -7px |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:590` |  | `.descent__unread` | absolute |  | 0 | 0 | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:598` |  | `.descent__strip-note` | absolute |  |  |  | calc(100% + var(--space-3)) |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:607` |  | `.descent__chapter` | absolute |  | 0 |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:655` |  | `.descent__band` | absolute |  | 0 |  | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:663` |  | `.descent__band::after` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:669` |  | `.descent__tick` | absolute |  | -6px |  | -6px | 1 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:684` |  | `.descent__ruler` | absolute |  |  |  | var(--space-1) | 2 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:695` |  | `.descent__links` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:702` |  | `.descent-note` | absolute |  | 0 |  | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:852` |  | `.descent__col .descent-exit` | absolute |  | 0 |  | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:931` |  | `.shelf-sheet-backdrop` | fixed |  |  |  |  | 40 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1059` |  | `.place-edge__chapter` | absolute | 0 |  | 0 |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1070` |  | `.place-edge__mark` | absolute | 6px |  | 6px |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1079` |  | `.place-edge__pin` | absolute | -12px |  | -12px |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1089` |  | `.place-edge input[type="range"]` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1377` |  | `.atlas` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1395` |  | `.atlas__viewport` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1414` |  | `.atlas__land` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1420` |  | `.atlas__terrain` | absolute | 0 |  |  | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1428` |  | `.atlas__drawing` | absolute | 45% |  |  | 50% |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1438` |  | `.atlas__lines, .atlas__marks` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1478` |  | `.atlas-route-label` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1503` |  | `.atlas-province` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1532` |  | `.atlas-fog` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1563` |  | `.atlas-town` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1576` |  | `.atlas-town > i` | absolute | 50% |  |  | 50% |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1623` |  | `.atlas-town__label` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1640` |  | `.atlas__controls` | absolute | var(--space-4) | var(--space-4) |  |  | 3 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1670` |  | `.atlas__legend` | absolute |  |  | var(--space-4) | var(--space-4) |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1722` |  | `.atlas__card` | absolute | var(--space-4) | calc(var(--space-4) + 3.5rem) |  |  | 3 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1756` |  | `.atlas__card-close` | absolute | var(--space-2) | var(--space-2) |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1879` |  | `.shelf-cover::after` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1888` |  | `.shelf-cover__made` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1926` |  | `.shelf-cover__count` | absolute | var(--space-2) | var(--space-2) |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1947` |  | `.shelf-cover__progress` | absolute |  | 0 | 0 | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1962` |  | `.shelf-cover__loose` | absolute |  |  | var(--space-3) | calc(var(--space-2) + 6px) |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1988` |  | `.book-turn` | fixed |  |  |  |  | 60 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:1996` |  | `.book-turn__card` | absolute | 0 |  |  | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2004` |  | `.book-turn__face` | absolute | 0 |  |  | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2015` |  | `.book-open` | fixed |  |  |  |  | 70 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2029` |  | `.book-open__book` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2034` |  | `.book-open__pages` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2076` |  | `.isles-island` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2089` |  | `.isles-island::before` | absolute | calc(var(--r) * -0.85) |  |  | calc(var(--r) * -0.85) |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2112` |  | `.isles-island__label` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2149` |  | `.isles-sea` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2181` |  | `.isles-route-count` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2325` |  | `.isles .atlas__card .descent-note__actions` | sticky |  |  | calc(var(--space-5) * -1) |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2336` |  | `.atlas.is-expanded` | fixed |  |  |  |  | 60 |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2354` |  | `.atlas__viewport::before` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2370` |  | `.atlas__surf` | absolute | 0 |  |  | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2385` |  | `.atlas__sky` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2392` |  | `.atlas__sky i` | absolute |  |  |  | -28rem |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2405` |  | `.atlas__sky i::after` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2489` |  | `.atlas__world` | absolute | 0 |  |  | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2532` |  | `.sl-ship` | absolute | 0 |  |  | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2570` |  | `.sl-beast` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2595` |  | `.sl-ripple` | absolute |  | 10% | -6% | 10% |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2614` |  | `.sl-compass` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2632` |  | `.sl-legend` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2645` |  | `.atlas__tide, .atlas__stars` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2681` |  | `.atlas__stars i` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2725` |  | `.sl-mark` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2760` |  | `.sl-lobster` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2796` |  | `.sl-lamp, .sl-beam, .sl-glow` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2870` |  | `.sl-smoke` | absolute | 0 |  |  | 30% |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2896` |  | `.sl-mist` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2904` |  | `.sl-mist i` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2935` |  | `.sl-lantern-glow` | absolute | 70% |  |  | 50% |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2974` |  | `.sl-puff, .sl-splash` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2980` |  | `.sl-puff i` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:2998` |  | `.sl-splash i` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3016` |  | `.sl-leap` | absolute | 0 |  |  | 0 |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3047` |  | `.sl-whirl` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3063` |  | `.sl-bottle` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3074` |  | `.sl-glint` | absolute | -20% |  |  | 30% |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3100` |  | `.atlas__air` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3107` |  | `.sl-gulls` | absolute |  |  |  | -12% |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3148` |  | `.sl-shooting` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3166` |  | `.sl-squall` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3182` |  | `.sl-cloud` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3197` |  | `.sl-rain` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3210` |  | `.sl-bolt` | absolute | 46% |  |  | 46% |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3229` |  | `.sl-kraken-rise` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3234` |  | `.sl-kraken-pool` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3250` |  | `.sl-kraken-window` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3340` |  | `.sl-engraving::before, .sl-engraving::after` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/bookshelf.css:3367` |  | `.sl-pennant` | absolute | -6% |  |  | 48% | 1 |
| knowledge | `apps/knowledge/src/shelf/wireless.css:51` |  | `.wl-band` | absolute |  |  | 0.35rem |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:94` |  | `.wl-track` | absolute |  |  |  |  | 2 |
| knowledge | `apps/knowledge/src/shelf/wireless.css:101` |  | `.wl-spines` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:107` |  | `.wl-spine` | absolute |  |  | 0 |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:130` |  | `.wl-spine::after` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:162` |  | `.wl-scale` | absolute |  | 0 | 0 | 0 |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:171` |  | `.wl-tick` | absolute | 0 |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:185` |  | `.wl-num` | absolute | 1.6rem |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:195` |  | `.wl-unit` | absolute |  | var(--space-3) | var(--space-3) |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:204` |  | `.wl-static` | absolute |  |  |  |  | 1 |
| knowledge | `apps/knowledge/src/shelf/wireless.css:227` |  | `.wl-needle` | absolute | 0 |  | 0 |  | 3 |
| knowledge | `apps/knowledge/src/shelf/wireless.css:239` |  | `.wl-flag` | absolute | var(--space-4) |  |  | var(--space-2) |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:289` |  | `.wl-knob::after` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:301` |  | `.wl-knob i` | absolute |  |  |  |  | 1 |
| knowledge | `apps/knowledge/src/shelf/wireless.css:309` |  | `.wl-knob i::before` | absolute | 22% |  |  | calc(50% - 1.5px) |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:509` |  | `.wl-mini__book` | absolute | 0.55rem |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:533` |  | `.wl-mini__needle` | absolute | 0 |  | 0 |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:543` |  | `.wl-mini__nums` | absolute |  | 0 | 0.3rem | 0 |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:553` |  | `.wl-mini__nums span` | absolute | 0.1rem |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:663` |  | `.wl-wave__labels` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:669` |  | `.wl-wave__labels span` | absolute | 0 |  |  |  |  |
| knowledge | `apps/knowledge/src/shelf/wireless.css:681` |  | `.wl-wave__head` | absolute | 1.25rem |  | 0 |  |  |
| knowledge | `apps/knowledge/src/studio/studio.css:63` |  | `.studio-shelf::after` | absolute |  | calc(var(--space-4) * -1) | -14px | calc(var(--space-4) * -1) |  |
| knowledge | `apps/knowledge/src/studio/studio.css:70` |  | `.studio-shelf__label` | absolute | 100% |  |  | 0 |  |
| knowledge | `apps/knowledge/src/studio/studio.css:77` |  | `.studio-shelf__bracket` | absolute | -1.6rem | 0 |  | 0 |  |
| knowledge | `apps/knowledge/src/studio/studio.css:81` |  | `.studio-shelf__bracket span` | absolute | -1.05rem |  |  | 50% |  |
| knowledge | `apps/knowledge/src/studio/studio.css:100` |  | `.studio-spine__ink` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/studio/studio.css:105` |  | `.studio-spine__ink::before` | absolute | 0 | 0 |  | 0 |  |
| knowledge | `apps/knowledge/src/studio/studio.css:111` |  | `.studio-spine[aria-pressed="true"]::before` | absolute | -12px |  |  | 50% |  |
| knowledge | `apps/knowledge/src/studio/studio.css:268` |  | `.studio-ch__xref` | absolute | 6px | 6px |  |  |  |
| knowledge | `apps/knowledge/src/style.css:16` |  | `.rail` | sticky | 0 |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:374` |  | `.list-window` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:776` |  | `.sr-only` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:853` |  | `.agent-protocol-pills__tip` | absolute | calc(100% + 0.5rem) |  |  | 0 | 30 |
| knowledge | `apps/knowledge/src/style.css:1329` |  | `.graph-wrap.is-universe-fullscreen:has([data-universe-key]) .graph-chrome` | absolute | var(--space-4) |  |  | var(--space-4) | 6 |
| knowledge | `apps/knowledge/src/style.css:1357` |  | `.graph-wrap.is-universe-fullscreen` | fixed |  |  |  |  | 20 |
| knowledge | `apps/knowledge/src/style.css:1397` |  | `.graph-wrap.is-universe-fullscreen .graph-chrome-token` | absolute | var(--space-4) |  |  | var(--space-4) | 7 |
| knowledge | `apps/knowledge/src/style.css:1509` |  | `.graph-toolbar` | absolute | var(--space-4) |  |  | var(--space-4) | 2 |
| knowledge | `apps/knowledge/src/style.css:1603` |  | `.graph-preview` | absolute |  |  | var(--space-4) | var(--space-4) | 4 |
| knowledge | `apps/knowledge/src/style.css:1665` |  | `.graph-tip` | absolute |  |  |  |  | 3 |
| knowledge | `apps/knowledge/src/style.css:1679` |  | `.universe-key` | absolute |  | var(--space-4) | var(--space-4) |  | 5 |
| knowledge | `apps/knowledge/src/style.css:1880` |  | `.universe-key__swatch--ringed::after, .universe-key__swatch--giant::after` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:1946` |  | `.toast` | fixed |  |  | 1.5rem | 50% | 20 |
| knowledge | `apps/knowledge/src/style.css:2343` | @media (max-width: 720px) | `html.vv-keyboard-open .canvas:has(> .compose)` | fixed | var(--vv-offset-top, 0px) | 0 |  | 0 | 40 |
| knowledge | `apps/knowledge/src/style.css:2433` | @media (max-width: 720px) | `.universe-zoom` | absolute | calc(var(--space-2) + 3.2rem) | var(--space-2) |  |  | 4 |
| knowledge | `apps/knowledge/src/style.css:2517` | @media (max-width: 720px) | `.coach.chat > .chat-floor` | fixed |  | 0 | calc(5.5rem + env(safe-area-inset-bottom, 0px)) | 0 | 3 |
| knowledge | `apps/knowledge/src/style.css:2774` |  | `.dump-map, .dump-svg` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:2784` |  | `.dump-node` | absolute |  |  |  |  | 2 |
| knowledge | `apps/knowledge/src/style.css:2806` |  | `.dump-hint` | absolute |  |  | 0.75rem | 50% |  |
| knowledge | `apps/knowledge/src/style.css:2817` |  | `.dump-report` | absolute | 0 | 0 | 0 |  | 3 |
| knowledge | `apps/knowledge/src/style.css:2924` |  | `.understand__board-svg` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:2937` |  | `.understand__node` | absolute |  |  |  |  | 1 |
| knowledge | `apps/knowledge/src/style.css:2944` |  | `.dump-peek` | absolute |  |  |  |  | 2 |
| knowledge | `apps/knowledge/src/style.css:3014` |  | `.compose__hidden-file` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:3408` |  | `.floating-chat-button` | fixed |  | 1.5rem | 1.5rem |  | 30 |
| knowledge | `apps/knowledge/src/style.css:3434` |  | `.chat-overlay` | fixed |  | 1.5rem | 5.6rem |  | 25 |
| knowledge | `apps/knowledge/src/style.css:3991` |  | `.uni-tl__axis` | sticky | 0 |  |  |  | 2 |
| knowledge | `apps/knowledge/src/style.css:4000` |  | `.uni-tl__tick` | absolute | 0.4rem |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4031` |  | `.uni-tl__degree, .uni-tl__unit, .uni-tl__assessment` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4085` |  | `.uni-tl__units, .uni-tl__assessments` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4140` |  | `.uni-tl__card` | absolute |  | var(--space-4) | var(--space-4) |  | 4 |
| knowledge | `apps/knowledge/src/style.css:4169` |  | `.gpa-chip` | absolute | var(--space-2) | var(--space-2) |  |  | 5 |
| knowledge | `apps/knowledge/src/style.css:4328` |  | `.nb-card__image, .nb-open__image` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4344` |  | `.nb-card__copy, .nb-open__copy` | absolute |  |  |  |  | 1 |
| knowledge | `apps/knowledge/src/style.css:4550` |  | `.stars-root .sr-only` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4628` |  | `.stars-symbol__canvas, .stars-sky__canvas, .stars-symbol__nodes, .stars-sky__objects` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4638` |  | `.stars-sky__camera` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:4652` |  | `.stars-node` | absolute |  |  |  |  | 2 |
| knowledge | `apps/knowledge/src/style.css:4698` |  | `.stars-popover` | absolute |  |  |  |  | 5 |
| knowledge | `apps/knowledge/src/style.css:4947` |  | `.stars-working__sky span` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5000` |  | `.stars-empty` | absolute | 50% |  |  | 50% | 3 |
| knowledge | `apps/knowledge/src/style.css:5069` |  | `.stars-sky-toolbar` | absolute |  |  |  |  | 5 |
| knowledge | `apps/knowledge/src/style.css:5095` |  | `.stars-fullscreen-exit` | absolute | var(--space-4) | var(--space-4) |  |  | 6 |
| knowledge | `apps/knowledge/src/style.css:5106` |  | `.stars-sky-wrap.is-fullscreen` | fixed |  |  |  |  | 30 |
| knowledge | `apps/knowledge/src/style.css:5117` |  | `.stars-sky-wrap.is-fullscreen .stars-sky-toolbar` | absolute | var(--space-4) | calc(var(--space-4) + 6.5rem) |  | var(--space-4) | 6 |
| knowledge | `apps/knowledge/src/style.css:5138` |  | `.stars-sky-wrap.is-fullscreen .stars-horizon-row` | absolute |  | var(--space-4) | var(--space-4) | var(--space-4) | 6 |
| knowledge | `apps/knowledge/src/style.css:5255` |  | `.stars-sky` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5260` |  | `.stars-panorama__canvas` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5273` |  | `.stars-panorama__hits` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5279` |  | `.stars-panorama__hit` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5304` |  | `.stars-horizon-row` | absolute |  | 16px | 16px | 16px | 5 |
| knowledge | `apps/knowledge/src/style.css:5323` |  | `.stars-horizon__track` | absolute | 50% | 18px |  | 18px |  |
| knowledge | `apps/knowledge/src/style.css:5333` |  | `.stars-horizon__ticks` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5338` |  | `.stars-horizon__tick` | absolute | 10px |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5346` |  | `.stars-horizon__marker` | absolute | 50% |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5368` |  | `.stars-horizon__label` | absolute |  |  | 100% | 50% |  |
| knowledge | `apps/knowledge/src/style.css:5403` |  | `.universe-key__swatch--comet .universe-key__dot::after` | absolute | 0.08rem | 0.24rem |  |  |  |
| knowledge | `apps/knowledge/src/style.css:5451` |  | `.universe-replay` | absolute |  | 0 | var(--space-4) | 0 | 3 |
| knowledge | `apps/knowledge/src/style.css:5641` |  | `.universe-side` | absolute | 8.5rem | var(--space-4) | 4.5rem |  | 4 |
| knowledge | `apps/knowledge/src/style.css:5929` |  | `.universe-exits` | absolute |  |  |  |  | 5 |
| knowledge | `apps/knowledge/src/style.css:5936` |  | `.universe-exit-arrow` | absolute |  |  |  |  |  |
| knowledge | `apps/knowledge/src/style.css:6000` | @media (max-width: 720px) | `.universe-orrery` | absolute | calc(var(--space-2) + 9.2rem) | var(--space-2) |  |  | 5 |
| knowledge | `apps/knowledge/src/style.css:6065` | @media (max-width: 720px) | `.universe-system` | absolute | calc(var(--space-2) + 3.25rem) | calc(var(--space-2) + 3.25rem) |  | var(--space-2) | 5 |
| knowledge | `apps/knowledge/src/style.css:6104` |  | `.neural-dock` | absolute | 0 | var(--space-3) |  |  | 3 |
| knowledge | `apps/knowledge/src/tokens.css:59` |  | `body::before` | fixed |  |  |  |  | -1 |
| life | `apps/life/css/aesthetics.css:77` |  | `.aes-stage::after` | absolute |  |  |  |  |  |
| life | `apps/life/css/aesthetics.css:101` |  | `.aes-mist` | absolute | -120px |  |  | -140px |  |
| life | `apps/life/css/aesthetics.css:117` |  | `.aes-toast` | absolute | var(--space-4) |  |  | 50% | 3 |
| life | `apps/life/css/aesthetics.css:136` |  | `.aes-ribbon__hours` | absolute |  | 0 | -1.3rem | 0 |  |
| life | `apps/life/css/aesthetics.css:137` |  | `.aes-ribbon__hours span` | absolute |  |  |  |  |  |
| life | `apps/life/css/aesthetics.css:138` |  | `.aes-band` | absolute | 0.9rem |  |  |  |  |
| life | `apps/life/css/aesthetics.css:143` |  | `.aes-ev` | absolute | -2.3rem |  |  |  |  |
| life | `apps/life/css/aesthetics.css:334` |  | `.aes-combo__join-ring` | absolute |  |  |  |  |  |
| life | `apps/life/css/aesthetics.css:410` |  | `.aes-dial b` | absolute |  |  |  |  |  |
| life | `apps/life/css/aesthetics.css:449` |  | `.aes-snap__swatch` | absolute |  | 6px | 6px |  |  |
| life | `apps/life/css/app.css:80` |  | `.skip-link` | fixed | 1rem |  |  | 1rem | 100 |
| life | `apps/life/css/app.css:94` |  | `.sr-only` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:122` |  | `.desktop-rail` | fixed |  |  |  |  | 10 |
| life | `apps/life/css/app.css:428` |  | `.now-day__past` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:429` |  | `.now-day__empty` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:430` |  | `.now-block` | absolute | calc(0.375rem + var(--lane, 0) * var(--now-lane-h)) |  |  |  |  |
| life | `apps/life/css/app.css:453` |  | `.now-pin` | absolute |  |  | 0.3rem |  |  |
| life | `apps/life/css/app.css:454` |  | `.now-line` | absolute | -0.35rem |  | 0 |  |  |
| life | `apps/life/css/app.css:456` |  | `.now-line::before` | absolute | -1.1rem |  |  | 50% |  |
| life | `apps/life/css/app.css:467` |  | `.now-day__hours span` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:740` |  | `.meal-history__date` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:741` |  | `.meal-history__date::-webkit-calendar-picker-indicator` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:899` |  | `.more-sheet-retired__panel` | fixed |  |  |  |  |  |
| life | `apps/life/css/app.css:2112` |  | `#fitness-dashboard [data-role="fitness-tip"]` | fixed |  |  |  |  | 20 |
| life | `apps/life/css/app.css:3078` |  | `.gym` | fixed |  |  |  |  | 90 |
| life | `apps/life/css/app.css:3545` |  | `.gym-sheet` | absolute |  |  |  |  | 2 |
| life | `apps/life/css/app.css:3910` |  | `.gym-hero__art` | absolute |  |  |  |  | -2 |
| life | `apps/life/css/app.css:3920` |  | `.gym-hero::after` | absolute |  |  |  |  | -1 |
| life | `apps/life/css/app.css:3926` |  | `.gym-hero__glow` | absolute |  |  |  |  | -1 |
| life | `apps/life/css/app.css:3935` |  | `.gym-hero__meter` | absolute | 0.9rem | 1rem |  |  |  |
| life | `apps/life/css/app.css:3978` |  | `.gym-split__art` | absolute |  |  |  |  | -2 |
| life | `apps/life/css/app.css:3980` |  | `.gym-split .gym-block__member::after` | absolute |  |  |  |  | -1 |
| life | `apps/life/css/app.css:3986` |  | `.gym-split .gym-block__code` | absolute | 0.5rem |  |  | 0.5rem | 1 |
| life | `apps/life/css/app.css:4015` |  | `.gym-round__thumb .gym-art` | absolute |  |  |  |  | -1 |
| life | `apps/life/css/app.css:4020` |  | `.gym-moment__art` | absolute |  |  |  |  | -2 |
| life | `apps/life/css/app.css:4028` |  | `.gym-moment__spark` | absolute |  |  |  |  | -1 |
| life | `apps/life/css/app.css:4052` |  | `.pump__art` | absolute |  |  |  |  | -2 |
| life | `apps/life/css/app.css:4053` |  | `.pump__hero--art::after` | absolute |  |  |  |  | -1 |
| life | `apps/life/css/app.css:4285` |  | `.skincare-product-pill__menu-panel` | absolute | calc(100% + 0.25rem) | 0 |  |  | 2 |
| life | `apps/life/css/app.css:5275` |  | `.bloods-ticks__item` | absolute | 0 |  |  |  |  |
| life | `apps/life/css/app.css:5286` |  | `.bloods-point-note` | absolute |  |  |  |  | 3 |
| life | `apps/life/css/app.css:5306` |  | `.bloods-point-note::after` | absolute |  |  | -0.25rem | 50% |  |
| life | `apps/life/css/app.css:5883` |  | `.bloods-explainer` | fixed |  |  |  |  | 40 |
| life | `apps/life/css/app.css:5924` |  | `.visually-hidden` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:6070` |  | `.agent-protocol-pills__tip` | absolute | calc(100% + var(--space-2)) |  |  | 0 | 30 |
| life | `apps/life/css/app.css:6491` |  | `.mind-factor__rail::before` | absolute | -3px |  | -3px | 50% |  |
| life | `apps/life/css/app.css:6499` |  | `.mind-factor-fill` | absolute | 0 |  |  |  |  |
| life | `apps/life/css/app.css:6522` |  | `.mind-thread-sheet:not([hidden])` | absolute |  |  |  |  | 4 |
| life | `apps/life/css/app.css:6535` |  | `.mind-thread-sheet [data-role="scrim"]` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:6656` |  | `.mind-mood-mix__center` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:6941` |  | `.mind-energy-orbit__center` | absolute | 50% |  |  | 50% |  |
| life | `apps/life/css/app.css:7156` |  | `.mind-metric-strip__axis-tick` | absolute | 0 |  |  |  |  |
| life | `apps/life/css/app.css:7162` |  | `.mind-metric-strip__tooltip` | absolute |  |  |  |  | 3 |
| life | `apps/life/css/app.css:7325` |  | `.mind-constellation__tooltip` | absolute |  |  |  |  | 3 |
| life | `apps/life/css/app.css:7415` |  | `.mind-bump__tooltip` | absolute |  |  |  |  | 3 |
| life | `apps/life/css/app.css:7546` |  | `.mind-stream__tooltip` | absolute |  |  |  |  | 3 |
| life | `apps/life/css/app.css:7661` |  | `.mind-theme-orbit__core-label` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:7806` |  | `.mind-insight-timeline::before` | absolute | 0.2rem |  | 0.2rem | 0.28rem |  |
| life | `apps/life/css/app.css:7819` |  | `.mind-insight::before` | absolute | 0.35rem |  |  | -1.1rem |  |
| life | `apps/life/css/app.css:8132` |  | `.floating-chat-button` | fixed |  | 1.5rem | 1.5rem |  | 30 |
| life | `apps/life/css/app.css:8148` |  | `.cn-audit-button` | fixed |  | 5.2rem | 1.5rem |  | 30 |
| life | `apps/life/css/app.css:8171` |  | `.floating-chat-button.has-unread::after, [data-section="chat"].has-unread::after` | absolute | 0.3rem | 0.35rem |  |  |  |
| life | `apps/life/css/app.css:8281` |  | `.chat-view[data-panel-mode="overlay"]` | fixed |  |  |  |  | 25 |
| life | `apps/life/css/app.css:8344` | @media (max-width: 720px) | `.app-shell:has(#chat-view:not([hidden]):not([data-panel-mode])) .page-frame` | fixed | 0 | 0 |  | 0 | 20 |
| life | `apps/life/css/app.css:8730` |  | `.mind-watchlist__tooltip` | absolute |  |  |  |  | 3 |
| life | `apps/life/css/app.css:9137` |  | `.medical-timeline::before` | absolute | var(--space-2) |  | var(--space-2) | var(--medical-spine) |  |
| life | `apps/life/css/app.css:9168` |  | `.medical-today::before, .medical-year::before, .medical-card::before, .medical-minor::before, .medical-band::before` | absolute | 1rem |  |  | calc((var(--medical-gutter) * -1) + var(--medical-spine) - (var(--medical-dot) / 2) + 0.5px) |  |
| life | `apps/life/css/app.css:9467` |  | `.medical-sheet` | sticky | 1rem |  |  |  |  |
| life | `apps/life/css/app.css:9561` | @media (max-width: 40rem) | `.medical-sheet` | fixed |  |  |  |  | 30 |
| life | `apps/life/css/app.css:9596` | @media (max-width: 40rem) | `.medical-sheet:not([hidden]) + .medical-sheet__close, #body-medical-dashboard:has(#medical-sheet:not([hidden])) .medical-sheet__close` | fixed | calc(8vh + 0.6rem) | 1.6rem |  |  | 31 |
| life | `apps/life/css/app.css:9711` |  | `.hub-map__world` | absolute | 0 |  |  | 0 |  |
| life | `apps/life/css/app.css:9712` |  | `.hub-map__edges` | absolute | 0 |  |  | 0 |  |
| life | `apps/life/css/app.css:9713` |  | `.hub-map__nodes` | absolute | 0 |  |  | 0 |  |
| life | `apps/life/css/app.css:9714` |  | `.hub-map__zoom` | absolute |  | var(--space-3) | var(--space-3) |  |  |
| life | `apps/life/css/app.css:9743` |  | `.hub-map-card` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:9775` |  | `.hub-map-card__toggle` | absolute | 50% | -0.9rem |  |  |  |
| life | `apps/life/css/app.css:9862` |  | `.hc-tip` | absolute | 0 |  |  | 0 | 5 |
| life | `apps/life/css/app.css:10258` |  | `.protein-climb__empty` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:10358` |  | `.week-grid__plot` | absolute |  |  |  |  |  |
| life | `apps/life/css/app.css:10359` |  | `.week-grid__bar` | absolute |  | 24% | 0 | 24% |  |
| life | `apps/life/css/app.css:10364` |  | `.week-grid__value` | absolute |  | 0 | calc(var(--pct) + 2px) | 0 |  |
| life | `apps/life/css/app.css:10365` |  | `.week-grid__target` | absolute |  | 0 | var(--target) | 0 |  |
| life | `apps/life/css/app.css:10381` |  | `.consistency-strip__goal` | absolute |  | 0 | var(--pct) | 0 |  |
| life | `apps/life/css/garage-home.css:22` |  | `.gh-bar` | sticky | env(safe-area-inset-top, 0px) |  |  |  | 5 |
| life | `apps/life/css/garage-home.css:189` |  | `.gh-sheet__panel` | fixed |  |  |  |  |  |
| life | `apps/life/css/garage-home.css:213` |  | `.gh-switch i::after` | absolute | 3px |  |  | 3px |  |
| life | `apps/life/css/property.css:5` |  | `#property-dashboard .prop-sr` | absolute |  |  |  |  |  |
| life | `apps/life/css/property.css:31` |  | `.prop-lens` | sticky | env(safe-area-inset-top, 0px) |  |  |  | 5 |
| life | `apps/life/css/property.css:278` |  | `.prop-sheet__panel` | fixed |  |  |  |  |  |
| professional | `apps/professional/src/styles/block-page.css:43` |  | `.page-editor__insert` | absolute | calc(100% + var(--space-2)) |  |  | 50% | 20 |
| professional | `apps/professional/src/styles/comm-page.css:392` |  | `.switch::after` | absolute | 2px |  |  | 2px |  |
| professional | `apps/professional/src/styles/event-page.css:83` |  | `.series__gap` | absolute | 50% | -1px |  |  | 2 |
| professional | `apps/professional/src/styles/hub.css:3` |  | `.skip-link` | absolute | 0.75rem |  |  | 0.75rem | 200 |
| professional | `apps/professional/src/styles/hub.css:31` |  | `.hub-rail` | sticky | 0 |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:811` |  | `.schedule-db__sheet` | fixed |  |  |  |  | 40 |
| professional | `apps/professional/src/styles/hub.css:1507` |  | `.miniworld__tip` | absolute |  |  |  |  | 4 |
| professional | `apps/professional/src/styles/hub.css:1532` |  | `.miniworld__zoom` | absolute |  | 14px | 14px |  | 3 |
| professional | `apps/professional/src/styles/hub.css:1565` |  | `.miniworld__hint` | absolute |  |  | 14px | 14px | 3 |
| professional | `apps/professional/src/styles/hub.css:1577` |  | `.miniworld__panel` | absolute | 14px | 14px |  |  | 5 |
| professional | `apps/professional/src/styles/hub.css:1595` |  | `.miniworld__panel-close` | absolute | 8px | 8px |  |  |  |
| professional | `apps/professional/src/styles/hub.css:1705` |  | `.miniworld__key` | absolute |  |  | 52px | 14px | 4 |
| professional | `apps/professional/src/styles/hub.css:2259` |  | `.pro-home__yearstrip-month` | absolute | 0 |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:2288` |  | `.pro-home__yearstrip-line` | absolute | 0.55rem | 0 |  | 0 |  |
| professional | `apps/professional/src/styles/hub.css:2297` |  | `.pro-home__yearstrip-today` | absolute | 0 |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:2306` |  | `.pro-home__yearstrip-todaylabel` | absolute | 1.25rem |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:2316` |  | `.pro-home__yearstrip-mark` | absolute | 0.55rem |  |  |  | 1 |
| professional | `apps/professional/src/styles/hub.css:2363` |  | `.pro-home__yearstrip-tip` | fixed |  |  |  |  | 20 |
| professional | `apps/professional/src/styles/hub.css:2799` |  | `.event-compose__sr` | absolute |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:3261` |  | `.people-page__menu` | absolute |  |  |  |  | 3 |
| professional | `apps/professional/src/styles/hub.css:3419` |  | `.people-crest__img` | absolute |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:3427` |  | `.people-crest--badge` | absolute |  | -2px | -2px |  |  |
| professional | `apps/professional/src/styles/hub.css:3626` |  | `.people-pane__li-acts` | absolute | 0 | 0 |  |  |  |
| professional | `apps/professional/src/styles/hub.css:3887` |  | `.people-page__sheet` | fixed |  |  |  |  | 40 |
| professional | `apps/professional/src/styles/hub.css:4422` |  | `.orgs-flow__zoom` | sticky | 0 |  |  |  | 1 |
| professional | `apps/professional/src/styles/hub.css:4697` |  | `.orgs-page__sheet` | fixed |  |  |  |  | 40 |
| professional | `apps/professional/src/styles/hub.css:5019` |  | `.career-future__ring::after` | absolute |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:5159` |  | `.career-sheet` | fixed |  |  |  |  | 40 |
| professional | `apps/professional/src/styles/hub.css:5681` |  | `.org-chart` | fixed |  |  |  |  | 60 |
| professional | `apps/professional/src/styles/hub.css:5777` |  | `.org-chart__board` | absolute | 0 |  |  | 0 |  |
| professional | `apps/professional/src/styles/hub.css:5784` |  | `.org-chart__inner` | absolute |  | 0 | 0 |  |  |
| professional | `apps/professional/src/styles/hub.css:5792` |  | `.org-chart__lines` | absolute | 0 |  |  | 0 |  |
| professional | `apps/professional/src/styles/hub.css:5805` |  | `.org-chart__units` | absolute | 0 |  |  | 0 |  |
| professional | `apps/professional/src/styles/hub.css:5811` |  | `.org-chart__unit` | absolute |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:5828` |  | `.org-chart__unit-label` | absolute | 6px | 12px |  | 12px |  |
| professional | `apps/professional/src/styles/hub.css:5861` |  | `.org-chart__unit-empty` | absolute | 44px | 16px |  | 16px |  |
| professional | `apps/professional/src/styles/hub.css:5870` |  | `.org-chart__unit-members` | absolute |  | 12px | 6px | 12px |  |
| professional | `apps/professional/src/styles/hub.css:6001` |  | `.org-chart__boxes` | absolute |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:6013` |  | `.org-chart__box` | absolute |  |  |  |  |  |
| professional | `apps/professional/src/styles/hub.css:6085` |  | `.org-chart__handle` | absolute | 50% | -8px |  |  |  |
| professional | `apps/professional/src/styles/hub.css:6104` |  | `.org-chart__empty` | absolute | 32px |  |  | 32px |  |
| professional | `apps/professional/src/styles/hub.css:6370` | @media (max-width: 719px) | `.people-page .person-editor:not([hidden]) .add-person-form__actions` | fixed |  | var(--space-4) | calc(4.5rem + env(safe-area-inset-bottom, 0px)) | var(--space-4) | 30 |
| professional | `apps/professional/src/styles/hub.css:6389` | @media (max-width: 719px) | `.event-compose__footer` | fixed |  | var(--space-4) | calc(4.5rem + env(safe-area-inset-bottom, 0px)) | var(--space-4) | 30 |
| professional | `apps/professional/src/styles/quick-log.css:112` | @media (max-width: 720px) | `.quick-log` | sticky |  |  | 0 |  |  |
| tasks | `apps/tasks/src/grove-embed/embed.css:19` |  | `.grove-embed__stage` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/grove-embed/embed.css:30` |  | `.grove-embed__caption` | absolute |  |  | 0.75rem | 0.75rem |  |
| tasks | `apps/tasks/src/personal-line/personal-line.css:55` |  | `.pl-net` | absolute | 0 |  |  | 0 |  |
| tasks | `apps/tasks/src/personal-line/personal-line.css:67` |  | `.pl-lbl` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/personal-line/personal-line.css:91` |  | `.pl-scrim` | fixed |  |  |  |  | 1000 |
| tasks | `apps/tasks/src/personal-line/personal-line.css:122` |  | `.pl-year__run` | absolute | 0 |  | 0 |  |  |
| tasks | `apps/tasks/src/personal-line/personal-line.css:124` |  | `.pl-year__due` | absolute | -3px |  |  |  |  |
| tasks | `apps/tasks/src/personal-line/personal-line.css:158` |  | `.pl-chip input` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/personal-line/personal-line.css:187` |  | `.pl-block` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/backlog.css:24` |  | `.backlog-live` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/backlog.css:323` |  | `.backlog-row__check input` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/backlog.css:337` |  | `.backlog-row__tick` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/backlog.css:481` |  | `.backlog-reveal` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/backlog.css:566` |  | `.backlog-bulk` | sticky |  |  | var(--space-3) |  |  |
| tasks | `apps/tasks/src/styles/cards.css:355` |  | `.task-check input` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:382` |  | `.check-box::after` | absolute | 0.22rem |  |  | 0.4rem |  |
| tasks | `apps/tasks/src/styles/cards.css:430` |  | `.toggle-switch input` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/cards.css:456` |  | `.toggle-track::after` | absolute | 0.14rem |  |  | 0.14rem |  |
| tasks | `apps/tasks/src/styles/cards.css:593` |  | `.card-menu` | absolute | var(--space-3) | var(--space-3) |  |  | 2 |
| tasks | `apps/tasks/src/styles/cards.css:774` |  | `.chip-float` | absolute | -26px | -14px |  |  | 1 |
| tasks | `apps/tasks/src/styles/cards.css:997` |  | `.page-editor__insert` | absolute | calc(100% + var(--space-2)) |  |  | 50% | 20 |
| tasks | `apps/tasks/src/styles/daily-dial.css:208` |  | `.daily-dial__readout` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/gantt.css:356` |  | `.gantt-popover` | absolute |  |  |  |  | 20 |
| tasks | `apps/tasks/src/styles/gantt.css:408` |  | `.graph-preview__close` | absolute | var(--space-2) | var(--space-2) |  |  |  |
| tasks | `apps/tasks/src/styles/goals.css:28` |  | `.goals-plan-sheet` | fixed |  |  |  |  | 40 |
| tasks | `apps/tasks/src/styles/goals.css:47` |  | `.runway-zoom__tick` | absolute | 0 |  |  |  |  |
| tasks | `apps/tasks/src/styles/goals.css:68` |  | `.runway-zoom__bar` | absolute | 0.35rem |  |  |  |  |
| tasks | `apps/tasks/src/styles/goals.css:69` |  | `.runway-zoom__track .cell` | absolute | 0.125rem |  |  |  |  |
| tasks | `apps/tasks/src/styles/goals.css:110` |  | `.cell.has-milestone::after` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/goals.css:137` |  | `.goals-checkin-sheet` | fixed |  |  |  |  | 50 |
| tasks | `apps/tasks/src/styles/goals.css:197` |  | `.goal-frame__here` | absolute | var(--space-3) | var(--space-3) |  |  |  |
| tasks | `apps/tasks/src/styles/graph.css:569` |  | `.graph-minimap` | absolute |  | 12px | 12px |  |  |
| tasks | `apps/tasks/src/styles/graph.css:620` |  | `.or-paused-tag` | absolute | 12px |  |  | 12px |  |
| tasks | `apps/tasks/src/styles/graph.css:760` |  | `.or-tip` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/graph.css:897` | @media (max-width: 430px) | `.graph-drawer` | sticky |  |  | 0 |  |  |
| tasks | `apps/tasks/src/styles/hub.css:3` |  | `.skip-link` | absolute | 0.75rem |  |  | 0.75rem | 200 |
| tasks | `apps/tasks/src/styles/hub.css:31` |  | `.hub-rail` | sticky | 0 |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:248` |  | `.lesson-editor__publish-panel--error` | sticky | 0 |  |  |  | 3 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:295` |  | `.lesson-editor__side` | sticky | 0.5rem |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:366` |  | `.agent-protocol-pills__tip` | absolute | calc(100% + 0.5rem) |  |  | 0 | 30 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:579` |  | `.a4-preview` | sticky | 0.5rem |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:827` |  | `.student-chrome, .student-surface__header` | sticky | 0 |  |  |  | 20 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:931` |  | `.student-hero__fallback` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1569` |  | `.block-timeline__event:not(:last-child)::before` | absolute | var(--tl-node-y) |  | calc(-1 * var(--tl-node-y)) | calc(var(--space-6) / 2 - 1px) |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:1879` |  | `.block-card-stack__card` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:2207` |  | `.block-question-set__prompt::before` | absolute | 0.15rem |  |  | 0 |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:2451` |  | `.block-gallery-lightbox` | fixed |  |  |  |  | 1000 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:2468` |  | `.block-gallery-lightbox__close` | absolute | 1rem | 1rem |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3005` |  | `.lesson-builder__chat` | sticky | var(--space-3) |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3016` |  | `.lesson-builder__chat-fab` | fixed |  | var(--space-6) | var(--space-6) |  | 30 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3066` | @media (max-width: 720px) | `.lesson-builder__chat` | fixed |  |  |  |  | 50 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3196` |  | `.lesson-palette` | sticky | var(--space-3) |  |  |  | 20 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3309` |  | `.lesson-palette__flyout` | absolute | 0 |  |  | 100% | 2 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3406` |  | `.lesson-page__menu` | absolute | calc(100% + 4px) | 0 |  |  | 20 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3457` |  | `.entity-banner__media, .entity-banner__scrim, .entity-banner__image` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3475` |  | `.entity-banner__tools` | absolute | var(--space-3) | var(--space-3) |  |  | 2 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3628` |  | `.lesson-page__block-menu` | absolute | var(--space-2) | var(--space-2) |  |  | 2 |
| tasks | `apps/tasks/src/styles/lesson-engine.css:3666` |  | `.lesson-page__grip, .lesson-page__block-delete` | absolute | var(--space-1) |  |  | -1.6rem | 1 |
| tasks | `apps/tasks/src/styles/timeline.css:23` |  | `.tl-labels__head` | absolute | 0 | 0 |  | 0 |  |
| tasks | `apps/tasks/src/styles/timeline.css:24` |  | `.tl-label` | absolute | var(--tl-top, 76px) | 0 |  | 0 |  |
| tasks | `apps/tasks/src/styles/timeline.css:120` |  | `.tl-live` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/timeline.css:173` |  | `.tl-labels__load` | absolute | auto | 0 | 0 | 0 |  |
| tasks | `apps/tasks/src/styles/timeline.css:206` |  | `.tl-menu` | absolute | 4.5rem | var(--space-4) |  |  | 5 |
| tasks | `apps/tasks/src/styles/views.css:27` |  | `.confirm-overlay` | fixed |  |  |  |  | 40 |
| tasks | `apps/tasks/src/styles/views.css:698` |  | `.someday-wash` | absolute |  |  |  |  | 0 |
| tasks | `apps/tasks/src/styles/views.css:1820` | @media (max-width: 720px) | `.board-col-nav` | sticky | calc(env(safe-area-inset-top, 0px) + 2.75rem) |  |  |  | 20 |
| tasks | `apps/tasks/src/styles/views.css:1992` |  | `.card.dragging` | fixed |  |  |  |  | 500 |
| tasks | `apps/tasks/src/styles/views.css:2042` |  | `.sr-only` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:2116` |  | `.graph-tip` | absolute |  |  |  |  | 2 |
| tasks | `apps/tasks/src/styles/views.css:2127` |  | `.graph-preview` | absolute | var(--space-4) | var(--space-4) |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:2794` |  | `.page-header--cover .page-header__title, .page-header--cover .page-header__title-input` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:2827` |  | `.excursion-page .lesson-page__title` | absolute |  | 8rem | var(--space-5) | var(--space-6) | 2 |
| tasks | `apps/tasks/src/styles/views.css:3115` |  | `.agent-protocol-pills__tip` | absolute | calc(100% + 0.5rem) |  |  | 0 | 30 |
| tasks | `apps/tasks/src/styles/views.css:3832` |  | `.floating-chat-button` | fixed |  | var(--space-6) | var(--space-6) |  | 30 |
| tasks | `apps/tasks/src/styles/views.css:3849` |  | `.floating-chat-button.has-unread::after, [data-clare-nav].has-unread::after` | absolute | 0.3rem | 0.35rem |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:3866` |  | `.chat-view[data-panel-mode='overlay']` | fixed |  |  |  |  | 25 |
| tasks | `apps/tasks/src/styles/views.css:3951` | @media (max-width: 720px) | `html.vv-keyboard-open .hub-layout[data-hub-view='clare'], .hub-layout[data-hub-view='clare']:has(#chat-form:focus-within)` | fixed | var(--vv-offset-top, 0px) | 0 |  | 0 | 20 |
| tasks | `apps/tasks/src/styles/views.css:4599` |  | `.pipe-segment` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:4604` |  | `.pipe-segment__water-layer` | absolute |  |  |  |  | 1 |
| tasks | `apps/tasks/src/styles/views.css:4612` |  | `.pipe-segment__water-fill` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:4632` |  | `.pipe-segment__casing-layer` | absolute |  |  |  |  | 2 |
| tasks | `apps/tasks/src/styles/views.css:4641` |  | `.valve-unit` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:4651` |  | `.valve-unit__img` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:4669` |  | `.valve-unit__seep` | absolute |  | -4px | 8px |  |  |
| tasks | `apps/tasks/src/styles/views.css:4678` |  | `.pipe-coupling, .pipe-end-cap, .pipe-elbow, .pipe-junction` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:4686` |  | `.pipe-queued-cap` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:4804` |  | `html.is-map-fullscreen .map-page .map-preview` | fixed |  | var(--space-4) | var(--space-4) |  | 40 |
| tasks | `apps/tasks/src/styles/views.css:5292` |  | `.map-inspector` | sticky | var(--space-3) |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:5484` |  | `.map-index` | absolute | var(--space-3) | var(--space-3) | auto |  | 6 |
| tasks | `apps/tasks/src/styles/views.css:6250` |  | `.visually-hidden` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:6345` |  | `.catalog-overlay` | fixed |  |  |  |  | 40 |
| tasks | `apps/tasks/src/styles/views.css:6540` |  | `.universe-wrap.is-universe-fullscreen` | fixed |  |  |  |  | 20 |
| tasks | `apps/tasks/src/styles/views.css:6568` |  | `.universe-exit` | absolute | var(--space-4) | var(--space-4) |  |  | 6 |
| tasks | `apps/tasks/src/styles/views.css:6579` |  | `.universe-wrap .graph-toolbar` | absolute | var(--space-4) |  |  | var(--space-4) | 2 |
| tasks | `apps/tasks/src/styles/views.css:6609` |  | `.universe-key` | absolute |  | var(--space-4) | var(--space-4) |  | 5 |
| tasks | `apps/tasks/src/styles/views.css:6810` |  | `.universe-key__swatch--ringed::after, .universe-key__swatch--giant::after` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:6866` |  | `.universe-zoom` | absolute | calc(var(--space-2) + 3.2rem) | var(--space-2) |  |  | 4 |
| tasks | `apps/tasks/src/styles/views.css:7346` |  | `.projects-mix__center` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:8580` |  | `.roadmap-row__bar, .roadmap-row__ghost` | absolute | 0 |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:9065` |  | `.chronology__axis` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:9071` |  | `.chronology__tick` | absolute | 0 |  |  |  |  |
| tasks | `apps/tasks/src/styles/views.css:9079` |  | `.chronology__today` | absolute | 2.15rem |  | 0.75rem |  |  |
| tasks | `apps/tasks/src/styles/views.css:9088` |  | `.chronology__bar` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/views/city/city.css:10` |  | `.city-stage` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/views/city/city.css:40` |  | `.city-hud` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/views/city/city.css:65` |  | `.city-day, .city-banner` | absolute | var(--space-4) |  |  | 50% |  |
| tasks | `apps/tasks/src/views/city/city.css:82` |  | `.city-tools` | absolute | var(--space-4) |  |  | var(--space-4) |  |
| tasks | `apps/tasks/src/views/city/city.css:97` |  | `.city-sky` | absolute | var(--space-4) | var(--space-4) |  |  |  |
| tasks | `apps/tasks/src/views/city/city.css:121` |  | `.city-hint` | absolute |  |  | calc(var(--space-4) + 3.5rem) | var(--space-4) |  |
| tasks | `apps/tasks/src/views/city/city.css:129` |  | `.city-a11y` | absolute |  | var(--space-4) | var(--space-4) | 14rem |  |
| tasks | `apps/tasks/src/views/city/city.css:154` |  | `.city-card, .city-panel, .city-legend` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/views/city/city.css:252` |  | `.city-status` | absolute |  |  | 4.5rem | var(--space-4) |  |
| tasks | `apps/tasks/src/views/city/city.css:262` |  | `.city-page[data-test='true']` | fixed |  |  |  |  | 2147483000 |
| tasks | `apps/tasks/src/views/city/city.css:274` |  | `.city-page[data-test='true'] .city-a11y` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/views/grove/grove.css:18` |  | `.grove-stage, .grove-stage__layer` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/views/grove/grove.css:33` |  | `.grove-top` | absolute | var(--space-4) | var(--space-4) |  | var(--space-4) |  |
| tasks | `apps/tasks/src/views/grove/grove.css:122` |  | `.grove-hint` | absolute |  |  | var(--space-5) | 50% |  |
| tasks | `apps/tasks/src/views/grove/grove.css:143` |  | `.grove-veil` | absolute | 50% |  |  | 50% |  |
| tasks | `apps/tasks/src/views/grove/grove.css:169` |  | `.grove-card` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/views/grove/grove.css:201` |  | `.grove-status` | absolute |  |  |  |  |  |
| tasks | `apps/tasks/src/views/grove/grove.css:217` |  | `.grove-page.is-full` | fixed |  |  |  |  | 1000 |
| tasks | `apps/tasks/src/views/grove/grove.css:285` |  | `.grove-tray` | absolute | calc(var(--space-4) + 5rem) |  |  | var(--space-4) |  |
| tasks | `apps/tasks/src/views/grove/grove.css:426` |  | `.grove-follow` | absolute |  |  | var(--space-4) | 50% |  |
| tasks | `apps/tasks/src/views/grove/grove.css:465` |  | `.grove-key` | absolute | var(--space-4) | calc(var(--space-4) + 44px + var(--space-2)) | var(--space-4) |  |  |
| tasks | `apps/tasks/src/views/programs-network.css:116` |  | `.pn-tt__gtitle` | sticky |  |  |  | 0 | 2 |
| tasks | `apps/tasks/src/views/programs-network.css:121` |  | `.pn-tt__months span` | absolute |  |  | 6px |  |  |
| tasks | `apps/tasks/src/views/programs-network.css:126` |  | `.pn-tt__namecell` | sticky |  |  |  | 0 | 1 |
| tasks | `apps/tasks/src/views/programs-network.css:135` |  | `.pn-mark` | absolute | 50% |  |  |  |  |
| teaching | `apps/teaching/src/styles/alchemy-assistant.css:3` |  | `[data-alchemy-assistant] .alchemy-block-button` | absolute |  | var(--space-1) | var(--space-1) |  |  |
| teaching | `apps/teaching/src/styles/alchemy-assistant.css:5` |  | `.alchemy-block-button__beaker` | absolute |  | -2px | 0 |  |  |
| teaching | `apps/teaching/src/styles/alchemy-assistant.css:6` |  | `.alchemy-block-button__badge` | absolute | 0 | 0 |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:13` |  | `.skip-link` | absolute | 0.75rem |  |  | 0.75rem | 200 |
| teaching | `apps/teaching/src/styles/app.css:48` |  | `body::before` | fixed |  |  |  |  | -1 |
| teaching | `apps/teaching/src/styles/app.css:170` |  | `.page-options__menu` | absolute | calc(100% + var(--space-1)) | 0 |  |  | 40 |
| teaching | `apps/teaching/src/styles/app.css:221` |  | `.entity-cover-tile-wrap .page-options, .classes-index__card .page-options, .units-index__card .page-options` | absolute | var(--space-2) | var(--space-2) |  |  | 3 |
| teaching | `apps/teaching/src/styles/app.css:797` |  | `.lesson-editor__publish-panel--error` | sticky | 0 |  |  |  | 3 |
| teaching | `apps/teaching/src/styles/app.css:844` |  | `.lesson-editor__side` | sticky | 0.5rem |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:915` |  | `.agent-protocol-pills__tip` | absolute | calc(100% + 0.5rem) |  |  | 0 | 30 |
| teaching | `apps/teaching/src/styles/app.css:1130` |  | `.a4-preview` | sticky | 0.5rem |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:1394` |  | `.student-chrome, .student-surface__header` | sticky | 0 |  |  |  | 20 |
| teaching | `apps/teaching/src/styles/app.css:1502` |  | `.student-hero__fallback` | absolute |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:2378` |  | `.cover-picker__placeholder` | absolute |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:2552` |  | `.entity-banner__fallback` | absolute |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:2557` |  | `.entity-banner__scrim` | absolute |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:2594` |  | `.entity-banner__edit` | absolute |  | var(--space-3) | var(--space-3) |  | 1 |
| teaching | `apps/teaching/src/styles/app.css:2684` | @media (max-width: 720px) | `.entity-banner__dialog` | fixed |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:3075` |  | `.entity-page-title` | absolute |  | 1.625rem | 1.15rem | 1.625rem | 4 |
| teaching | `apps/teaching/src/styles/app.css:3442` |  | `.schedule-modal` | fixed |  |  |  |  | 40 |
| teaching | `apps/teaching/src/styles/app.css:4362` |  | `.block-timeline__event:not(:last-child)::before` | absolute | var(--tl-node-y) |  | calc(-1 * var(--tl-node-y)) | calc(var(--space-6) / 2 - 1px) |  |
| teaching | `apps/teaching/src/styles/app.css:4672` |  | `.block-card-stack__card` | absolute |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:5000` |  | `.block-question-set__prompt::before` | absolute | 0.15rem |  |  | 0 |  |
| teaching | `apps/teaching/src/styles/app.css:5242` |  | `.block-gallery-lightbox` | fixed |  |  |  |  | 1000 |
| teaching | `apps/teaching/src/styles/app.css:5259` |  | `.block-gallery-lightbox__close` | absolute | 1rem | 1rem |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:5811` |  | `.scope-gantt__month` | absolute | 0 |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:5835` |  | `.scope-gantt__tick` | absolute | 0 |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:5849` |  | `.scope-gantt__bands` | absolute | 58px | 0 | 0 | 0 | 0 |
| teaching | `apps/teaching/src/styles/app.css:5859` |  | `.scope-gantt__band` | absolute | 0 |  | 0 |  |  |
| teaching | `apps/teaching/src/styles/app.css:5867` |  | `.scope-gantt__band-label` | sticky | 4px |  |  | 10px |  |
| teaching | `apps/teaching/src/styles/app.css:5879` |  | `.scope-gantt__today-line` | absolute | 0 |  | 0 |  | 6 |
| teaching | `apps/teaching/src/styles/app.css:5889` |  | `.scope-gantt__today-badge` | absolute | 2px |  |  | 50% |  |
| teaching | `apps/teaching/src/styles/app.css:5939` |  | `.scope-gantt__bar` | absolute | 3px |  |  |  | 1 |
| teaching | `apps/teaching/src/styles/app.css:5979` |  | `.scope-gantt__label-wrap` | absolute | 3px |  |  |  | 3 |
| teaching | `apps/teaching/src/styles/app.css:5987` |  | `.scope-gantt__label` | sticky | 0 |  |  | 8px |  |
| teaching | `apps/teaching/src/styles/app.css:6067` |  | `.scope-gantt__empty` | absolute | 58px | 0 | 0 | 0 | 10 |
| teaching | `apps/teaching/src/styles/app.css:6302` |  | `.scope-timeline__term` | absolute | 0 |  | 0 |  |  |
| teaching | `apps/teaching/src/styles/app.css:6365` |  | `.scope-timeline__item` | absolute | 0.55rem |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:6401` |  | `.scope-timeline__handle` | absolute | 0 |  | 0 |  | 2 |
| teaching | `apps/teaching/src/styles/app.css:6419` |  | `.scope-timeline__handle::after` | absolute | 20% |  | 20% |  |  |
| teaching | `apps/teaching/src/styles/app.css:6480` |  | `.scope-timeline__inspector` | sticky | 0.5rem |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:6801` | @media (max-width: 720px) | `.create-control__menu` | fixed | auto | var(--space-3) | max(var(--space-4), env(safe-area-inset-bottom, 0px)) | var(--space-3) | 50 |
| teaching | `apps/teaching/src/styles/app.css:6905` |  | `.create-control__menu` | absolute |  |  |  |  | 20 |
| teaching | `apps/teaching/src/styles/app.css:6937` |  | `.create-modal-backdrop` | fixed |  |  |  |  | 40 |
| teaching | `apps/teaching/src/styles/app.css:7161` |  | `.scope-overview__bar` | absolute | 0.5rem |  | 0.5rem |  |  |
| teaching | `apps/teaching/src/styles/app.css:7217` |  | `.scope-overview__term` | absolute | 0 |  | 0 |  |  |
| teaching | `apps/teaching/src/styles/app.css:7343` |  | `.search-palette-backdrop` | fixed |  |  |  |  | 80 |
| teaching | `apps/teaching/src/styles/app.css:7350` |  | `.search-palette` | fixed | 18vh |  |  | 50% | 81 |
| teaching | `apps/teaching/src/styles/app.css:7555` |  | `.public-link__popover` | absolute | calc(100% + var(--space-1)) | 0 |  |  | 20 |
| teaching | `apps/teaching/src/styles/app.css:7624` |  | `.lesson-editor__public-link .public-link__trigger` | absolute |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:7783` |  | `.history-panel__body` | absolute | calc(100% + 0.45rem) | 0 |  |  | 40 |
| teaching | `apps/teaching/src/styles/app.css:7976` |  | `.lesson-builder__chat` | sticky | var(--space-3) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:7987` |  | `.lesson-builder__chat-fab` | fixed |  | var(--space-6) | var(--space-6) |  | 30 |
| teaching | `apps/teaching/src/styles/app.css:8028` |  | `.lesson-builder--full-page` | fixed |  |  |  |  | 20 |
| teaching | `apps/teaching/src/styles/app.css:8048` |  | `.lesson-builder--full-page:not(.lesson-builder--chat-shelved) .lesson-builder__chat` | fixed | 0 | 0 | 0 |  | 30 |
| teaching | `apps/teaching/src/styles/app.css:8070` |  | `.lesson-builder__exit` | fixed | var(--space-4) | var(--space-4) |  |  | 25 |
| teaching | `apps/teaching/src/styles/app.css:8090` | @media (max-width: 720px) | `.lesson-builder__chat, .lesson-builder--full-page:not(.lesson-builder--chat-shelved) .lesson-builder__chat` | fixed | 0 | 0 | 0 | 0 | 50 |
| teaching | `apps/teaching/src/styles/app.css:8259` |  | `.lesson-palette` | sticky | var(--space-3) |  |  |  | 20 |
| teaching | `apps/teaching/src/styles/app.css:8372` |  | `.lesson-palette__flyout` | absolute | 0 |  |  | 100% | 2 |
| teaching | `apps/teaching/src/styles/app.css:8469` |  | `.lesson-page__menu` | absolute | calc(100% + 4px) | 0 |  |  | 20 |
| teaching | `apps/teaching/src/styles/app.css:8622` |  | `.lesson-page__block-menu` | absolute | var(--space-2) | var(--space-2) |  |  | 2 |
| teaching | `apps/teaching/src/styles/app.css:8660` |  | `.lesson-page__grip, .lesson-page__block-delete` | absolute | var(--space-1) |  |  | -1.6rem | 1 |
| teaching | `apps/teaching/src/styles/app.css:8886` |  | `.lessons-lib__side` | sticky | var(--space-4) |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:8929` |  | `.lessons-table thead th` | sticky | 0 |  |  |  | 1 |
| teaching | `apps/teaching/src/styles/app.css:8985` |  | `.virtual-list__window` | absolute | 0 |  |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:9001` |  | `.schedule-overflow` | fixed |  |  |  |  | 40 |
| teaching | `apps/teaching/src/styles/app.css:9225` |  | `.confirm-card-overlay` | fixed |  |  |  |  | 80 |
| teaching | `apps/teaching/src/styles/app.css:9548` |  | `.block-annotation__sheet` | fixed |  |  |  |  | 40 |
| teaching | `apps/teaching/src/styles/app.css:9705` |  | `.block-editor__annotation-hl.has-several::after` | absolute | -0.55em | -0.45em |  |  |  |
| teaching | `apps/teaching/src/styles/app.css:10592` |  | `.block-annotation__element-lineage-step + .block-annotation__element-lineage-step::before` | absolute | 50% |  |  | -1.1rem |  |
| teaching | `apps/teaching/src/styles/app.css:10914` |  | `.block-editor__annotation-poem-toolbar` | sticky | 0 |  |  |  | 2 |
| teaching | `apps/teaching/src/styles/app.css:11008` |  | `.block-editor__annotation-add-note` | absolute |  |  |  |  | 3 |
| teaching | `apps/teaching/src/styles/app.css:11060` |  | `.block-editor__annotation-bar-menu` | fixed |  |  |  |  | 1000 |
| teaching | `apps/teaching/src/styles/app.css:11268` |  | `.annotation-technique-sheet-overlay` | fixed |  |  |  |  | 80 |
| teaching | `apps/teaching/src/styles/app.css:11636` |  | `.block-annotation__thread-link` | absolute | 0 |  |  | 0 | 0 |
| teaching | `apps/teaching/src/styles/app.css:12025` |  | `.block-annotation__ink` | absolute |  |  |  |  | 0 |
| teaching | `apps/teaching/src/styles/app.css:12123` |  | `.block-annotation__margin-note` | absolute |  |  |  |  | 2 |
| teaching | `apps/teaching/src/styles/app.css:12312` |  | `.callout-ref__preview` | absolute | 100% | 0 |  |  | 20 |
| teaching | `apps/teaching/src/styles/app.css:12343` | @media (max-width: 720px) | `.callout-ref-list .callout-ref__preview` | fixed | 25vh | var(--space-4) |  | var(--space-4) |  |
| teaching | `apps/teaching/src/styles/block-pulse.css:10` |  | `.pulse` | absolute | 0 | 0 |  |  | 3 |
| teaching | `apps/teaching/src/styles/block-pulse.css:76` |  | `.pulse__panel` | absolute | calc(100% + var(--space-1)) | 0 |  |  |  |
| teaching | `apps/teaching/src/styles/class-examples.css:7` |  | `:is(.lesson-page__block, .cx-nested-target) > .cx-add` | absolute |  |  | calc(-1 * var(--space-3)) | var(--space-5) | 2 |
| teaching | `apps/teaching/src/styles/class-examples.css:213` |  | `.cx-sr` | absolute |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/toolkit.css:15` |  | `.tk-visually-hidden` | absolute |  |  |  |  |  |
| teaching | `apps/teaching/src/styles/toolkit.css:108` |  | `.tk-card--skill::before` | absolute | 0 |  | 0 | 0 |  |
| travel | `apps/travel/src/styles/journal.css:23` |  | `.journal__timeline::before` | absolute | 0 |  | 0 | calc(var(--journal-gutter) / 2 - 1px) |  |
| travel | `apps/travel/src/styles/journal.css:179` |  | `.journal-leg__pattern` | absolute |  |  |  |  |  |
| travel | `apps/travel/src/styles/journal.css:216` |  | `.journal-leg__title::before` | absolute | 0.55em |  |  | calc(-1 * (var(--journal-gutter) + var(--journal-gutter-gap)) + var(--journal-gutter) / 2 - 4px) |  |
| travel | `apps/travel/src/styles/journal.css:304` |  | `.journal-map-backdrop` | fixed |  |  |  |  | 110 |
| travel | `apps/travel/src/styles/journal.css:331` |  | `.journal-map-panel--fullscreen` | fixed |  |  |  |  | 120 |
| travel | `apps/travel/src/styles/journal.css:390` |  | `.journal-map-panel__map-host` | absolute |  |  |  |  |  |
| travel | `apps/travel/src/styles/journal.css:512` |  | `.journal-moment__menu-wrap` | absolute | 0 | 0 |  |  |  |
| travel | `apps/travel/src/styles/journal.css:528` |  | `.journal-moment__menu` | absolute | 100% | 0 |  |  | 2 |
| travel | `apps/travel/src/styles/journal.css:614` |  | `.journal-chapter-backdrop` | fixed |  |  |  |  | 100 |
| travel | `apps/travel/src/styles/journal.css:748` |  | `.journal-toolbar__more-menu` | absolute | calc(100% + 4px) | 0 |  |  | 5 |
| travel | `apps/travel/src/styles/journal.css:1153` |  | `.journal-pin-panel__map-host` | absolute |  |  |  |  |  |
| travel | `apps/travel/src/styles/journal.css:1158` |  | `.journal-pin-panel__crosshair` | absolute | 50% |  |  | 50% |  |
| travel | `apps/travel/src/styles/journal.css:1172` |  | `.journal-pin-panel__crosshair::before, .journal-pin-panel__crosshair::after` | absolute |  |  |  |  |  |
| travel | `apps/travel/src/styles/journal.css:1270` |  | `.journal-moment__annotation-svg` | absolute |  |  |  |  |  |
| travel | `apps/travel/src/styles/journal.css:1311` |  | `.journal-annotation-sheet__svg` | absolute |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:42` |  | `.skip-link` | absolute | .75rem |  |  | .75rem | 200 |
| travel | `apps/travel/src/styles/travel.css:119` |  | `.world-foot` | absolute |  | 14px | 12px | 14px |  |
| travel | `apps/travel/src/styles/travel.css:178` |  | `.scene svg.art` | absolute |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:179` |  | `.scene .title` | absolute | 16px | 20px |  | 20px |  |
| travel | `apps/travel/src/styles/travel.css:243` | @media (min-width: 900px) | `.mapcol` | sticky | 12px |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:247` |  | `.map-tools` | absolute | 10px | 10px |  |  |  |
| travel | `apps/travel/src/styles/travel.css:249` |  | `.map-note` | absolute |  | 58px | 10px | 10px |  |
| travel | `apps/travel/src/styles/travel.css:331` |  | `.ticket .flight::before` | absolute | 50% | 0 |  | 0 |  |
| travel | `apps/travel/src/styles/travel.css:332` |  | `.ticket .flight .v` | absolute | 1px |  |  | 0 |  |
| travel | `apps/travel/src/styles/travel.css:338` |  | `.ticket .perf::before, .ticket .perf::after` | absolute | -9px |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:366` |  | `.sheet-back` | fixed |  |  |  |  | 50 |
| travel | `apps/travel/src/styles/travel.css:458` |  | `.toast` | fixed |  |  | calc(18px + env(safe-area-inset-bottom, 0px)) | 50% | 30 |
| travel | `apps/travel/src/styles/travel.css:490` |  | `.zoom-ctl` | absolute |  | 10px | 10px |  |  |
| travel | `apps/travel/src/styles/travel.css:496` |  | `.mapbox.is-full` | fixed |  |  |  |  | 15 |
| travel | `apps/travel/src/styles/travel.css:531` |  | `.sr` | absolute |  |  |  |  |  |
| travel | `apps/travel/src/styles/travel.css:542` |  | `.mapbox.is-fullscreen` | fixed |  |  |  |  | 80 |
| travel | `apps/travel/src/styles/travel.css:558` |  | `.where-note` | absolute |  |  | 10px | 10px | 2 |

## Z-index counts

| Value | kit | life | teaching | knowledge | tasks | professional | travel |
|---|---:|---:|---:|---:|---:|---:|---:|
| `-2` | 0 | 4 | 0 | 3 | 0 | 0 | 0 |
| `-1` | 0 | 6 | 1 | 3 | 0 | 0 | 0 |
| `0` | 3 | 0 | 3 | 2 | 1 | 0 | 0 |
| `1` | 7 | 6 | 9 | 9 | 8 | 3 | 0 |
| `2` | 11 | 5 | 9 | 11 | 12 | 1 | 4 |
| `3` | 2 | 7 | 6 | 10 | 2 | 4 | 0 |
| `4` | 3 | 1 | 2 | 5 | 2 | 2 | 0 |
| `5` | 4 | 3 | 1 | 10 | 3 | 1 | 1 |
| `6` | 0 | 1 | 2 | 4 | 2 | 0 | 0 |
| `7` | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| `10` | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| `15` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `20` | 4 | 2 | 8 | 5 | 8 | 2 | 0 |
| `25` | 0 | 1 | 1 | 1 | 1 | 0 | 0 |
| `30` | 5 | 4 | 3 | 3 | 4 | 2 | 1 |
| `31` | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| `40` | 4 | 1 | 7 | 2 | 5 | 4 | 0 |
| `45` | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| `50` | 1 | 1 | 2 | 1 | 3 | 0 | 1 |
| `60` | 2 | 0 | 0 | 2 | 0 | 1 | 0 |
| `70` | 1 | 0 | 0 | 1 | 0 | 0 | 0 |
| `80` | 3 | 0 | 3 | 0 | 0 | 0 | 1 |
| `81` | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `90` | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| `95` | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| `100` | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| `110` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `120` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `200` | 0 | 0 | 1 | 0 | 1 | 1 | 1 |
| `500` | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| `1000` | 3 | 0 | 2 | 0 | 3 | 0 | 0 |
| `2147483000` | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| `auto` | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
