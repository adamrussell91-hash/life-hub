> Codex run 10 report, committed as delivered. The screenshots under `evidence/` stayed with the Codex session and are not in the repo. Triage and fixes: [`../run-10-triage.md`](../run-10-triage.md).

# Teaching Hub usability run 10

Test date: 5 October 2026, Australia/Sydney. Live testing approximately20:08–21:56 (108minutes), within the120-minute allowance. Live site: https://life-hub.adam-russell.com/teaching/. Brief: [draft PR #692](https://github.com/adamrussell91-hash/life-hub/pull/692), `apps/teaching/docs/usability/chatgpt-live-site-test-10.md`, reviewed at commit `d505cfe110c5ecef441b00719368ed65ceca17bc`.

## Result and limits

All 34 block types were inserted into Lesson A, with 40 top-level blocks including media variants. Content survived five save/reload checkpoints after 8, 16, 24, 32 and 40 blocks. This is persistence coverage, not a claim that all 34 types function correctly. Whiteboard creation, question-set interaction, direct MP4 playback and several reuse workflows failed or were blocked.

The highest-priority observation is that permanently deleting the published Lesson C did not revoke its student lesson or remove its link from the public unit. It was still visible after reload and in a fresh tab. Teacher active lists and settled search results removed the record, but the reloaded class schedule and homepage collection retain an orphan link displaying its raw ID.

The test used the authenticated Codex in-app browser. Student routes were exercised in a separate tab and a fresh tab, but **not an incognito/private window**; anonymous access and teacher-data isolation from unauthenticated sessions remain unverified. No app AI requests were sent and no backup actions were clicked. Only CDX10 records were changed. The user separately confirmed permanent deletion of Lesson C at the action.

Year 9 was unavailable. Saving without a year failed validation. The user explicitly authorised Year 12 for CDX10 test records; names retain the brief's Year 9 labels. This substitution limits Year 9 coverage.

## Highest-priority fixes

1. Revoke published lesson snapshots and public unit references when a lesson is trashed or permanently deleted.
2. Repair whiteboard initialisation (`Failed to construct 'HTMLElement': Illegal constructor`).
3. Make question sets answerable in student view, including correct-answer/feedback configuration.
4. Support direct MP4 URLs and preserve YouTube start timestamps.
5. Repair reuse and navigation: template Use, nested image library picks, and student-preview links.

No P0 was established. Priorities below use P1 for a failed required workflow, P2 for friction/layout inconsistency, and P3 for an improvement. Fix ideas are hypotheses for implementation, not proven root causes.

## Findings

| ID | Type | Priority | Page / action | Actual result | Expected result | Evidence | Fix idea |
|---|---|---|---|---|---|---|---|
| F01 | broken | P1 | Publish and schedule C; trash, restore, trash again, permanently delete; reload student lesson and open a fresh tab | C's published content remains available. A fresh student unit still lists C after permanent deletion; the reloaded class schedule and homepage collection retain a raw-ID orphan link | Deleted lessons cannot be opened or discovered by students | [Fresh-tab evidence](evidence/permanent-delete-student-fresh-tab.jpg), [reload evidence](evidence/permanent-delete-student-after-reload.jpg), [class orphan](evidence/permanent-delete-class-orphan.jpg); C ID below | Invalidate/remove published snapshots and unit manifests on trash/delete; enforce active status at public read time |
| F02 | broken | P1 | Lesson A whiteboard block, save/reload and student publish | Teacher displays `Failed to construct 'HTMLElement': Illegal constructor`; student says no published content | Drawing tools initialise and saved drawings publish | [Whiteboard](evidence/whiteboard-failed.jpg); whiteboard endpoint also returned 404 | Repair component construction and ensure whiteboard document creation precedes loading |
| F03 | broken | P1 | Lesson A question set: MC and short answer; student attempts response | MC options are plain list items. Short answer is a static “Type your response here…” placeholder. No response input or submit/check controls; no correct-answer/feedback editor found | Student can choose/type answers and receive configured feedback | Student DOM inspected: no question response inputs; only cloze inputs existed | Add response controls and teacher answer/feedback configuration, or clearly label a printable-only question set |
| F04 | broken | P1 | Video block with fixed MDN direct MP4 URL | “Video unavailable” in teacher and student; no HTML video element | Native MP4 video player with controls | Lesson A `CDX10 MP4`, teacher/student DOM | Detect direct media and render a native video player |
| F05 | broken | P1 | YouTube short URL with `t=90` | Embedded URL has no start parameter; playback starts at 0 seconds | Begin at 90 seconds | DOM iframe URL and visible player elapsed time | Preserve supported `t`/`start` parameters during URL normalisation |
| F06 | broken | P1 | Templates → CDX10 Lesson template → Use | “Unable to create from template.” No Lesson D created | New lesson with copied blocks, editable independently | [Template error](evidence/template-use-failed.jpg) | Surface actionable API error and repair template-to-lesson creation |
| F07 | broken | P1 | Uploaded CDX10 image → Lesson A nested image → Choose from library | Nested picker says “No images in library”; the top-level image picker offers and inserts CDX10-upload.jpg. Confirmed duplicate-path inconsistency | Uploaded image offered for insertion | Upload record `media_muv3av7u_3oguz8`; top-level and nested editor DOM compared | Use the same resource query/storage source in library and block picker; invalidate caches after upload |
| F08 | broken | P1 | Lesson options → Student preview | Opens `https://class.adam-russell.com/s/lessons/lesson_muv1p7ev_w0rc84`; browser reports DNS failure | Reachable student preview | Separate tab title “This site can't be reached”; error indicates server IP not found | Configure a reachable student origin or use the live site's `/teaching/s/` route |
| F09 | broken | P1 | Resource Library → Add from Drive | Alert: Google Drive is not configured; names missing `VITE_GOOGLE_CLIENT_ID / VITE_GOOGLE_PICKER_API_KEY` | Picker opens and can be cancelled | [Drive alert](evidence/drive-not-configured.jpg) | Configure integration or disable it with a user-facing explanation |
| F10 | layout | P1 | Trash at 390×844 | Table ~792px wide; Restore/Delete buttons begin around x=671. Outer teacher layout clips overflow; action click cannot reach target | Recover/delete controls usable at phone width | [Mobile Trash](evidence/mobile-trash-hidden-actions.jpg), DOM rects and overflow styles | Use stacked cards or a horizontally scrollable table; avoid clipping action columns |
| F11 | workflow | P1 | New class / New unit Year selector | Only Year 12 available; required blank year fails validation | Year 9 can be selected or created through a discoverable path | [New class](evidence/mobile-new-class.jpg), [New unit](evidence/mobile-new-unit.jpg); approved fallback used | Provide year setup/selection and guidance when required catalog entries are missing |
| F12 | workflow | P2 | Save homepage, publish/tag/duplicate lessons, navigate to other list surfaces | Several destination views show stale content/status until explicit Refresh or reload. C persists in cached class schedule immediately after trash, then disappears on reload | Saved mutations reflected consistently across relevant views | Reload comparisons; [forces filter](evidence/forces-filter.jpg) | Invalidate/refetch dependent class, lesson, unit and resource views after mutations |
| F13 | broken | P1 | Trash B copy; class Add lessons to calendar | Wizard offers trashed B copy and can schedule it. Class schedule temporarily displays it | Trashed records excluded from new schedules | [Schedule preview](evidence/schedule-includes-trashed-copy.jpg) | Filter active lessons in schedule source and validate status on confirmation |
| F14 | workflow | P2 | Lesson C trashed/permanently deleted; Lessons recently opened and global command palette | Recent links remain after permanent deletion/reload. Search returns C while trashed and the B copy while trashed; C leaves settled search after permanent deletion | Removed records omitted or visibly marked unavailable/trashed | [Search](evidence/trash-search.jpg), [immediate list](evidence/trash-list-before-reload.txt), mobile library | Apply status filtering to recents and search; purge recents on permanent deletion |
| F15 | broken | P1 | Lesson/Unit Add a connection, query CDX10 and @CDX10 | No suggestions or visible results; could not attach class/unit/lesson connections | Find CDX10 entities, add/remove connections and persist them | Picker DOM after multiple queries/actions | Verify connection provider is wired into both editors and show loading/no-result states |
| F16 | visual | P2 | CDX10 scope timeline | Four “Jump to undefined” controls and four “TERM undefined” labels | Numbered/named term labels | [Scope terms](evidence/scope-undefined-terms.jpg) | Validate term configuration and render a meaningful fallback |
| F17 | workflow | P1 | Lesson options → History, desktop and phone | Menu closes but no history panel appears | Checkpoint/history viewer opens and restore is possible | Repeated visible-action checks, no panel/dialog | Wire action to history UI; expose feedback if unavailable |
| F18 | workflow | P2 | Delete duplicate heading block, Cmd+Z | Deleted block does not return; no block Undo control found | A reversible block deletion can be undone | Heading count returned to one and remained one after shortcut | Add an undo stack or a clear deletion undo affordance |
| F19 | layout | P2 | Mind map in teacher lesson | Automatic fit zoom ~158–160% clips outer branches; reset to 100% helps but editor exit refits | All nodes visible at initial fit | Observed graph layout and repeated zoom after save/reload | Fit to complete node bounds with padding, preserving deliberate zoom |
| F20 | layout | P2 | Student interactive controls at 390px | Graph zoom ~24×22px, tabs 36px high, many learning controls 40px high | Comfortable phone tap targets | Read-only DOM rectangles; [student phone](evidence/mobile-student-lesson.jpg) | Enlarge hit areas, especially graph controls |
| F21 | workflow | P2 | Resource upload and options | Upload and file preview work, but no rename or usage/backlink action found; options only Open/Archive/Move to trash | Rename and inspect where a resource is used | Resource options DOM | Add rename and usage detail view |
| F22 | workflow | P2 | Lesson/Unit creation paths | Lessons list and command palette use the same modal; unit page has no New lesson action; calendar schedules existing lessons | Clear lesson creation from current class/unit context | Unit and calendar controls inspected | Add context-preserving creation entry points |
| F23 | workflow | P2 | PDF embed variant | Renders a PDF link card rather than an inline viewer | Inline PDF for the requested embed workflow | Teacher and student DOM; PDF attachment link is separate | Provide a PDF viewer option with link fallback |
| F24 | redundancy | P2 | Lesson options and Page menu | Both offer Full screen | One consistently located action | Both menus opened; fullscreen worked and Escape exited | Consolidate duplicate lesson navigation actions |
| F25 | workflow | P2 | Scope unit details after deleting C and trashing B copy | “Lessons planned” and Add Unit metadata still count 4, whereas active teacher unit/list contain A and B only | Active lesson count consistently 2, or count semantics clearly labelled | Scope details after reload | Compute active lesson count consistently and exclude deleted/trashed records |

| F26 | broken | P1 | Bulk-add cdx10 to A/B, then add practical before the refreshed list settles | Earlier cdx10 addition disappears after refresh; a later settled addition is retained | Successive additions preserve existing tags | Sequential list snapshots showed cdx10 present, then practical replacing it; final settled tags verified | Merge additions against current server state and serialise/invalidate tag updates |

## Block matrix

“Persisted” means observed after a save/reload checkpoint. Student rendering does not imply anonymous access was tested. Nested content was inspected as well as top-level blocks.

| # | Type | Content / editor exercise | Teacher / persistence | Student outcome |
|---|---|---|---|---|
| 1 | Heading | Do now question; section/subsection levels | Persisted; move up/down, duplicate/delete tested | Renders; publish boundary passed |
| 2 | Rich text | Force paragraph, bold/italic/link, ordered/unordered lists | HTML and formatted text persisted | Formatting and link render |
| 3 | Callout | Safety, trolleys on bench; all tone choices exercised | Persisted, information tone final | Renders |
| 4 | Quote | Newton quotation and attribution | Persisted | Renders |
| 5 | Definition | Force: push/pull and change in motion | Persisted | Renders |
| 6 | Divider | Section rule | Persisted | Renders |
| 7 | Code | Python force = mass * acceleration | Persisted; no caption field found despite palette description | Renders code |
| 8 | HTML | Marked/highlighted paragraph | Persisted | Renders |
| 9 | HTML app | CDX10 counter button | Markup and frame persisted; teacher click initially blocked by frame targeting | Student counter increments 0→1 |
| 10 | Image | PNG dice, alt text and caption; deliberately bad URL then restored | Persisted; move/duplicate/delete tested; bad URL falls back to alt text | Valid image loads; bad URL fallback verified |
| 11 | Gallery | PNG, Newton portrait, uploaded CDX10 screenshot; captions; grid/carousel choices | Persisted; uploaded third image inserted through verified resource URL; teacher and student image loaded at naturalWidth1280 | Images load after lazy loading; enlargement works, Escape closes |
| 12 | Video | 3 YouTube forms, Vimeo, direct MP4 | Five variants persisted; player embeds except MP4 | YouTube/Vimeo playback observed; timestamp lost; MP4 unavailable |
| 13 | Embed | PhET, Maps URL, PDF variant | Three persisted | PhET screen navigation works; map frame loads; PDF is a link card |
| 14 | Audio | MDN T-rex MP3 | Persisted; playback observed with readyState 4/currentTime >0 | Playback observed; 2-second duration |
| 15 | Attachment | W3C dummy PDF worksheet | Link/title/filename persisted; no file-size field found | PDF link rendered; opening/downloading file not verified |
| 16 | Accordion | Three Newton laws | Persisted | First law expands correctly |
| 17 | Table | Object/Mass/Force, three data rows; add/remove temp row/column | Persisted; move/duplicate/delete tested | Headers and values render |
| 18 | Question set | MC force unit; short explanation | Persisted; no correct-answer/feedback controls found | Static questions and placeholder; cannot answer (F03) |
| 19 | Timeline | 1687, 1905, 1915, 1969 with science descriptions | Persisted | Renders |
| 20 | Card stack | Inertia/Force/Mass, images and explanations | Persisted; teacher navigation available | Next advances 1/3→2/3 |
| 21 | Outcomes | CDX10-FORCE and CDX10-DATA | Two custom outcomes selected, persisted | Both descriptions render |
| 22 | Flashcards | Force/Mass/Acceleration/Inertia | Four cards persisted | Flip and Next work; 1/4→2/4 |
| 23 | Cloze | First law, blanks rest/force | Double-bracket syntax persisted | Wrong answer gives 1/2; Reveal gives 2/2; Reset and correct answers work; phone check passed |
| 24 | Self check | Seatbelt explanation and answer | Persisted, answer hidden | Show/Hide answer works |
| 25 | Chart | Mass vs acceleration at constant 4N; axis labels/series | Bar/line choices exercised, final bar persisted | Chart and data disclosure render; tooltip not verified |
| 26 | Equation | F=ma and acceleration formula | Persisted | Math renders |
| 27 | Diagram | Inline SVG force→acceleration→velocity | Persisted | SVG renders |
| 28 | Mind map | Forces with Gravity/Friction/Tension/Normal | Content persisted; zoom/edit friction, F19 | Read-only graph renders; student fit better than teacher |
| 29 | Concept map | Mass/Acceleration, relationship link | Partial content persisted; third node and label editing not completed | Partial graph renders; full requested Force node coverage incomplete |
| 30 | Whiteboard | CDX10 trolley force sketch, height640 | Initialisation fails, F02 | No published content |
| 31 | Section | Practical with rich text, image and later starter heading | Nested content persisted | Practical content renders |
| 32 | Columns | Newton image and explanation; 3-column experiment then 33–67 | Nested block moves/layout persisted | Two columns render without page overflow on phone |
| 33 | Tabs | Before/During/After, each with rich text | All nested text persisted | Switching reveals corresponding text |
| 34 | Spacer | Medium | Persisted | Whitespace rendered |

Block menu move up/down, duplication and deletion succeeded on heading, image and table. Cmd+Z did not undo the heading deletion. A heading drag was attempted but its order did not change; drag support remains unverified. Copy/paste blocks and teacher-only visibility were not completed; no visibility/copy controls were found in tested block menus. “Hide blocks” hides the insertion palette, not student-visible content. Fullscreen works and exits with Escape. Print preview renders lesson content; OS print was not executed.

## Media matrix

| Fixture | Exact URL / source | Teacher | Student | Status / limitation |
|---|---|---|---|---|
| YouTube long | https://www.youtube.com/watch?v=aircAruvnKk | Playback observed, Play→Pause state | Playback observed with elapsed time and captions | Pass |
| YouTube short | https://youtu.be/aircAruvnKk | Playback observed, same nocookie player | Playback observed | URL normalisation works |
| YouTube timestamp | https://youtu.be/aircAruvnKk?t=90 | Playback observed from0; no start parameter | Starts at 0 seconds | F05 |
| Vimeo | https://vimeo.com/76979871 | Playback observed, Play→Pause state | Playback observed, Pause and progress state | Pass |
| MP4 | https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4 | Video unavailable | Video unavailable | F04 |
| MP3 | https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3 | Playback observed | Playback observed | Pass |
| PNG | https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png | Loads | Loads | Pass; alt/caption retained |
| Newton portrait | https://upload.wikimedia.org/wikipedia/commons/3/3b/Portrait_of_Sir_Isaac_Newton%2C_1689.jpg | Renders | Loads once scrolled into view | Lazy-loaded images initially had naturalWidth0; not treated as broken images |
| PDF | https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf | Embed link card + attachment link | Same | Inline viewer absent; final file opening unverified |
| PhET | https://phet.colorado.edu/sims/html/forces-and-motion-basics/latest/forces-and-motion-basics_en.html | Frame loads | Net Force screen navigation works | Simulation served inside lesson |
| Map | https://www.google.com/maps?q=Sydney%20Opera%20House&output=embed | Frame loads | Frame loads | Bare “Sydney Opera House” input did not embed; URL required |
| Deliberately bad image | https://example.com/CDX10-missing-image.png | Alt-text fallback | Alt-text fallback after publish | Restored original PNG and republished |
| Local upload | `CDX10-upload.jpg`, screenshot containing only test lesson content | Upload and Open preview work; top-level picker inserts it; gallery resource URL loads | Published gallery image loads at naturalWidth1280 | Pass for upload/display; nested picker F07 |
| Library image / gallery pick | Choose from library | Top-level picker works; nested picker says no images; gallery has URL fields without chooser | Uploaded gallery image loads | Duplicate-path F07 |
| Google Slides / Docs | No public fixture links supplied/selected | Not tested | Not tested | No personal document sharing changed |

Read-only DOM checks inspected image `complete`/`naturalWidth`, media readyState/time/paused and iframe URLs. Cross-origin players were checked through visible controls and accessibility state; a top-document script cannot establish playback inside every iframe. Network/console capture was bounded and eventually truncated, so this is not an exhaustive network audit. No credentials, headers, cookies or HAR are included.

## Tagging matrix

| Surface | Exercise | Result |
|---|---|---|
| Lesson connections (@ system) | Search CDX10 and @CDX10 in Add a connection | No suggestions; class/unit/B link tests blocked |
| Unit connections (@ system) | Search CDX10 in Add a connection | No suggestions; add/remove/persistence blocked |
| Plain Lessons tags | Bulk select A/B, type tag and Enter | Saved tags visible after refresh; updating rapidly against stale list state can lose an earlier addition |
| Plain tag filter | forces and practical | Each filter displayed exactly A/B |
| Plain tag search | practical | A found from lesson content; B absent at that stage. Search semantics for tags were not fully established |
| Lesson title search | Newton / CDX10 | Title-based navigation exercised |
| C plain tag | cdx10 | Preserved after trash and restore |
| Relationship between systems | Compare @ connections with plain tags | Not established: @ picker could not populate. Do not infer the systems are connected |

A comma-separated input was accepted as one literal tag `cdx10, forces, practical`; individual tag additions were also exercised. This extra test tag remains on A/B and is not presented as three separate tags.

## Delete / restore matrix

“Immediate” means the same session after trash; “reload” means subsequent page reload/fresh load after the mutation settled. Not every surface received every phase; unknowns are explicit.

| Surface | Trashed C before reload | Trashed C after reload | Restored | Permanently deleted C |
|---|---|---|---|---|
| Active Lessons cards | Removed | Removed | Returned published, cdx10 tag | Removed |
| Lessons Recently opened | Still linked | Still linked | Linked | Still linked after reload |
| Teacher unit lesson list | A/B only | A/B only on full page | Not independently rechecked | A/B final active inventory |
| Class schedule / collection | C stale entry remains | C disappears | Original position3/date16Oct returns after Refresh | Orphan C slot/link persists after reload, displaying raw ID (F01) |
| Schedule wizard | B copy offered despite being trashed | Not separately repeated | C scheduling persisted | C not retested; B copy remains trashed |
| Teaching dashboard/calendar | Not sampled immediately | Next week contains A/B, no C | Not repeated | No post-delete full sweep; earlier reload clean |
| Global search | C and B copy found while trashed | C found while trashed | Not repeated | C absent in settled search; B copy still searchable |
| @ connection picker | No suggestions available | No suggestions available | Blocked | Blocked |
| Direct student C URL | Still renders | Still renders | Renders | Still renders after reload and in fresh tab (F01) |
| Student unit | Cached link remains | Fresh post-permanent-delete unit still contains C | Not separately checked | C still linked (F01) |
| Life Hub home | No C reference in inspected home | Date-specific future/calendar sweep incomplete | Not repeated | Not repeated |
| Trash | C listed | C listed | C row removed | C row absent; explicit Deleted confirmation |

Class and unit Move to trash confirmations were opened and cancelled. The B duplicate was moved to recoverable Trash and left there. No existing non-CDX10 Trash item was altered.

## Phone-width matrix

Target 390×844, read-only innerWidth verified. Temporary viewport override reset afterward.

| Surface | Result |
|---|---|
| Dashboard | Fits390; calendar fallback link opens usable full calendar |
| Classes list and new class | Fits390; modal350px wide; required Year9 unavailable |
| Units and new unit | Fits390; creation modal accessible |
| Teacher unit | Document width390; plan/lesson controls render |
| Lessons library and new lesson | Fits390; modal350px wide; mobile More navigation works |
| Lesson A editor | No document-wide overflow; toolbar/content wrap |
| Student class | Inspected at390, screenshot saved |
| Student unit | Document width390, text/lesson links wrap |
| Student Lesson A | No document-wide overflow; cloze scoring works; small controls F20 |
| Class trash confirmation | Opens, fits and Cancel works |
| Trash list/permanent action | Clipped792px table hides actions F10; permanent dialog could not be reached on phone |

## Inventory left on the live site

| Record | ID / URL | State |
|---|---|---|
| CDX10 Year 9 Science (code CDX10) | [class_muv1f2q3_6hyk8e](https://life-hub.adam-russell.com/teaching/classes/class_muv1f2q3_6hyk8e) | Active; actual metadata Year12, academic2026, CDX10 Science; homepage content retained |
| CDX10 Science | subject_muv19sa8_td8jdk | Active |
| CDX10 Year 9 Science scope | [scope page](https://life-hub.adam-russell.com/teaching/scope-sequences/subject_muv19sa8_td8jdk) | Active; UI names page CDX10 Science; scope ID not exposed in inspected UI |
| CDX10 Forces and Motion | [unit_muv1kykc_vz56z8](https://life-hub.adam-russell.com/teaching/units/unit_muv1kykc_vz56z8) | Active, Year12; plan and cover retained; scope dates12–23Oct2026 persisted |
| CDX10 Lesson A — every block 2008 | [lesson_muv1p7ev_w0rc84](https://life-hub.adam-russell.com/teaching/lessons/lesson_muv1p7ev_w0rc84) | Published; scheduled12Oct2026; all34types/40top-level blocks; valid image restored |
| CDX10 Lesson B — Newton's laws | [lesson_muv1q41b_jesh59](https://life-hub.adam-russell.com/teaching/lessons/lesson_muv1q41b_jesh59) | Published; scheduled14Oct2026; Newton heading; composition insertion blocked |
| CDX10 Lesson C — delete me | lesson_muv1rpis_nbclnt | Permanently deleted after explicit user confirmation; public snapshot/link erroneously remains |
| CDX10 Lesson B — Newton's laws (copy) | ID not exposed in inspected list | Trashed, recoverable; wizard scheduled it for19Oct during leakage test |
| CDX10 Lesson template | Template ID not exposed | Saved; Use failed; D was not created |
| CDX10-FORCE / CDX10-DATA outcomes | IDs not exposed | Custom outcomes created and attached to A |
| CDX10-upload.jpg | media_muv3av7u_3oguz8 | Uploaded resource, working file preview; top-level picker works; uploaded image retained in published A gallery |
| CDX10 Starter composition | No record created | Save blocked by in-app browser unsupported prompt |

## Coverage that remains incomplete

Private-window/anonymous testing; Google Slides/Docs fixtures; full concept-map three-node structure; drag/copy-paste/teacher-only block visibility; composition insert/sync/copy/source edit; version checkpoint and restoration; JSON export download verification; resource rename/usage; every calendar mode and a true duplicate active lesson slot; all delete surfaces at every phase; dark mode; full keyboard-only pass. Print preview was tested, final print was not.

B was moved from14Oct to16Oct, then restored to14Oct and verified after navigation/reload. Final A/B tags are forces, practical, cdx10 and the literal comma-separated test tag.

JSON export's download wait timed out, which alone does not prove an application defect. Composition save logged `prompt() is not supported`, a confirmed in-app-browser limitation. Some frame locator clicks failed due to tool targeting; native accessibility interaction then succeeded for the student counter, YouTube and PhET, so those targeting errors are not app findings.

Automatic approval review rejected opening Chat because it could expose private chat content outside the test workflow. No chat was opened or sent. Alchemy Lab opened and closed without requesting generated content. Earlier approval review rejected an incomplete class save; the user authorised unset fields, then the app's own validation blocked it. The later explicit Year12 approval allowed testing to proceed.

## Evidence index

Some earlier phone screenshots are scaled captures; mobile Trash and creation dialogs were recaptured at390×844. Layout conclusions also use measured DOM dimensions. Screenshots and sanitised DOM notes are in [evidence/](evidence/). Useful entry points: [whiteboard failure](evidence/whiteboard-failed.jpg), [template failure](evidence/template-use-failed.jpg), [phone Trash](evidence/mobile-trash-hidden-actions.jpg), [deleted public lesson](evidence/permanent-delete-student-fresh-tab.jpg), [print preview](evidence/print-preview.jpg), [student gallery](evidence/student-gallery.jpg), [phone editor](evidence/mobile-teacher-editor.jpg), [final published Lesson A](evidence/final-lesson-a.jpg).

This report describes observations on the tested deployment. It does not identify implementation root causes, claim exhaustive coverage, or claim any defects have been fixed.
