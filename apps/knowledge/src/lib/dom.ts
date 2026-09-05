import { showHubToast } from "../../design-kit/js/hub-feedback.js";

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

export function showToast(message: string) {
  const toast = showHubToast(message);
  toast?.el.classList.add("toast");
}
