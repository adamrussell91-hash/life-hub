/**
 * Timeline motion engine.
 *
 * One requestAnimationFrame loop drives every tween on the Timeline (bars, curves, bands,
 * load columns, ghost bars). Views never start their own timers, CSS transitions on SVG
 * attributes, or per-element loops. They call `to`, `enter`, `exit` or `place`, and the
 * engine calls `apply(id, props)` once per changed entity per frame.
 *
 * Guarantees (each is covered by tests/unit/hub-motion-engine.test.js):
 * - Retargeting mid-flight continues from the current value. Nothing ever jumps.
 * - A retarget uses EASE (fast start, no overshoot), so rapid live updates never wobble.
 * - Asking for the target an entity is already heading to does not restart its tween.
 * - Only one frame is ever requested at a time, and none while idle.
 * - Reduced motion: geometry snaps; opacity fades over MOTION.reducedFade.
 * - Frame cost is measured so tests can assert the budget (see `stats`).
 */
/** Durations in ms. Views import these; they never hard-code their own. */
export const MOTION = {
    settle: 420, // live update: an entity moves because data changed elsewhere
    zoom: 280, // day width changes (zoom pills, wheel, pinch)
    release: 220, // a dragged bar settles onto its snapped day
    cascadeStagger: 30, // dependants follow a released bar, one after another
    enter: 320, // a new bar, curve or chip appears
    exit: 160, // an entity leaves
    expand: 300, // a group opens or closes; rows slide
    rowStagger: 24, // rows revealed by expand, top to bottom
    hover: 120, // hover and focus emphasis
    morph: 620, // Bars <-> Lines flight: the kit spring settles in ~618 ms (see springEasing)
    crossfade: 160, // real views swap during the morph
    reducedFade: 120 // the only motion left under prefers-reduced-motion
};
/**
 * CSS-compatible cubic-bezier. Solves x(t) = progress with Newton-Raphson, falling back
 * to bisection, so the curve matches the browser's to within 1e-4.
 */
export function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t) => ((ay * t + by) * t + cy) * t;
    const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
    const solve = (x) => {
        let t = x;
        for (let i = 0; i < 8; i++) {
            const err = sampleX(t) - x;
            if (Math.abs(err) < 1e-6)
                return t;
            const d = slopeX(t);
            if (Math.abs(d) < 1e-6)
                break;
            t -= err / d;
        }
        let lo = 0;
        let hi = 1;
        t = x;
        while (hi - lo > 1e-6) {
            const v = sampleX(t);
            if (v < x)
                lo = t;
            else
                hi = t;
            t = (lo + hi) / 2;
        }
        return t;
    };
    return (p) => {
        if (p <= 0)
            return 0;
        if (p >= 1)
            return 1;
        return sampleY(solve(p));
    };
}
/** Kit standard easing, same numbers as EASE in graph-svg.ts. */
export const EASE = cubicBezier(0.2, 0.8, 0.2, 1);
/** Kit overshoot, same numbers as OVERSHOOT in graph-svg.ts. Settles and pop-ins. */
export const OVERSHOOT = cubicBezier(0.34, 1.3, 0.64, 1);
export const LINEAR = (t) => t;
const EPS = 1e-6;
function browserClock() {
    return {
        now: () => performance.now(),
        request: (cb) => requestAnimationFrame(cb),
        cancel: (id) => cancelAnimationFrame(id)
    };
}
function prefersReduced() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
export function createMotion(options) {
    const clock = options.clock ?? browserClock();
    const reduced = options.reducedMotion ?? prefersReduced;
    const entities = new Map();
    const frameCosts = [];
    let frameId = null;
    let disposed = false;
    function entity(id) {
        let e = entities.get(id);
        if (!e) {
            e = { props: {}, tweens: new Map(), exiting: null, dirty: false };
            entities.set(id, e);
        }
        return e;
    }
    function schedule() {
        if (frameId !== null || disposed)
            return;
        frameId = clock.request(frame);
    }
    function valueAt(tween, now) {
        if (tween.duration <= 0)
            return tween.to;
        const p = (now - tween.start) / tween.duration;
        if (p <= 0)
            return tween.from;
        if (p >= 1)
            return tween.to;
        return tween.from + (tween.to - tween.from) * tween.easing(p);
    }
    function step(now) {
        let active = false;
        const finishedExits = [];
        for (const [id, e] of entities) {
            for (const [prop, tween] of e.tweens) {
                const v = valueAt(tween, now);
                if (e.props[prop] !== v) {
                    e.props[prop] = v;
                    e.dirty = true;
                }
                if (now >= tween.start + tween.duration)
                    e.tweens.delete(prop);
                else
                    active = true;
            }
            if (e.dirty) {
                e.dirty = false;
                options.apply(id, e.props);
            }
            if (e.exiting && e.tweens.size === 0)
                finishedExits.push([id, e.exiting]);
        }
        for (const [id, done] of finishedExits) {
            entities.delete(id);
            done();
        }
        return active;
    }
    function frame() {
        frameId = null;
        if (disposed)
            return;
        const t0 = clock.now();
        const active = step(t0);
        const cost = clock.now() - t0;
        frameCosts.push(cost);
        if (frameCosts.length > 600)
            frameCosts.shift();
        if (active)
            schedule();
        else
            options.onIdle?.();
    }
    function startTween(e, prop, to, opts, now) {
        const running = e.tweens.get(prop);
        if (running && Math.abs(running.to - to) < EPS)
            return; // already heading there
        const current = running ? valueAt(running, now) : e.props[prop];
        if (current === undefined) {
            e.props[prop] = to;
            e.dirty = true;
            return;
        }
        if (!running && Math.abs(current - to) < EPS)
            return;
        const duration = opts.duration ?? MOTION.settle;
        e.tweens.set(prop, {
            from: current,
            to,
            start: now + (opts.delay ?? 0),
            duration,
            easing: running && opts.easing === OVERSHOOT ? EASE : opts.easing ?? EASE
        });
    }
    function flushDirty(id, e) {
        if (e.dirty) {
            e.dirty = false;
            options.apply(id, e.props);
        }
    }
    const engine = {
        place(id, props) {
            const e = entity(id);
            for (const [prop, value] of Object.entries(props)) {
                e.tweens.delete(prop);
                if (e.props[prop] !== value) {
                    e.props[prop] = value;
                    e.dirty = true;
                }
            }
            flushDirty(id, e);
        },
        to(id, props, opts = {}) {
            const e = entity(id);
            e.exiting = null;
            const now = clock.now();
            if (reduced()) {
                const { opacity, ...geometry } = props;
                engine.place(id, geometry);
                if (opacity !== undefined) {
                    startTween(e, 'opacity', opacity, { duration: MOTION.reducedFade, easing: LINEAR }, now);
                }
            }
            else {
                for (const [prop, value] of Object.entries(props))
                    startTween(e, prop, value, opts, now);
            }
            flushDirty(id, e);
            if (e.tweens.size)
                schedule();
        },
        enter(id, props, opts = {}) {
            const from = opts.from ?? { opacity: 0, scale: 0.6 };
            const start = { ...props, ...from };
            const target = { opacity: 1, scale: 1, ...props };
            if (reduced()) {
                engine.place(id, { ...target, opacity: 0 });
                engine.to(id, { opacity: target.opacity ?? 1 });
                return;
            }
            engine.place(id, start);
            engine.to(id, target, { duration: MOTION.enter, easing: OVERSHOOT, ...opts });
        },
        exit(id, done, opts = {}) {
            const e = entities.get(id);
            if (!e) {
                done();
                return;
            }
            if (e.exiting) {
                e.exiting = done;
                return;
            }
            for (const prop of [...e.tweens.keys()])
                if (prop !== 'opacity')
                    e.tweens.delete(prop);
            e.exiting = done;
            const duration = reduced() ? MOTION.reducedFade : opts.duration ?? MOTION.exit;
            startTween(e, 'opacity', 0, { ...opts, duration, easing: opts.easing ?? EASE }, clock.now());
            if (!e.tweens.size) {
                entities.delete(id);
                done();
                return;
            }
            schedule();
        },
        get: (id) => entities.get(id)?.props,
        forget: (id) => {
            entities.delete(id);
        },
        has: (id) => entities.has(id),
        target: (id, prop) => {
            const e = entities.get(id);
            if (!e)
                return undefined;
            return e.tweens.get(prop)?.to ?? e.props[prop];
        },
        busy: () => [...entities.values()].some((e) => e.tweens.size > 0),
        finish() {
            step(Number.POSITIVE_INFINITY);
            if (frameId !== null) {
                clock.cancel(frameId);
                frameId = null;
            }
        },
        stats() {
            const sorted = [...frameCosts].sort((a, b) => a - b);
            const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
            return { frames: frameCosts.length, p95, max: sorted.length ? sorted[sorted.length - 1] : 0 };
        },
        dispose() {
            disposed = true;
            if (frameId !== null)
                clock.cancel(frameId);
            frameId = null;
            entities.clear();
        }
    };
    return engine;
}
/**
 * Keyed reconcile: the only way a layout change reaches the screen.
 * New ids enter, missing ids exit, the rest tween. Pass `stagger` to delay each entity
 * by its order in `next` (used for cascades and expand).
 */
export function reconcile(engine, next, hooks) {
    const seen = new Set();
    let i = 0;
    for (const [id, props] of next) {
        seen.add(id);
        const delay = (hooks.options?.delay ?? 0) + (hooks.stagger ? i * hooks.stagger : 0);
        if (!engine.has(id)) {
            hooks.create(id);
            engine.enter(id, props, { ...hooks.enterOptions, delay });
        }
        else {
            engine.to(id, props, { ...hooks.options, delay });
        }
        i++;
    }
    for (const id of hooks.previous) {
        if (!seen.has(id) && engine.has(id))
            engine.exit(id, () => hooks.remove(id));
    }
}
