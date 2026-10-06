# Capacity forecast redesign — Claude Code handoff

**Built:** see [BUILD.md](BUILD.md) for the implementation (Oct 2026), file map and what remains provisional.

This folder captures Adam's agreed direction, research, code audit and interactive prototypes from the 4 October 2026 design conversation. **This is a design/documentation PR. It does not replace the production algorithm or wire the prototypes into Life Hub.**

Start with [implementation-brief.md](implementation-brief.md), then [algorithm.md](algorithm.md), [check-ins-and-logging.md](check-ins-and-logging.md), [weather-states.md](weather-states.md), and [research-and-audit.md](research-and-audit.md).

## Prototype files

- `mockups/capacity-comparison.html`: original-versus-proposed calculation, inputs above aligned scores. Contains the latest illustrative weighted model, including meaningful sleep, yesterday's workload and strenuous exercise effects.
- `mockups/daily-capacity-weather.html`: hourly forecast, weather conditions, uncertainty, explanations, adaptive morning bubbles, discrepancy reasons and example log.
- `mockups/*-standalone.html`: browser-viewable versions with their runtime included. Open locally; no Life Hub writes occur.

The fragment files are the original source used in the conversation. The standalone versions are for Claude/Adam to inspect outside Codex. Icon/runtime resources may require network access. Forecast numbers and history are invented examples, not clinical predictions or fitted coefficients.

## Icon delivery

**Delivered 5 Oct 2026:** the 30 icons are committed under `packages/design-kit/icons/capacity-weather/src/` and recoloured by condition family (see BUILD.md). Original note: **Adam will provide the final 30 weather icons.** Separate 1–30 SVG and transparent PNG files were designed and saved on Adam's Desktop under `Capacity Weather Icons`; do not assume that local folder exists in Claude's environment. The number-to-state contract is in `weather-states.md`. This PR intentionally documents the assets rather than committing them. Use temporary fallbacks while awaiting delivery; integrate the supplied assets without redesigning or renumbering them.

## Scope and provenance

The initial request was read-only repo research; subsequent requests authorised local mockups and icon design. This request authorises a GitHub PR containing the handoff. It does not by itself authorise implementing/deploying the production redesign. All audit findings need checking against the implementation branch before building. Do not publish private Central Node contents, medical details, diary entries or raw health datasets into this public code repository.
