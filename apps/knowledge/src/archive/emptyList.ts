export function archiveEmptyHtml(input: { hasArchiveNotes: boolean }): string {
  if (!input.hasArchiveNotes) {
    return `<div class="empty empty--panel">
              <h2>No notes yet</h2>
              <p>Use Make a note, From a book, or Blank note in the top bar.</p>
            </div>`;
  }
  return `<p class="empty">No matching pages.</p>`;
}
