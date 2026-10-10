# Compact Term calendar

The user approved compact rows and date-spanning strips. Extend the shared calendar used by Tasks and Life, keeping Year navigation and shared capacity calculations.

- [x] Preserve source records and task/project routing, with regression tests.
- [x] Build capacity from live readiness inputs and detect same-count data edits.
- [x] Render compact dated rows, all eight weekly items, proportional project/event spans, and a separate Body capacity plot.
- [x] Integrate native horizontal scrolling, fixed lane labels, full title access, source filters, item edits and finite reduced-motion-aware transitions.
- [x] Verify desktop/mobile scrolling, centering, task links, refresh state, capacity responsiveness and Term/Year navigation in a browser.
- [x] Load real project records with timeline date rules and preserve parent/goal/step relationships.
- [x] Complete specification and quality reviews, production build and browser regressions.
- [x] Prepare the reviewed implementation for a draft PR, with the required pre-PR gate before opening it.

Validation uses the real renderer and Tasks controller, shared model regression tests, browser geometry and interaction checks, and the unchanged repository pre-PR gate. No deployment is authorized by this implementation request.
