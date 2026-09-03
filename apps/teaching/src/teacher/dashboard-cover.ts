import { CoverSchema, type Cover } from '@/schemas';

export const DASHBOARD_COVER_STORAGE_KEY = 'teaching-hub.dashboard-cover';

export function readDashboardCover(): Cover | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_COVER_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const result = CoverSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function writeDashboardCover(cover: Cover | null): void {
  try {
    if (cover) localStorage.setItem(DASHBOARD_COVER_STORAGE_KEY, JSON.stringify(cover));
    else localStorage.removeItem(DASHBOARD_COVER_STORAGE_KEY);
  } catch {
    // Persistence is convenience; ignore quota / private-mode failures.
  }
}
