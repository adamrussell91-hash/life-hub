/** Sand impressions based on NACC Sharing Noongar Knowledge, tracking worksheet p41,
 * and Nature Study Australia track cards (kangaroo and wombat fore/hind prints).
 * Natural animal tracks only; no reproduction of cultural artwork.
 */
export const CULTURAL_WARNING_LOOP_SECONDS = 20;
type Route = {
    type: string;
    start: number;
    y: number;
    slope: number;
    scale: number;
    steps: number;
};
type Track = Route & {
    i: number;
    born: number;
};
export function trackOpacity(time: number, born: number): number {
    const age = ((time - born) % CULTURAL_WARNING_LOOP_SECONDS + CULTURAL_WARNING_LOOP_SECONDS) % CULTURAL_WARNING_LOOP_SECONDS;
    return age > 7.5 ? 0 : age < .22 ? age / .22 : age < 2.4 ? 1 : Math.pow(1 - (age - 2.4) / 5.1, 1.6);
}
/** One local canvas per callout, never a global decorative animation. */
export function mountCulturalWarningTracks(host: HTMLElement, animate: boolean): void {
    const canvas = document.createElement('canvas');
    canvas.className = 'callout__sand-tracks';
    canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);
    const context = canvas.getContext('2d');
    if (!context) {
        canvas.remove();
        return;
    }
    const ctx: CanvasRenderingContext2D = context;
    let width = 736, height = 150, base: HTMLCanvasElement;
    function noise(x: number, y: number) { const z = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return z - Math.floor(z); }
    function resize() { width = host.clientWidth || 736; height = host.clientHeight || 150; const d = Math.min(window.devicePixelRatio || 1, 2); canvas.width = width * d; canvas.height = height * d; ctx.setTransform(d, 0, 0, d, 0, 0); base = document.createElement('canvas'); base.width = canvas.width; base.height = canvas.height; const b = base.getContext('2d')!; b.scale(d, d); let g = b.createLinearGradient(0, 0, width, height); g.addColorStop(0, '#f7e4c8'); g.addColorStop(.55, '#efd2ad'); g.addColorStop(1, '#d4a16d'); b.fillStyle = g; b.fillRect(0, 0, width, height); for (let i = 0; i < width * height * .35; i++) {
        const x = noise(i, 2) * width, y = noise(i, 5) * height, a = .025 + noise(i, 9) * .14;
        b.fillStyle = i % 2 ? `rgba(109,65,28,${a})` : `rgba(255,250,230,${a * 2})`;
        b.fillRect(x, y, .5 + noise(i, 8), .5 + noise(i, 4));
    } }
    function ellipse(x: number, y: number, rx: number, ry: number, rot = 0) { ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
    function mark(type: string) {
        ctx.beginPath();
        if (type === 'bird') {
            ctx.moveTo(-2, 6);
            ctx.lineTo(-4, -1);
            ctx.lineTo(-15, -14);
            ctx.lineTo(-16, -18);
            ctx.lineTo(-13, -16);
            ctx.lineTo(-3, -7);
            ctx.lineTo(-2, -24);
            ctx.lineTo(0, -29);
            ctx.lineTo(2, -24);
            ctx.lineTo(3, -7);
            ctx.lineTo(13, -18);
            ctx.lineTo(16, -20);
            ctx.lineTo(14, -15);
            ctx.lineTo(4, 0);
            ctx.lineTo(3, 6);
            ctx.quadraticCurveTo(0, 8, -2, 6);
            ctx.closePath();
        }
        else if (type === 'goanna') {
            ellipse(0, 3, 4.5, 7);
            const toes = [[-13, 0], [-12, -12], [-5, -21], [5, -25], [13, -13]];
            for (let j = 0; j < 5; j++) {
                const [ex, ey] = toes[j];
                ctx.moveTo(-2 + j, 2);
                ctx.quadraticCurveTo(ex * .7, ey * .55, ex, ey);
                ctx.lineTo(ex + 1.2, ey - 4);
                ctx.lineTo(ex + 2, ey);
                ctx.quadraticCurveTo(ex * .8, ey * .5, 1 + j * .5, 4);
                ctx.closePath();
            }
        }
        else if (type === 'kangaroo') {
            ctx.moveTo(-3, 19);
            ctx.bezierCurveTo(-9, 16, -7, 6, -5, -4);
            ctx.lineTo(-2, -12);
            ctx.lineTo(4, -13);
            ctx.lineTo(5, 4);
            ctx.bezierCurveTo(7, 17, 4, 23, -3, 19);
            ctx.closePath();
            ellipse(1, -20, 3.4, 7, -.1);
            ellipse(7, -17, 1.8, 4, -.35);
            ellipse(-6, -15, 1.3, 3, .3);
            ctx.moveTo(-.5, -27);
            ctx.lineTo(1, -32);
            ctx.lineTo(2, -27);
            ctx.closePath();
        }
        else {
            if (type === 'wombatHind') {
                ctx.moveTo(-8, -3);
                ctx.bezierCurveTo(-12, 3, -5, 18, 2, 20);
                ctx.bezierCurveTo(8, 20, 10, 1, 6, -5);
                ctx.closePath();
                ellipse(-11, -5, 2.8, 4, .2);
                ellipse(-6, -12, 2.7, 5, -.1);
                ellipse(0, -14, 2.7, 5);
                ellipse(6, -13, 2.7, 4.5);
                ellipse(11, -5, 2, 3.5);
                for (let j = 0; j < 4; j++) {
                    const x = -11 + j * 6;
                    ctx.moveTo(x - 1, -18);
                    ctx.lineTo(x, -23);
                    ctx.lineTo(x + 1, -18);
                    ctx.closePath();
                }
            }
            else {
                ctx.moveTo(-10, 1);
                ctx.bezierCurveTo(-11, 9, -3, 13, 2, 13);
                ctx.bezierCurveTo(10, 11, 13, 0, 8, -4);
                ctx.quadraticCurveTo(0, -8, -10, 1);
                ctx.closePath();
                for (let j = 0; j < 5; j++) {
                    const x = (j - 2) * 5, y = -6 - Math.sin(j / 4 * Math.PI) * 5;
                    ellipse(x, y, 2.5, 3.5, j * .12 - .24);
                    ctx.moveTo(x - 1, y - 5);
                    ctx.lineTo(x + 1, y - 10);
                    ctx.lineTo(x + 1.5, y - 5);
                    ctx.closePath();
                }
            }
        }
    }
    function stamp(type: string, x: number, y: number, angle: number, scale: number, opacity: number, mirror = 1) { ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale * mirror, scale); ctx.globalAlpha = opacity; mark(type); ctx.shadowColor = 'rgba(91,50,20,.2)'; ctx.shadowBlur = 1.4; ctx.shadowOffsetX = .7; ctx.shadowOffsetY = 1; ctx.fillStyle = '#9d6e44'; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.save(); ctx.clip(); for (let j = 0; j < 180; j++) {
        ctx.fillStyle = j % 2 ? 'rgba(255,239,212,.42)' : 'rgba(94,57,24,.18)';
        ctx.fillRect(noise(j, 3) * 36 - 18, noise(j, 5) * 65 - 35, .65, .65);
    } ctx.restore(); ctx.restore(); }
    const tracks: Track[] = [];
    const routes: Route[] = [{ type: 'bird', start: 0, y: .08, slope: .86, scale: .48, steps: 18 }, { type: 'goanna', start: 4, y: .85, slope: -.72, scale: .53, steps: 17 }, { type: 'kangaroo', start: 8, y: .21, slope: .48, scale: .53, steps: 11 }, { type: 'wombat', start: 12, y: .73, slope: -.55, scale: .52, steps: 18 }, { type: 'bird', start: 9, y: .97, slope: -.91, scale: .44, steps: 17 }, { type: 'wombat', start: 1, y: .39, slope: .35, scale: .46, steps: 17 }];
    for (const r of routes)
        for (let i = 0; i < r.steps; i++)
            tracks.push({ ...r, i, born: r.start + i * .38 });
    function draw(t: number) {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(base, 0, 0, width, height);
        for (const m of tracks) {
            const fade = trackOpacity(t, m.born);
            if (fade === 0)
                continue;
            const u = m.i / (m.steps - 1), x = width * (-.03 + u * 1.06), y = height * (m.y + m.slope * u) + Math.sin(u * 4) * 5;
            const a = Math.PI / 2 + Math.atan2(height * m.slope, width * 1.06), side = m.i % 2 ? 1 : -1;
            if (m.type === 'kangaroo') {
                stamp(m.type, x, y - 7, a, m.scale, fade * .38);
                stamp(m.type, x, y + 7, a, m.scale, fade * .38);
            }
            else {
                const hind = m.type === 'wombat' && m.i % 4 > 1;
                stamp(hind ? 'wombatHind' : m.type, x, y + side * (m.type === 'goanna' ? 11 : 7), a + side * .10, m.scale, fade * .38, side);
                if (m.type === 'goanna') {
                    stamp('goanna', x + 10, y - side * 9, a - side * .18, m.scale * .76, fade * .33, -side);
                    ctx.save();
                    ctx.globalAlpha = fade * .13;
                    ctx.strokeStyle = '#985f36';
                    ctx.lineWidth = 1.3;
                    ctx.beginPath();
                    ctx.moveTo(x - 14, y);
                    ctx.quadraticCurveTo(x, y + 3, x + 15, y + 1);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }
    }
    resize();
    draw(5);
    if (!animate)
        return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'callout__motion-toggle';
    let userPaused = false, visible = true, elapsed = 0, last = 0, frame = 0;
    let attached = false, awaitingAttach = 0, disposed = false;
    function syncButton() {
        const paused = userPaused || media.matches;
        button.textContent = paused ? 'Play tracks' : 'Pause tracks';
        button.setAttribute('aria-label', paused ? 'Play cultural warning background tracks' : 'Pause cultural warning background tracks');
        button.setAttribute('aria-pressed', String(!paused));
        button.disabled = media.matches;
    }
    button.addEventListener('click', () => { userPaused = !userPaused; syncButton(); });
    host.querySelector('.callout__head')?.append(button);
    syncButton();
    const onMotionChange = () => { syncButton(); if (media.matches)
        draw(5); };
    media.addEventListener('change', onMotionChange);
    const resizeObserver = new ResizeObserver(() => { resize(); draw(media.matches ? 5 : elapsed % 20); });
    resizeObserver.observe(host);
    const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
        visible = entries[0]?.isIntersecting ?? false;
    });
    intersection?.observe(host);
    function dispose() {
        if (disposed)
            return;
        disposed = true;
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        intersection?.disconnect();
        media.removeEventListener('change', onMotionChange);
    }
    function tick(now: number) {
        if (disposed)
            return;
        if (!host.isConnected) {
            if (attached || ++awaitingAttach > 240) {
                dispose();
                return;
            }
            last = now;
            frame = requestAnimationFrame(tick);
            return;
        }
        attached = true;
        if (last && visible && !document.hidden && !userPaused && !media.matches) {
            elapsed += Math.min((now - last) / 1000, .1);
            draw(elapsed % CULTURAL_WARNING_LOOP_SECONDS);
        }
        last = now;
        frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
}
