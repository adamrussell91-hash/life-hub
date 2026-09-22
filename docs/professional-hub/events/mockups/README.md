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
| `01-calendar-compose` | Calendar first | Rejected — when-first only |
| `02-pd-log-wizard` | Guided split | Chosen: B steps + C preview, full page, called an event |
| `03-split-preview` | Live record | Folded into 02 |

None of these are implemented. Pick one (or mix) before writing product code.
