/**
 * Teaching's block editors carry classroom extras: Kaplan and Discern
 * qualifiers, the dictionary / Fry / technique text tools, and a callout's
 * link to a lesson activity. Tasks and Professional run the same editors on
 * their pages, where those extras mean nothing, so they switch them off once
 * at startup. Every block still looks and edits the same in all three hubs.
 */
let enabled = true;

export function setClassroomExtras(on: boolean): void {
  enabled = on;
}

export function classroomExtras(): boolean {
  return enabled;
}
