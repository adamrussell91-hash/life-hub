# Standard cover image experience

## Goal

Use the class cover-image experience as the single standard for the Teaching Hub dashboard, classes, units, and lessons. Cover changes must never remount an editor or discard unsaved page content.

## Current problem

The dashboard and class page use `renderEntityBanner`, which presents a read-first banner and opens `mountCoverPicker` in a “Change cover” dialog. The unit page mounts the picker inline, and the lesson builder mounts a compact click-to-edit variant.

Class and unit cover saves also invoke broad refresh callbacks. Those callbacks tear down and rebuild the whole page. Removing a cover therefore destroys any unsaved class-homepage or unit-plan editor state even though the API patch changes only the persisted cover field.

This is client remount loss, not an API wipe. `PATCH /api/classes/:id` and `PATCH /api/units/:id` with `cover: null` delete only the cover property. Homepage blocks and unit-plan blocks on the server remain intact. Unsaved editor-local state has no undo because it was never checkpointed; cover-only changes also do not create version history.

## Design

### Shared experience

Dashboard, class, unit, and lesson surfaces use the same shared cover banner and “Change cover” dialog. The dialog supports:

- setting an HTTP(S) image URL;
- optional alt text;
- choosing an active image from the media library; and
- removing the current cover through an action labelled “Remove cover”.

The same controls, labels, validation, busy state, and error handling apply everywhere.

### Save behavior

Each cover action persists only the entity’s cover field. After a successful save, the shared component updates its local cover value and repaints only the banner. It must not invoke a callback that tears down or remounts the surrounding page.

The owning page may update its in-memory entity and invalidate cached curriculum data without synchronously rebuilding the editor. Any rail refresh must not replace the page canvas.

Dashboard cover persistence remains local to the dashboard’s existing storage mechanism. Class and unit covers continue to use their PATCH endpoints. Lesson cover changes continue through the lesson editor’s existing dirty/save controller so they remain part of the lesson draft.

### Safety and errors

- Removing a cover affects only the cover.
- Unsaved blocks, homepage content, title edits, selections, cursor position, and open editor state remain intact.
- A failed save leaves the dialog open, preserves the previous cover, and displays the returned error.
- Cover controls use `type="button"` and cannot submit or reset a surrounding form.
- “Remove cover” is disabled when no cover exists.

## Testing

Tests are written before implementation and must demonstrate:

1. Dashboard, class, unit, and lesson surfaces expose the same “Change cover” dialog interaction.
2. Setting a URL, choosing library media, and removing a cover produce the expected cover-only update.
3. Removing a class or unit cover does not remount the surrounding page.
4. Unsaved unit-plan, class-homepage, and lesson edits survive cover changes.
5. Failed persistence keeps the previous banner and visible dialog error.
6. Existing cover rendering, alt text, media resolution, and student views continue to pass.

Primary test targets: `entity-banner`, `cover-picker`, `sections-classes`, `sections-units`, `lesson-canvas-page`, and `teacher-home`. Add cover-clear API assertions that class homepage and unit blocks are preserved when `cover` is set to `null`.

## Scope

This change standardizes cover editing and removes the destructive refresh path. It does not redesign unrelated page chrome, change media storage, or alter student-facing cover rendering beyond consuming the same saved cover data.
