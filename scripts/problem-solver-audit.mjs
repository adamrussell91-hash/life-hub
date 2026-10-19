// scripts/problem-solver-audit.mjs
/**
 * Runs in the preview page (serialised with Function.prototype.toString, so it must be
 * self-contained). Checks the renderer lessons: text inside its [data-shape], minimum
 * sizes, contrast against the shape's data-fill token, and 44px targets.
 * `scope` limits the text checks to one subtree (used for the hover pass).
 */
export function auditChart(scope = null) {
  const root = document.querySelector('#mount > *');
  const problems = [];
  const label = (el) => `${el.className?.baseVal ?? el.className} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
  const probe = document.createElement('i');
  probe.style.cssText = 'position:absolute;width:0;height:0';
  root.append(probe);
  const rgba = (s) => {
    const m = String(s).match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
    return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 };
  };
  const token = (name) => {
    probe.style.background = `var(--ps-${name})`;
    return rgba(getComputedStyle(probe).backgroundColor);
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const minimum = (el) => {
    const cls = String(el.className?.baseVal ?? el.className);
    if (/__title/.test(cls)) return 12;
    if (/__meta/.test(cls)) return 10;
    return 9;
  };
  const texts = [...(scope ?? root).querySelectorAll('*')].filter(
    (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && el.getClientRects().length && !el.closest('.sr-only')
  );
  for (const el of texts) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minimum(el)) problems.push(`font ${size}px below ${minimum(el)}px: ${label(el)}`);
    const shape = el.closest('[data-shape]');
    if (!shape) continue;
    const a = el.getBoundingClientRect();
    const b = shape.getBoundingClientRect();
    if (a.left < b.left - 0.5 || a.right > b.right + 0.5 || a.top < b.top - 0.5 || a.bottom > b.bottom + 0.5) problems.push(`text crosses its shape: ${label(el)}`);
    const fill = shape.getAttribute('data-fill');
    if (!fill) continue;
    const bg = token(fill);
    const fg = rgba(getComputedStyle(el).color);
    const alpha = fg.a * opacityOf(el);
    const mix = { r: fg.r * alpha + bg.r * (1 - alpha), g: fg.g * alpha + bg.g * (1 - alpha), b: fg.b * alpha + bg.b * (1 - alpha) };
    const [hi, lo] = [lum(mix), lum(bg)].sort((x, y) => y - x);
    const ratio = (hi + 0.05) / (lo + 0.05);
    if (ratio < 4.5) problems.push(`contrast ${ratio.toFixed(2)}:1 on ${fill}: ${label(el)}`);
  }
  if (!scope) {
    for (const el of root.querySelectorAll('button, a[href], [role="button"], [role="tab"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || el.closest('[data-target-ok]')) continue;
      if (r.width < 44 || r.height < 44) problems.push(`target ${Math.round(r.width)}x${Math.round(r.height)} under 44px: ${label(el)}`);
    }
  }
  probe.remove();
  return problems;
}
