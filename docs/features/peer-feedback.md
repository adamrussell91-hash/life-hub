# Peer feedback block

Add **Learning → Peer feedback** to a lesson. Enter a writing prompt and the two feedback prompts, then publish the lesson. Open the block's editor or teacher preview and choose **Start new activity**. Students open their usual published lesson link; there is no separate student account or login.

The teacher shares the six-digit activity code. Each student enters it and chooses an available coloured symbol. There are 36 identities, with colour names and symbol names displayed together. A private random token saved on the student's device identifies their writing; choosing the same colour on another device does not grant access to it.

Students submit once. The teacher sees submissions and can exclude individual pieces before choosing **Start feedback round**. At least two pieces must be included. Every included writer receives one other included piece, with no self-review and exactly one reviewer per piece. Peer authors' identities are not displayed.

Students complete the strength and suggestion prompts and send their feedback. The teacher can monitor review counts and choose **Return feedback to writers**. Feedback becomes visible to the original writers at that point. An unfinished review is shown as missing rather than invented. Writing and feedback drafts are saved locally during typing and survive reloads and failed requests.

Use **End activity** to end a writing round without distributing it. A new activity generates a fresh code and session, so previous students cannot submit into the next class's round. Activities are accessible for 12 hours. Device-local drafts remain on that device; reopening on a different device is not supported.

## Implementation

- Block type: `peer_feedback`, available in lessons and nested lesson containers, excluded from class homepages and unit plans.
- Teacher: `POST /api/lessons/:id/peer-feedback/:block`, behind the existing operator session gate.
- Student: `POST /api/published/peer-feedback/:id/:block`, using the existing public-student/origin gate. Status does not expose the code, token hashes, other writers' work, or review assignments.
- Separate immutable objects for each identity claim, submission and review. Claims and submissions use create-only writes. Strong reads ensure refreshed state sees confirmed writes. Only the teacher writes round state and the frozen assignment snapshot.
- Draft and published lesson/block liveness is checked on every operation. Deleted or removed content cannot remain accessible through an old activity.
- The existing renderer/editor registry, block schema, server-generated schema, insert palette and search extraction include the new type. Print output includes the prompt and feedback criteria.

## Verification

- `node tests/unit/peer-feedback.test.js`: exchange allocation, concurrent identity claims, moderation, write-once submissions, session isolation, deleted content, and real teacher/student handlers.
- `cd apps/teaching && npx vitest run tests/unit/peer-feedback-block.test.ts tests/unit/learning-activities.test.ts`: schema/registration, nested blocks, real editor changes, print rendering and existing learning blocks.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/peer-browsers node tests/browser/peer-feedback.spec.mjs`: actual teacher and two student browser contexts through production API handlers, reload recovery, peer exchange and return, desktop and 390px controls and overflow. Uses isolated local fixture storage, never production student data.
- R4: student form fields scroll separately from their docked action row; mobile inputs are at least 16px, actions are at least 44px and include safe-area padding. The browser test checks these bounds. No supplied mockup; screenshots checked against the requested Write → Give feedback → Read feedback flow.
