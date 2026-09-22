# Add event — three directions

The live `#/event/new` page is now direction B: type buttons, title,
hours stepper, then date and people. Full canvas width. Called an event.

These mockups keep every current field (title, start, end, zone, location,
all-day, hours, accreditation, certificate, provider, presenter, knowledge,
attendees) and rearrange the job.

Built against `packages/design-kit` tokens and the existing People mockup
rail language. Render:

```bash
./generate-fonts.sh
./render.sh
```

| File | Direction | Use when |
|---|---|---|
| `01-calendar-compose` | Calendar first | Rejected — when-first only |
| `02-pd-log-wizard` | Guided hours log | Chosen: type, title, hours across the whole page |
| `03-split-preview` | Live record | Rejected — preview + form is two cards for one record |
