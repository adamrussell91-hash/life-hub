// Knowledge's protocol screen is the shared one in packages/protocol-view (Tasks mounts it too).
// This file points the shared screen at Knowledge's API base, local-data mode and asset folder,
// then re-exports it so existing imports keep working.
import { API_BASE } from "../api/config";
import { USE_LOCAL_DATA } from "../api/client";
import { configureProtocolView } from "../../../../packages/protocol-view/env";

configureProtocolView({
  apiBase: API_BASE,
  useLocalData: USE_LOCAL_DATA,
  assetRoot: `${import.meta.env.BASE_URL}assets/cognitive-protocols`,
});

export * from "../../../../packages/protocol-view/view";
