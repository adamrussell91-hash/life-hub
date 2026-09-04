import { mountMobileChrome } from "../../../packages/design-kit/js/mount-mobile-chrome.js";

export type KnowledgeMobileView =
  | "list"
  | "graph"
  | "timeline"
  | "chat"
  | "visualiser"
  | "podcast"
  | "quiz"
  | string;

const ARCHIVE = ["M4 7h16v12H4z", "M9 7V5h6v2", "M8 12h8"];
const GRAPH = [
  "M6 12a2.2 2.2 0 1 0 4.4 0A2.2 2.2 0 1 0 6 12Z",
  "M12 6a2.2 2.2 0 1 0 4.4 0A2.2 2.2 0 1 0 12 6Z",
  "M18 14a2.2 2.2 0 1 0 4.4 0A2.2 2.2 0 1 0 18 14Z",
  "M8 11l3-3",
  "M13.5 8l3 4"
];
const CHAT = ["M5 6h11v8H5z", "M8 14v3l3-3h5"];
const TIMELINE = [
  "M4 12h16",
  "M6 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0",
  "M12 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0",
  "M18 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0"
];
const PODCAST = [
  "M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  "M8 10a4 4 0 0 0 8 0",
  "M6 10a6 6 0 0 0 12 0",
  "M12 13v6",
  "M9 19h6"
];
const QUIZ = ["M8 4h8v16H8z", "M11 8h2", "M11 12h2", "M11 16h1"];

export type KnowledgeMobileNav = {
  goArchive: () => void;
  goGraph: () => void;
  goChat: () => void;
  goTimeline: () => void;
  goPodcast: () => void;
  goQuiz: () => void;
};

/** Locked phone chrome — same bottom bar + More sheet as every other hub. */
export function syncKnowledgeMobileChrome(
  host: HTMLElement,
  view: KnowledgeMobileView,
  nav: KnowledgeMobileNav
): void {
  mountMobileChrome(host, {
    currentHub: "knowledge",
    primary: [
      {
        id: "archive",
        label: "Archive",
        paths: ARCHIVE,
        current: view === "list",
        onSelect: nav.goArchive
      },
      {
        id: "graph",
        label: "Graph",
        paths: GRAPH,
        current: view === "graph",
        onSelect: nav.goGraph
      },
      {
        id: "chat",
        label: "Chat",
        paths: CHAT,
        current: view === "chat" || view === "visualiser",
        onSelect: nav.goChat
      }
    ],
    more: [
      {
        id: "timeline",
        label: "Timeline",
        paths: TIMELINE,
        onSelect: nav.goTimeline
      },
      {
        id: "podcast",
        label: "Podcast",
        paths: PODCAST,
        onSelect: nav.goPodcast
      },
      {
        id: "quiz",
        label: "Quiz",
        paths: QUIZ,
        onSelect: nav.goQuiz
      }
    ]
  });
}
