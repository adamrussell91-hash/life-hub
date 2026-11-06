# Food Journal Map Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan.

**Goal:** Browse saved Food Journal venues on a world map.

**Architecture:** Add a Food Journal tab that uses live visits and mounts a MapLibre GeoJSON layer. Reuse the shared basemap loader and entry navigation.

**Tech Stack:** ES modules, MapLibre, Node tests, Playwright.

**Spec:** docs/superpowers/specs/2026-11-06-food-journal-map-design.md

- [x] Check grouping for repeat visits, invalid coordinates and deleted records.
- [x] Build the Map tab, picker, clustered map and entry links. Dispose of the map when the view changes.
- [x] Check navigation and responsive layout using synthetic records. Run the repository gate before opening a PR.
