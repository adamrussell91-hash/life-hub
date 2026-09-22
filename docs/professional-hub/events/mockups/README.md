# Add event — three directions

The live `#/event/new` page is a single 34rem column of native inputs.
That is a database form, not a create-event surface. These mockups keep
every current field (title, start, end, zone, location, all-day, hours,
accreditation, certificate, provider, presenter, knowledge, attendees)
and rearrange the job.

Built against `packages/design-kit` tokens and the existing People mockup
rail language. Render:

```bash
./generate-fonts.sh
./render.sh
```

| File | Direction | Use when |
|---|---|---|
| `01-calendar-compose` | Calendar first | Most sessions are “put this on a day, then hang the PD bits off it” |
| `02-pd-log-wizard` | Guided PD log | The real job is hours, type, standards — date is secondary |
| `03-split-preview` | Live record | You want to see the event card while you fill it |

None of these are implemented. Pick one (or mix) before writing product code.
