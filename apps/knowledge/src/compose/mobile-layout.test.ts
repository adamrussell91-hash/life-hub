/**
 * New note / Edit note phone contract (R4): fields scroll; Save is docked
 * outside the scroll region and must not pad with --vv-offset-bottom.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const main = readFileSync(resolve(root, "src/main.ts"), "utf8");
const css = readFileSync(resolve(root, "src/style.css"), "utf8");
const kitVv = readFileSync(resolve(root, "design-kit/js/visual-viewport.js"), "utf8");
const kitChat = readFileSync(resolve(root, "design-kit/hub-chat-viewport.css"), "utf8");

describe("compose mobile docked Save (R4)", () => {
  it("keeps Save outside the scroll region", () => {
    expect(main).toContain('class="compose__scroll"');
    expect(main).toContain('data-part="form-actions"');
    expect(main).toMatch(/compose__scroll[\s\S]*compose-title[\s\S]*compose-body-host[\s\S]*compose-relationships-host[\s\S]*<\/div>\s*<div class="compose__savebar"/);
    expect(main).toMatch(/compose__savebar" data-part="form-actions"/);
  });

  it("docks the savebar without sticky or keyboard-inset padding", () => {
    expect(css).toMatch(/\.compose__savebar\s*\{[^}]*position:\s*static/);
    expect(css).not.toMatch(/\.compose__savebar\s*\{[^}]*position:\s*sticky/);
    expect(css).not.toMatch(/\.compose__savebar\s*\{[^}]*--vv-offset-bottom/);
    expect(css).toMatch(/\.compose__savebar\s*\{[^}]*safe-area-inset-bottom/);
    expect(css).toMatch(/\.compose__save\s*\{[^}]*min-height:\s*2\.75rem/);
    // Mobile 3rem must win cascade over the base 2.75rem (later in the file).
    const base = css.search(/\.compose__save\s*\{[^}]*min-height:\s*2\.75rem/);
    const phone = css.search(/@media \(max-width: 720px\)\s*\{\s*\.compose__save\s*\{[^}]*min-height:\s*3rem/);
    expect(phone).toBeGreaterThan(base);
  });

  it("pins compose to the visual viewport and hides the phone chrome while typing", () => {
    expect(css).toMatch(/\.canvas:has\(> \.compose\)\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/html\.vv-keyboard-open \.canvas:has\(> \.compose\)\s*\{[^}]*height:\s*var\(--vv-height/);
    expect(css).toContain("body:has(.compose) .floating-chat-button");
    expect(kitChat).toMatch(/html\.vv-keyboard-open:has\(\.compose\) \.hub-mobile-nav/);
    expect(kitChat).toMatch(/body:has\(\.compose:focus-within\) \.hub-mobile-nav/);
    expect(kitVv).toMatch(/\.compose/);
  });
});
