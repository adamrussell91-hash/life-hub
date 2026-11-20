/**
 * Fleet week toasts on any student page with a class (spec §2).
 *
 * One class-wide signals host (`fleet_signals` through the profile endpoint), shared by every
 * student page that mounts it: the progress page (whose now strip also draws its anchor from
 * it), the class page and the lesson page. A page holds it while mounted and releases it on
 * dispose; the host is dropped when no page holds it, and replaced when the class changes.
 *
 * A lesson page whose arcade reads its own lesson's signals passes `except`, so those events
 * toast once, from the arcade (which opens the game in place), and not again from here.
 */
import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import { studentAnchor } from '@/student/shell';
import { classSignalSource, createFleetSignals, fleetHref, type FleetSignals } from '@/games/kinds/fleet-week/signals';

type Host = { classId: string; signals: FleetSignals; holds: Set<object>; except: Map<object, string>; drop: number };
let host: Host | null = null;
/** How long an unheld host lives, so moving between student pages keeps one host and one read. */
export const HOST_GRACE_MS = 5000;

export type ClassFleetHold = {
  signals: FleetSignals;
  release(): void;
};

function createHost(classId: string): Host {
  const call = <T>(action: 'fleet_signals' | 'fleet_signals_seen', extra: Record<string, unknown> = {}): Promise<T> =>
    apiPost<T>(`/api/published/profile/${encodeURIComponent(classId)}`, { action, class_token: deviceToken(`class:${classId}`), ...extra });
  const except = new Map<object, string>();
  const holds = new Set<object>();
  const signals = createFleetSignals({
    source: classSignalSource((action, extra) => call(action, extra)),
    toastIf: (e) => ![...except.values()].includes(e.lesson_id),
    // A tap goes to the game's lesson, once the seen is stored (or a moment has passed).
    open: (e, seen) => {
      const href = studentAnchor(fleetHref(classId, e), '').href;
      void Promise.race([seen, new Promise((r) => window.setTimeout(r, 1200))]).then(() => {
        if (host?.signals === signals) window.location.assign(href);
      });
    }
  });
  return { classId, signals, holds, except, drop: 0 };
}

/**
 * Hold the class's signals host for this page. `except`: a lesson whose own door (the arcade)
 * toasts its events on this page.
 */
export function holdClassFleetSignals(classId: string, opts: { except?: string } = {}): ClassFleetHold {
  if (host && host.classId !== classId) {
    window.clearTimeout(host.drop);
    host.signals.dispose();
    host = null;
  }
  let h = host;
  if (h) {
    window.clearTimeout(h.drop);
    h.drop = 0;
    // A page arriving on a living host reads again (one read in flight at a time).
    void h.signals.refresh();
  } else h = host = createHost(classId);
  const token = {};
  h.holds.add(token);
  if (opts.except) h.except.set(token, opts.except);
  let released = false;
  return {
    signals: h.signals,
    release() {
      if (released) return;
      released = true;
      h.holds.delete(token);
      h.except.delete(token);
      if (h.holds.size || host !== h) return;
      window.clearTimeout(h.drop);
      h.drop = window.setTimeout(() => {
        if (host !== h || h.holds.size) return;
        h.signals.dispose();
        host = null;
      }, HOST_GRACE_MS);
    }
  };
}

/** Tests only: drop the shared host. */
export function resetClassFleetSignals(): void {
  if (host) window.clearTimeout(host.drop);
  host?.signals.dispose();
  host = null;
}
