const VIEW_NAMES: Record<string, string> = {
  list: "Archive",
  graph: "Graph",
  timeline: "Timeline",
  notebooks: "Notebooks",
  bookshelf: "Bookshelf",
  studio: "Studio",
  compose: "New note",
  chat: "Chat",
  podcast: "Podcast",
  quiz: "Quiz",
  protocols: "Thinking",
};

/** The browser tab for a view, naming the open note on a note page. */
export function tabTitle(view: string, pageTitle?: string | null): string {
  const name = view === "page" ? pageTitle?.trim() : VIEW_NAMES[view];
  return name ? `${name} · Knowledge Hub` : "Knowledge Hub";
}
