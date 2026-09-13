# StudentReference approval record

Recorded: 13 September 2026
Approved by: Adam Russell

## Approved boundary

Operational purpose: support current Teaching workflows for class, program, excursion, coaching and permission status.

Permitted fields: random internal ID, initials or a neutral display code, lifecycle status, context type, opaque context ID, permission status, participation dates and audit timestamps.

Hosting provider: the existing protected Teaching Netlify Blobs store.

Authorised users: Adam Russell through the authenticated Teaching workflow only.

Retention period: retain a reference only while its named Teaching workflow remains active. Review all retained references at the end of each school year.

Deletion period: archive promptly when the operational purpose ends, then delete within 30 days unless an active College requirement requires shorter or longer retention.

Incident responsibility: Adam Russell owns initial containment and must follow the College privacy and ICT incident process, escalating to the designated College privacy or ICT lead.

Source of truth: the College approved student and permission systems. Life Hub stores no official identity, consent form, contact, medical or wellbeing record.

## Non negotiable exclusions

No full names, email addresses, student numbers, school identifiers, dates of birth, parent or family information, permission forms, medical data, disability data, counselling data, wellbeing data, behaviour data, reports, free text student profiles, production exports or production logs enter this repository or feature.

Only synthetic values such as STUDENT_A1 belong in tests. StudentReference is not a Person subtype. Generic search, canonical browser URLs, analytics, logs and AI retrieval remain unable to expose it.
