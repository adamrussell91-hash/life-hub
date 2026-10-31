# WalkThrus board: clusters, Fuse and Proof

Approved 31 Oct 2026. One PR, three commits: Board, Fuse, Proof.

## 1. Board

**Clusters on My board.** My board is a set of named clusters the teacher makes ("+ New cluster", then a name). Each cluster has a heavy caps title with the yellow underline and its tiles touching in a honeycomb under it. Clusters sit apart with clear space between them. Nothing groups itself: adding a technique from Whole book asks which cluster (or "New cluster…"). A technique may sit in several clusters; its goal, ADAPT steps and Proof belong to the technique, so they are shared. Existing `picked` techniques migrate into one cluster called "My board".

**Drag to arrange.** Dragging a tile snaps it to the nearest free cell touching its cluster. Dropping it on another cluster moves it there. Dragging a cluster title moves the cluster. "Take off" removes a tile from that cluster only. Positions save.

**Arrows like the book.** Arrows are orthogonal lines with rounded corners that run in the open space around and between clusters (never through the white gaps between touching tiles). Each starts with a small open circle on the source tile's edge and ends in a long narrow head at the target's edge. Labels sit on the arrow's longest straight run in the book's form: **TYPE** | label text. Arrows that would share a lane are offset onto parallel lanes.

**Tiles.** Same code tab, figure and name. The black progress pill is gone. Progress shows only when there is some: a small white circle with the piece (house, city, dashed house) on the tile's top corner, rep dots beside it. Thick book-style outline.

**Panel.** The A·D·A·P·T chain fits on one line: five outlined hexagons, done ones yellow, the current one black.

Whole book keeps its six series clusters as today.

## 2. Fuse

A fusion is a new technique the teacher builds from two or three existing ones, as the book's Adapt step suggests (reorder, loop back, link, rename). It behaves like a tile everywhere: My board, goals, ADAPT, lesson cards, Proof.

**Bench.** Opened by dropping one tile onto another on My board, or "Fuse with…" in the panel. Left: each parent's five steps, "+ Use" on each, used ones faded, plus "A step of your own". Right: the fusion's steps, reordered by drag (grip) or ↑ ↓ buttons. Each step has an editable heading and instruction prefilled from the source, a "from" chip ("Cold Calling · 1 · edited") and an optional "↻ back to step N". Five steps suggested, not enforced. A name, and "Why fuse them?" (one line, shown above its Proof). Save.

**Where it sits.** In the cluster where it was made, on a free cell touching its parents. A short black weld bridges the gap to each touching parent; a parent in another cluster gets a thin line instead.

**Frame.** Thick black outer edge, a yellow band, two thin inner lines. Top: "FUSED" in small spaced caps over the parent codes large ("90 + 98"). Bottom: the name in heavy caps. Middle: its own drawing.

**Drawing.** Each fusion gets a new drawing in the set's style (outlined white people, no faces, black line art in currentColor, one pen weight, exactly one ink focus, 120 × 90). On save the bench shows the cost (about A$0.10–0.25) and asks to draw. Claude (Sonnet 5.5) is given the fused steps, the parents' scenes as worked examples and the kit's part list, and returns the scene as JSON (a list of kit calls with arguments), never code. The server renders it with the kit and checks it (inside the frame, exactly one ink focus, parts known). One retry on a failed check. The teacher can redraw with a note. Until drawn the tile shows a dashed outline figure.

**Kit.** The drawing kit (`people.mjs`) moves from the private data repo into `packages/walkthrus/draw/`. It is original work. The new hexagon figures move into `packages/walkthrus/glyphs/figure/` with it.

**Privacy.** Fusion step text starts from the book's text, so fusions live in the board document in private storage, never in the repo.

## 3. Proof

**Ticks in the lesson.** The WalkThru card in a lesson's teacher view gets a tick circle on each step. A tick saves at once against that lesson, class and technique (or fusion). Tap again to undo. All steps ticked = ran; some = partly; none = not run. Ticks never show on Display or student pages.

**Lesson score.** For a class and a lesson: the fraction of student answers correct on checks answered in that lesson (hinge first try, quiz items on the latest attempt). A lesson with no check has no score.

**Comparison.** For each technique and fusion, per class: the average score of its *ran* lessons minus the average of that class's lessons with no WalkThru run, with lesson counts on both sides. Partly runs are shown, never averaged.

**What's working.** A ranked list in Learning, strongest difference first. Anything with fewer than 4 scored lessons on either side sits below a line marked "Not enough lessons yet". Tiles carry a small mark (+, −, or not enough yet). The panel shows a Proof strip: a dot per lesson, the averages, the counts. It never says "works" or "better"; it shows the numbers, the class and the counts.

## Out of scope

Chains (a timed sequence through techniques in one lesson), later-retrieval Proof, a vision check on drawings.
