(function (global) {
  "use strict";

  // ── Shared constants ───────────────────────────────────────────────
  var PRESET_COLORS = ["#dceafa", "#dfe9e1", "#f2dfd0", "#f1e2b6", "#e8e0f1", "#f5f1e9", "#17375e", "#376fb7", "#f68620"];
  var REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ORCA = "#376fb7";

  // ── Shared helpers ─────────────────────────────────────────────────
  function uid(prefix) {
    return (prefix || "n") + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function hexToRgb(hex) {
    var c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map(function (ch) { return ch + ch; }).join("");
    var n = parseInt(c, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function relLuminance(hex) {
    var rgb = hexToRgb(hex);
    function lin(v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
  }

  function contrastRatio(l1, l2) {
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function textColorFor(bgHex) {
    var lbg = relLuminance(bgHex);
    var ratioDark = contrastRatio(lbg, relLuminance("#13233a"));
    var ratioLight = contrastRatio(lbg, 1);
    return ratioDark >= ratioLight ? "#13233a" : "#ffffff";
  }

  function measureSizes(elements, zoom, sizes) {
    var safeZoom = zoom || 1;
    Object.keys(elements).forEach(function (id) {
      var el = elements[id];
      var card = (el && el.querySelector && el.querySelector(".node__card")) || el;
      var prevTransition = el.style.transition;
      el.style.transition = "none";
      var r = card.getBoundingClientRect();
      sizes[id] = {
        w: r.width > 1 ? r.width / safeZoom : 120,
        h: r.height > 1 ? r.height / safeZoom : 44
      };
      el.style.transition = prevTransition;
    });
  }

  function styleConnector(el, color) {
    if (!el) return;
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", color || "#13233a");
    el.setAttribute("stroke-width", "2");
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    el.setAttribute("stroke-opacity", "0.85");
  }

  function setNodeTransform(el, x, y, scale, opacity) {
    if (!el) return;
    el.style.transform = "translate(" + x + "px," + y + "px) translate(-50%,-50%)" + (scale !== 1 ? " scale(" + scale + ")" : "");
    if (opacity !== undefined) el.style.opacity = String(opacity);
  }

  function animateTo(ctx, targetPositions) {
    var currentPositions = ctx.currentPositions;
    var elements = ctx.elements;
    var enteringSet = ctx.enteringSet;
    var onFrame = ctx.onAnimateFrame;
    var startPositions = {};
    Object.keys(targetPositions).forEach(function (id) {
      startPositions[id] = currentPositions[id]
        ? { x: currentPositions[id].x, y: currentPositions[id].y }
        : { x: targetPositions[id].x, y: targetPositions[id].y };
    });
    var entering = Object.keys(enteringSet);
    var dur = REDUCED_MOTION ? 1 : 380;
    var start = performance.now();
    cancelAnimationFrame(ctx.animHandle);

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function frame(now) {
      var t = Math.min(1, (now - start) / dur);
      var e = easeOutCubic(t);
      Object.keys(targetPositions).forEach(function (id) {
        var from = startPositions[id];
        var to = targetPositions[id];
        var cx = from.x + (to.x - from.x) * e;
        var cy = from.y + (to.y - from.y) * e;
        currentPositions[id] = { x: cx, y: cy };
        var isEntering = enteringSet[id];
        var scale = isEntering ? 0.5 + 0.5 * e : 1;
        var opacity = isEntering ? e : 1;
        setNodeTransform(elements[id], cx, cy, scale, opacity);
      });
      if (onFrame) onFrame();
      if (t < 1) {
        ctx.animHandle = requestAnimationFrame(frame);
      } else {
        entering.forEach(function (id) {
          delete enteringSet[id];
        });
      }
    }
    ctx.animHandle = requestAnimationFrame(frame);
  }

  function createPanZoom(dom) {
    var pan = { x: 0, y: 0 };
    var zoom = 1;

    function applyWorldTransform() {
      dom.world.style.transform = "translate(" + pan.x + "px," + pan.y + "px) scale(" + zoom + ")";
      dom.zoomPct.textContent = Math.round(zoom * 100) + "%";
    }

    function centerView() {
      pan.x = dom.canvasWrap.clientWidth / 2;
      pan.y = dom.canvasWrap.clientHeight / 2;
      zoom = 1;
      applyWorldTransform();
    }

    function zoomBy(factor) {
      var rect = dom.canvasWrap.getBoundingClientRect();
      var mx = rect.width / 2, my = rect.height / 2;
      var wx = (mx - pan.x) / zoom, wy = (my - pan.y) / zoom;
      zoom = Math.max(0.3, Math.min(2.5, zoom * factor));
      pan.x = mx - wx * zoom;
      pan.y = my - wy * zoom;
      applyWorldTransform();
    }

    function fitView(currentPositions, sizes) {
      var ids = Object.keys(currentPositions);
      if (!ids.length) return centerView();
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      ids.forEach(function (id) {
        var p = currentPositions[id];
        var s = sizes[id] || { w: 120, h: 44 };
        minX = Math.min(minX, p.x - s.w / 2);
        maxX = Math.max(maxX, p.x + s.w / 2);
        minY = Math.min(minY, p.y - s.h / 2);
        maxY = Math.max(maxY, p.y + s.h / 2);
      });
      var pad = 60;
      var bw = maxX - minX + pad * 2, bh = maxY - minY + pad * 2;
      var rect = dom.canvasWrap.getBoundingClientRect();
      var newZoom = Math.max(0.3, Math.min(1.6, Math.min(rect.width / bw, rect.height / bh)));
      var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      dom.world.style.transition = "transform .35s ease";
      zoom = newZoom;
      pan.x = rect.width / 2 - cx * zoom;
      pan.y = rect.height / 2 - cy * zoom;
      applyWorldTransform();
      setTimeout(function () {
        dom.world.style.transition = "";
      }, 380);
    }

    function setupZoomButtons(onReset) {
      dom.zoomIn.addEventListener("click", function () { zoomBy(1.2); });
      dom.zoomOut.addEventListener("click", function () { zoomBy(1 / 1.2); });
      dom.zoomReset.addEventListener("click", function () {
        dom.world.style.transition = "transform .3s ease";
        if (onReset) onReset();
        else centerView();
        setTimeout(function () { dom.world.style.transition = ""; }, 320);
      });
      dom.btnFit.addEventListener("click", function () {
        fitView.apply(null, arguments.length ? arguments : []);
      });
    }

    function setupWheel() {
      dom.canvasWrap.addEventListener(
        "wheel",
        function (e) {
          e.preventDefault();
          var rect = dom.canvasWrap.getBoundingClientRect();
          var mx = e.clientX - rect.left, my = e.clientY - rect.top;
          var wx = (mx - pan.x) / zoom, wy = (my - pan.y) / zoom;
          var newZoom = zoom * (1 - e.deltaY * 0.0012);
          newZoom = Math.max(0.3, Math.min(2.5, newZoom));
          zoom = newZoom;
          pan.x = mx - wx * zoom;
          pan.y = my - wy * zoom;
          applyWorldTransform();
        },
        { passive: false }
      );
    }

    return {
      pan: pan,
      zoom: zoom,
      getZoom: function () { return zoom; },
      setZoom: function (z) { zoom = z; },
      applyWorldTransform: applyWorldTransform,
      centerView: centerView,
      zoomBy: zoomBy,
      fitView: fitView,
      setupZoomButtons: setupZoomButtons,
      setupWheel: setupWheel
    };
  }

  function createColorPopover(dom, getColor, setColor) {
    var popoverForId = null;

    function openColorPopover(id, anchorBtn) {
      popoverForId = id;
      dom.colorPopover.innerHTML = "";
      PRESET_COLORS.forEach(function (hex) {
        var b = document.createElement("button");
        b.className = "swatch";
        b.style.background = hex;
        b.type = "button";
        b.setAttribute("aria-label", "Set colour " + hex);
        b.addEventListener("click", function () {
          setColor(id, hex);
          closeColorPopover();
        });
        dom.colorPopover.appendChild(b);
      });
      var custom = document.createElement("label");
      custom.className = "swatch swatch--custom";
      var input = document.createElement("input");
      input.type = "color";
      input.value = getColor(id);
      input.addEventListener("input", function () {
        setColor(id, input.value);
      });
      custom.appendChild(input);
      dom.colorPopover.appendChild(custom);

      var rect = anchorBtn.getBoundingClientRect();
      dom.colorPopover.style.left = Math.min(rect.left, window.innerWidth - 220) + "px";
      dom.colorPopover.style.top = rect.bottom + 8 + "px";
      dom.colorPopover.classList.add("is-open");
    }

    function closeColorPopover() {
      dom.colorPopover.classList.remove("is-open");
      popoverForId = null;
    }

    document.addEventListener("pointerdown", function (e) {
      if (!dom.colorPopover.classList.contains("is-open")) return;
      if (dom.colorPopover.contains(e.target)) return;
      if (e.target.closest && e.target.closest(".node__color")) return;
      closeColorPopover();
    });

    return {
      open: openColorPopover,
      close: closeColorPopover,
      getPopoverForId: function () { return popoverForId; }
    };
  }

  function setupToolbar(dom, config, handlers) {
    dom.btnNew.addEventListener("click", handlers.onNew);
    dom.btnExport.addEventListener("click", handlers.onExport);
    dom.btnImport.addEventListener("click", function () { dom.fileInput.click(); });
    dom.fileInput.addEventListener("change", function () {
      var file = dom.fileInput.files && dom.fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          handlers.onImport(JSON.parse(String(reader.result)));
        } catch (e) {
          alert(config.strings.importError);
        }
      };
      reader.readAsText(file);
      dom.fileInput.value = "";
    });
    dom.fabAdd.textContent = config.strings.fabLabel;
    dom.fabAdd.setAttribute("aria-label", config.strings.fabLabel);
    if (dom.emptyHint) {
      var p = dom.emptyHint.querySelector("p");
      if (p) p.textContent = config.strings.emptyHint;
    }
    dom.canvasWrap.setAttribute("aria-label", config.strings.canvasLabel);
  }

  function exportJson(state, exportPrefix) {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = exportPrefix + "-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function resetCanvas(dom) {
    dom.nodesLayer.innerHTML = "";
    dom.edgesSvg.innerHTML = "";
  }

  // ── Mind map mode ──────────────────────────────────────────────────
  function initMindmap(config, dom) {
    var H_GAP = 232;
    var V_GAP = 16;
    var STORAGE_KEY = config.storageKey;
    var embedded = !!config.embedded;
    var readOnly = !!config.readOnly;
    var teardown = [];

    var state = null;
    var selectedId = null;
    var isEditingId = null;
    var elements = {};
    var currentPositions = {};
    var sizes = {};
    var enteringSet = {};
    var edgePaths = {};
    var animHandle = null;
    var saveTimer = null;
    var dragMoved = false;

    var pz = createPanZoom(dom);
    var pan = pz.pan;
    var zoom = pz.zoom;

    function getZoom() { return pz.getZoom(); }

    function createInitialState() {
      var rootId = uid("n");
      var nodes = {};
      nodes[rootId] = {
        id: rootId,
        parentId: null,
        text: "Central idea",
        color: "#17375e",
        textColor: "#ffffff",
        side: null,
        childIds: []
      };
      return { kind: "mindmap", rootId: rootId, nodes: nodes };
    }

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        if (config.onChange) {
          var out = JSON.parse(JSON.stringify(state));
          out.kind = "mindmap";
          config.onChange(out);
          return;
        }
        if (!STORAGE_KEY) return;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) { /* ignore */ }
      }, 400);
    }

    function loadState() {
      if (config.initialState) return config.initialState;
      if (!STORAGE_KEY) return null;
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (parsed && parsed.rootId && parsed.nodes && parsed.nodes[parsed.rootId]) {
          if (!parsed.kind) parsed.kind = "mindmap";
          return parsed;
        }
      } catch (e) { /* ignore */ }
      return null;
    }

    state = loadState() || createInitialState();
    selectedId = state.rootId;

    function node(id) { return state.nodes[id]; }
    function isRoot(id) { return id === state.rootId; }

    function descendantIds(id, acc) {
      acc = acc || [];
      var n = node(id);
      if (!n) return acc;
      acc.push(id);
      for (var i = 0; i < n.childIds.length; i++) descendantIds(n.childIds[i], acc);
      return acc;
    }

    function balancedSide() {
      var kids = node(state.rootId).childIds;
      var left = 0, right = 0;
      for (var i = 0; i < kids.length; i++) (node(kids[i]).side === "left" ? left++ : right++);
      return right <= left ? "right" : "left";
    }

    function setSideRecursive(id, side) {
      node(id).side = side;
      var kids = node(id).childIds;
      for (var i = 0; i < kids.length; i++) setSideRecursive(kids[i], side);
    }

    function addChild(parentId) {
      var parent = node(parentId);
      if (!parent) return;
      var id = uid("n");
      var side = isRoot(parentId) ? balancedSide() : parent.side;
      var color = isRoot(parentId) ? PRESET_COLORS[parent.childIds.length % PRESET_COLORS.length] : parent.color;
      state.nodes[id] = {
        id: id,
        parentId: parentId,
        text: "",
        color: color,
        textColor: textColorFor(color),
        side: side,
        childIds: []
      };
      parent.childIds.push(id);
      enteringSet[id] = true;
      selectedId = id;
      render();
      requestAnimationFrame(function () { startEdit(id); });
    }

    function addSibling(id) {
      if (isRoot(id)) return addChild(id);
      var n = node(id);
      addChildAfter(n.parentId, id);
    }

    function addChildAfter(parentId, afterId) {
      var parent = node(parentId);
      var newId = uid("n");
      var refNode = node(afterId);
      var color = refNode.color;
      state.nodes[newId] = {
        id: newId,
        parentId: parentId,
        text: "",
        color: color,
        textColor: textColorFor(color),
        side: refNode.side,
        childIds: []
      };
      var idx = parent.childIds.indexOf(afterId);
      parent.childIds.splice(idx + 1, 0, newId);
      enteringSet[newId] = true;
      selectedId = newId;
      render();
      requestAnimationFrame(function () { startEdit(newId); });
    }

    function deleteNode(id) {
      if (isRoot(id)) return;
      var ids = descendantIds(id);
      if (ids.length > 1) {
        var ok = confirm('Delete "' + (node(id).text || "this idea") + '" and its ' + (ids.length - 1) + " sub-idea(s)?");
        if (!ok) return;
      }
      var parentId = node(id).parentId;
      var parent = node(parentId);
      parent.childIds.splice(parent.childIds.indexOf(id), 1);
      ids.forEach(function (rid) {
        exitNode(rid);
        delete state.nodes[rid];
      });
      selectedId = parentId;
      render();
    }

    function reparent(id, newParentId) {
      if (id === newParentId) return false;
      var forbidden = descendantIds(id);
      if (forbidden.indexOf(newParentId) !== -1) return false;
      var n = node(id);
      if (n.parentId === newParentId) return false;
      var oldParent = node(n.parentId);
      oldParent.childIds.splice(oldParent.childIds.indexOf(id), 1);
      var newParent = node(newParentId);
      newParent.childIds.push(id);
      n.parentId = newParentId;
      var newSide = isRoot(newParentId) ? balancedSide() : newParent.side;
      setSideRecursive(id, newSide);
      render();
      return true;
    }

    function setText(id, text) {
      node(id).text = text || "Untitled";
      render();
    }

    function setColor(id, hex) {
      var n = node(id);
      n.color = hex;
      n.textColor = textColorFor(hex);
      scheduleSave();
      updateNodeStyle(id);
    }

    var colorPopover = createColorPopover(dom, function (id) { return node(id).color; }, setColor);

    function startEdit(id) {
      var el = elements[id];
      if (!el) return;
      var span = el.querySelector(".node__text");
      isEditingId = id;
      span.setAttribute("contenteditable", "true");
      span.dataset.original = span.textContent;
      select(id);
      span.focus();
      if (document.execCommand) document.execCommand("selectAll", false, null);
      var range = document.createRange();
      range.selectNodeContents(span);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function commitEdit(id) {
      var el = elements[id];
      if (!el) return;
      var span = el.querySelector(".node__text");
      span.setAttribute("contenteditable", "false");
      isEditingId = null;
      setText(id, span.textContent.trim());
    }

    function cancelEdit(id) {
      var el = elements[id];
      if (!el) return;
      var span = el.querySelector(".node__text");
      span.textContent = span.dataset.original || "";
      span.setAttribute("contenteditable", "false");
      isEditingId = null;
    }

    function select(id) {
      selectedId = id;
      Object.keys(elements).forEach(function (k) {
        elements[k].classList.toggle("is-selected", k === id);
      });
      colorPopover.close();
    }

    function createNodeEl(id) {
      var el = document.createElement("div");
      el.className = "node";
      el.dataset.id = id;

      var card = document.createElement("div");
      card.className = "node__card";

      var text = document.createElement("span");
      text.className = "node__text";
      text.setAttribute("spellcheck", "false");
      card.appendChild(text);

      var addBtn = document.createElement("button");
      addBtn.className = "node__btn node__add";
      addBtn.type = "button";
      addBtn.textContent = "+";
      addBtn.title = "Add child (Tab)";
      addBtn.setAttribute("aria-label", "Add child idea");

      var colorBtn = document.createElement("button");
      colorBtn.className = "node__btn node__color";
      colorBtn.type = "button";
      colorBtn.textContent = "●";
      colorBtn.title = "Colour";
      colorBtn.setAttribute("aria-label", "Change colour");

      var delBtn = document.createElement("button");
      delBtn.className = "node__btn node__delete";
      delBtn.type = "button";
      delBtn.textContent = "×";
      delBtn.title = "Delete (Del)";
      delBtn.setAttribute("aria-label", "Delete idea");

      el.appendChild(card);
      el.appendChild(addBtn);
      el.appendChild(colorBtn);
      el.appendChild(delBtn);

      card.addEventListener("click", function () {
        if (dragMoved) return;
        if (selectedId === id && !isEditingId) startEdit(id);
        else select(id);
      });
      card.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        startEdit(id);
      });
      text.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          text.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancelEdit(id);
          text.blur();
        } else if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          commitEdit(id);
          addChild(id);
        }
      });
      text.addEventListener("blur", function () {
        if (isEditingId === id) commitEdit(id);
      });
      addBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        select(id);
        addChild(id);
      });
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteNode(id);
      });
      colorBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        colorPopover.open(id, colorBtn);
      });

      el.addEventListener("pointerdown", function (e) {
        if (e.target === addBtn || e.target === colorBtn || e.target === delBtn) return;
        if (isEditingId === id) return;
        if (isRoot(id)) return;
        beginNodeDrag(id, el, e);
      });

      return el;
    }

    function updateNodeStyle(id) {
      var el = elements[id];
      if (!el) return;
      var n = node(id);
      var card = el.querySelector(".node__card");
      card.style.background = n.color;
      card.style.color = n.textColor;
      card.style.borderColor = "rgba(255,255,255,0.85)";
      var span = el.querySelector(".node__text");
      if (span.textContent !== n.text) span.textContent = n.text;
      el.classList.toggle("node--root", isRoot(id));
      el.classList.toggle("node--left", n.side === "left");
      el.classList.toggle("node--right", n.side === "right");
      el.querySelector(".node__color").style.color = n.color;
    }

    function syncDOMNodes() {
      var ids = Object.keys(state.nodes);
      var idSet = {};
      ids.forEach(function (id) {
        idSet[id] = true;
        if (!elements[id]) {
          var el = createNodeEl(id);
          dom.nodesLayer.appendChild(el);
          elements[id] = el;
          if (!currentPositions[id]) {
            var parentId = node(id).parentId;
            var start = (parentId && currentPositions[parentId]) || { x: 0, y: 0 };
            currentPositions[id] = { x: start.x, y: start.y };
          }
        }
        updateNodeStyle(id);
      });
      Object.keys(elements).forEach(function (id) {
        if (!idSet[id]) {
          if (elements[id] && elements[id].parentNode) elements[id].parentNode.removeChild(elements[id]);
          delete elements[id];
          delete currentPositions[id];
        }
      });
    }

    function exitNode(id) {
      var el = elements[id];
      if (!el) return;
      el.style.transition = "opacity .18s ease, transform .18s ease";
      el.style.opacity = "0";
      var t = currentPositions[id] || { x: 0, y: 0 };
      el.style.transform = "translate(" + t.x + "px," + t.y + "px) translate(-50%,-50%) scale(.7)";
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 200);
      delete elements[id];
      delete currentPositions[id];
    }

    function computeLayout() {
      var target = {};
      var root = node(state.rootId);
      target[state.rootId] = { x: 0, y: 0 };

      function layoutNode(id, depth, sign, cursor) {
        var n = node(id);
        var size = sizes[id] || { w: 120, h: 44 };
        if (n.childIds.length === 0) {
          var h = size.h + V_GAP;
          var y = cursor + h / 2 - V_GAP / 2;
          target[id] = { x: depth * H_GAP * sign, y: y };
          return cursor + h;
        }
        var c = cursor;
        var firstY = null, lastY = null;
        for (var i = 0; i < n.childIds.length; i++) {
          c = layoutNode(n.childIds[i], depth + 1, sign, c);
          var cy = target[n.childIds[i]].y;
          if (firstY === null) firstY = cy;
          lastY = cy;
        }
        target[id] = { x: depth * H_GAP * sign, y: (firstY + lastY) / 2 };
        return c;
      }

      ["left", "right"].forEach(function (side) {
        var sign = side === "left" ? -1 : 1;
        var kids = root.childIds.filter(function (cid) { return node(cid).side === side; });
        var cursor = 0;
        kids.forEach(function (cid) {
          cursor = layoutNode(cid, 1, sign, cursor);
        });
        var offset = -cursor / 2;
        kids.forEach(function (cid) {
          descendantIds(cid).forEach(function (did) {
            target[did].y += offset;
          });
        });
      });

      return target;
    }

    function ensureEdgePath(id) {
      if (edgePaths[id]) return edgePaths[id];
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      dom.edgesSvg.appendChild(path);
      edgePaths[id] = path;
      return path;
    }

    function updateEdges() {
      var seen = {};
      Object.keys(state.nodes).forEach(function (id) {
        var n = node(id);
        if (!n.parentId) return;
        var p = currentPositions[n.parentId];
        var c = currentPositions[id];
        if (!p || !c) return;
        seen[id] = true;
        var path = ensureEdgePath(id);
        var sign = n.side === "left" ? -1 : 1;
        var pw = (sizes[n.parentId] || { w: 40 }).w / 2;
        var cw = (sizes[id] || { w: 40 }).w / 2;
        var p1x = p.x + sign * pw, p1y = p.y;
        var p2x = c.x - sign * cw, p2y = c.y;
        var bend = Math.max(24, Math.abs(p2x - p1x) * 0.5);
        var c1x = p1x + sign * bend, c2x = p2x - sign * bend;
        path.setAttribute("d", "M " + p1x + "," + p1y + " C " + c1x + "," + p1y + " " + c2x + "," + p2y + " " + p2x + "," + p2y);
        styleConnector(path, "#13233a");
      });
      Object.keys(edgePaths).forEach(function (id) {
        if (!seen[id]) {
          edgePaths[id].parentNode.removeChild(edgePaths[id]);
          delete edgePaths[id];
        }
      });
    }

    var animCtx = {
      currentPositions: currentPositions,
      elements: elements,
      enteringSet: enteringSet,
      animHandle: animHandle,
      onAnimateFrame: updateEdges
    };

    function render() {
      syncDOMNodes();
      measureSizes(elements, getZoom(), sizes);
      var target = computeLayout();
      animCtx.animHandle = animHandle;
      animateTo(animCtx, target);
      animHandle = animCtx.animHandle;
      updateEdges();
      dom.emptyHint.style.display = node(state.rootId).childIds.length === 0 ? "flex" : "none";
      Object.keys(elements).forEach(function (id) {
        elements[id].classList.toggle("is-selected", id === selectedId);
      });
      scheduleSave();
    }

    function beginNodeDrag(id, el, downEvent) {
      downEvent.preventDefault();
      var startX = downEvent.clientX, startY = downEvent.clientY;
      dragMoved = false;
      var origin = currentPositions[id];
      var dropTargetId = null;

      function onMove(e) {
        var dx = (e.clientX - startX) / getZoom();
        var dy = (e.clientY - startY) / getZoom();
        if (!dragMoved && Math.hypot(e.clientX - startX, e.clientY - startY) > 4) {
          dragMoved = true;
          el.classList.add("is-dragging");
          select(id);
        }
        if (!dragMoved) return;
        setNodeTransform(el, origin.x + dx, origin.y + dy, 1.04, 1);

        dropTargetId = null;
        var elAtPoint = document.elementFromPoint(e.clientX, e.clientY);
        var targetNodeEl = elAtPoint && elAtPoint.closest && elAtPoint.closest(".node");
        Object.keys(elements).forEach(function (k) {
          elements[k].classList.remove("is-drop-target");
        });
        if (targetNodeEl && targetNodeEl.dataset.id !== id) {
          var forbidden = descendantIds(id);
          if (forbidden.indexOf(targetNodeEl.dataset.id) === -1) {
            dropTargetId = targetNodeEl.dataset.id;
            targetNodeEl.classList.add("is-drop-target");
          }
        }
      }

      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        el.classList.remove("is-dragging");
        Object.keys(elements).forEach(function (k) {
          elements[k].classList.remove("is-drop-target");
        });
        if (dragMoved && dropTargetId) reparent(id, dropTargetId);
        else if (dragMoved) render();
        setTimeout(function () { dragMoved = false; }, 0);
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }

    function hardReset() {
      state = createInitialState();
      selectedId = state.rootId;
      elements = {};
      currentPositions = {};
      sizes = {};
      edgePaths = {};
      resetCanvas(dom);
      render();
      pz.centerView();
    }

    function importState(parsed) {
      if (!parsed || !parsed.rootId || !parsed.nodes || !parsed.nodes[parsed.rootId]) throw new Error("bad shape");
      if (parsed.kind && parsed.kind !== "mindmap") throw new Error("wrong kind");
      state = parsed;
      if (!state.kind) state.kind = "mindmap";
      selectedId = state.rootId;
      elements = {};
      currentPositions = {};
      sizes = {};
      edgePaths = {};
      resetCanvas(dom);
      render();
      requestAnimationFrame(function () { pz.fitView(currentPositions, sizes); });
    }

    if (!embedded) {
      setupToolbar(dom, config, {
        onNew: function () {
          if (!confirm(config.strings.newConfirm)) return;
          hardReset();
        },
        onExport: function () {
          var out = JSON.parse(JSON.stringify(state));
          out.kind = "mindmap";
          exportJson(out, config.exportPrefix);
        },
        onImport: importState
      });
    }

    if (!readOnly && dom.fabAdd) {
      dom.fabAdd.addEventListener("click", function () {
        addChild(selectedId || state.rootId);
      });
    } else if (dom.fabAdd) {
      dom.fabAdd.hidden = true;
    }

    pz.setupZoomButtons(function () { pz.centerView(); });
    if (dom.btnFit) dom.btnFit.addEventListener("click", function () { pz.fitView(currentPositions, sizes); });
    pz.setupWheel();

    (function setupCanvasPan() {
      var panning = false, panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0, moved = false;
      dom.canvasWrap.addEventListener("pointerdown", function (e) {
        if (e.target !== dom.canvasWrap && e.target !== dom.edgesSvg && e.target !== dom.world) return;
        panning = true;
        moved = false;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panOriginX = pan.x;
        panOriginY = pan.y;
        dom.canvasWrap.classList.add("is-panning");
      });
      window.addEventListener("pointermove", function (e) {
        if (!panning) return;
        var dx = e.clientX - panStartX, dy = e.clientY - panStartY;
        if (Math.hypot(dx, dy) > 3) moved = true;
        pan.x = panOriginX + dx;
        pan.y = panOriginY + dy;
        pz.applyWorldTransform();
      });
      window.addEventListener("pointerup", function () {
        if (!panning) return;
        panning = false;
        dom.canvasWrap.classList.remove("is-panning");
        if (!moved) select(state.rootId);
      });
      dom.canvasWrap.addEventListener("dblclick", function (e) {
        if (readOnly) return;
        if (e.target !== dom.canvasWrap && e.target !== dom.edgesSvg && e.target !== dom.world) return;
        addChild(selectedId || state.rootId);
      });
    })();

    if (!readOnly) {
      document.addEventListener("keydown", onKeyDown);
      teardown.push(function () { document.removeEventListener("keydown", onKeyDown); });
    }

    function onKeyDown(e) {
      if (isEditingId) return;
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!selectedId) return;

      if (e.key === "Tab") {
        e.preventDefault();
        addChild(selectedId);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (isRoot(selectedId)) addChild(selectedId);
        else addSibling(selectedId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteNode(selectedId);
      } else if (e.key === "F2") {
        e.preventDefault();
        startEdit(selectedId);
      } else if (e.key === "Escape") {
        select(state.rootId);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        var n = node(selectedId);
        if (!n.parentId) return;
        var sibs = node(n.parentId).childIds;
        var idx = sibs.indexOf(selectedId);
        var nextIdx = e.key === "ArrowUp" ? idx - 1 : idx + 1;
        if (nextIdx >= 0 && nextIdx < sibs.length) select(sibs[nextIdx]);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        var cur = node(selectedId);
        if (cur.parentId) select(cur.parentId);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        var cur2 = node(selectedId);
        if (cur2.childIds.length) select(cur2.childIds[0]);
      }
    }

    var resizeTimer = null;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        render();
        pz.fitView(currentPositions, sizes);
      }, 150);
    }
    window.addEventListener("resize", onResize);
    teardown.push(function () { window.removeEventListener("resize", onResize); });

    pz.centerView();
    render();
    requestAnimationFrame(function () {
      render();
      pz.fitView(currentPositions, sizes);
    });

    return {
      destroy: function () {
        clearTimeout(saveTimer);
        cancelAnimationFrame(animHandle);
        teardown.forEach(function (fn) { fn(); });
      }
    };
  }

  // ── Concept map mode ───────────────────────────────────────────────
  function initConceptmap(config, dom) {
    var STORAGE_KEY = config.storageKey;
    var embedded = !!config.embedded;
    var readOnly = !!config.readOnly;
    var teardown = [];
    var CONCEPT_GOLD = "#f1e2b6";
    var CONCEPT_INK = "#13233a";
    var NODE_OFFSET = 160;

    dom.canvasWrap.classList.add("concept-mode");
    dom.edgesSvg.classList.add("concept-edges");

    var state = null;
    var selectedId = null;
    var selectedEdgeId = null;
    var isEditingId = null;
    var elements = {};
    var currentPositions = {};
    var sizes = {};
    var enteringSet = {};
    var edgeGroups = {};
    var animHandle = null;
    var saveTimer = null;
    var dragMoved = false;
    var linkFromId = null;
    var linkTempLine = null;

    var edgeLabelEditor = dom.edgeLabelEditor;
    if (!edgeLabelEditor) {
      edgeLabelEditor = document.createElement("input");
      edgeLabelEditor.type = "text";
      edgeLabelEditor.className = "edge-label-editor";
      edgeLabelEditor.setAttribute("aria-label", "Edit relationship label");
      document.body.appendChild(edgeLabelEditor);
    }

    var linkBanner = dom.linkBanner;

    var pz = createPanZoom(dom);
    var pan = pz.pan;

    function getZoom() { return pz.getZoom(); }

    function createInitialState() {
      var idA = uid("n");
      var idB = uid("n");
      var edgeId = uid("e");
      var nodes = {};
      nodes[idA] = { id: idA, text: "Concept A", color: CONCEPT_GOLD, textColor: CONCEPT_INK, x: -150, y: 0 };
      nodes[idB] = { id: idB, text: "Concept B", color: CONCEPT_GOLD, textColor: CONCEPT_INK, x: 150, y: 0 };
      return {
        kind: "conceptmap",
        nodes: nodes,
        edges: [{ id: edgeId, from: idA, to: idB, label: "relates to" }]
      };
    }

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        if (config.onChange) {
          var out = JSON.parse(JSON.stringify(state));
          out.kind = "conceptmap";
          config.onChange(out);
          return;
        }
        if (!STORAGE_KEY) return;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) { /* ignore */ }
      }, 400);
    }

    function validateImport(parsed) {
      if (!parsed || !parsed.nodes || typeof parsed.nodes !== "object") return false;
      if (parsed.kind === "conceptmap") {
        if (!Array.isArray(parsed.edges) || parsed.edges.length < 1) return false;
      } else if (!Array.isArray(parsed.edges) || parsed.edges.length < 1) {
        return false;
      }
      var ids = Object.keys(parsed.nodes);
      if (!ids.length) return false;
      for (var i = 0; i < ids.length; i++) {
        var n = parsed.nodes[ids[i]];
        if (typeof n.x !== "number" || typeof n.y !== "number") return false;
      }
      return true;
    }

    function loadState() {
      if (config.initialState) return config.initialState;
      if (!STORAGE_KEY) return null;
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (validateImport(parsed)) {
          if (!parsed.kind) parsed.kind = "conceptmap";
          return parsed;
        }
      } catch (e) { /* ignore */ }
      return null;
    }

    state = loadState() || createInitialState();
    selectedId = Object.keys(state.nodes)[0];

    function node(id) { return state.nodes[id]; }
    function nodeIds() { return Object.keys(state.nodes); }

    function edgeById(id) {
      for (var i = 0; i < state.edges.length; i++) {
        if (state.edges[i].id === id) return state.edges[i];
      }
      return null;
    }

    function edgeExists(from, to) {
      for (var i = 0; i < state.edges.length; i++) {
        if (state.edges[i].from === from && state.edges[i].to === to) return true;
      }
      return false;
    }

    function defaultNodeColor() {
      return CONCEPT_GOLD;
    }

    function addNodeAt(x, y, text) {
      var id = uid("n");
      var color = defaultNodeColor();
      state.nodes[id] = {
        id: id,
        text: text || "",
        color: color,
        textColor: textColorFor(color),
        x: x,
        y: y
      };
      enteringSet[id] = true;
      selectedId = id;
      selectedEdgeId = null;
      render();
      return id;
    }

    function addNodeNear(fromId) {
      var from = node(fromId);
      var angle = Math.random() * Math.PI * 2;
      var x = from.x + Math.cos(angle) * NODE_OFFSET;
      var y = from.y + Math.sin(angle) * NODE_OFFSET;
      var id = addNodeAt(x, y, "");
      requestAnimationFrame(function () { startEdit(id); });
      return id;
    }

    function addConnectedNode(fromId, label) {
      var from = node(fromId);
      var angle = Math.random() * Math.PI * 2;
      var x = from.x + Math.cos(angle) * NODE_OFFSET;
      var y = from.y + Math.sin(angle) * NODE_OFFSET;
      var newId = addNodeAt(x, y, "");
      var edgeId = uid("e");
      state.edges.push({ id: edgeId, from: fromId, to: newId, label: label || "relates to" });
      render();
      requestAnimationFrame(function () {
        startEdit(newId);
        openEdgeLabelEditor(edgeId);
      });
      return newId;
    }

    function createEdge(from, to, label) {
      if (from === to) return null;
      if (edgeExists(from, to)) return null;
      var edgeId = uid("e");
      state.edges.push({ id: edgeId, from: from, to: to, label: label || "relates to" });
      selectedEdgeId = edgeId;
      render();
      openEdgeLabelEditor(edgeId);
      return edgeId;
    }

    function deleteEdge(edgeId) {
      state.edges = state.edges.filter(function (e) { return e.id !== edgeId; });
      if (selectedEdgeId === edgeId) selectedEdgeId = null;
      render();
    }

    function deleteNode(id) {
      var ids = nodeIds();
      if (ids.length <= 2) return;
      var connected = state.edges.filter(function (e) { return e.from === id || e.to === id; });
      if (connected.length) {
        var ok = confirm('Delete "' + (node(id).text || "this concept") + '" and its ' + connected.length + " relationship(s)?");
        if (!ok) return;
      }
      state.edges = state.edges.filter(function (e) { return e.from !== id && e.to !== id; });
      exitNode(id);
      delete state.nodes[id];
      if (selectedId === id) {
        var remaining = nodeIds();
        selectedId = remaining[0] || null;
      }
      selectedEdgeId = null;
      render();
    }

    function setText(id, text) {
      node(id).text = text || "Untitled";
      scheduleSave();
      updateNodeStyle(id);
    }

    function setColor(id, hex) {
      var n = node(id);
      n.color = hex;
      n.textColor = textColorFor(hex);
      scheduleSave();
      updateNodeStyle(id);
      updateEdges();
    }

    var colorPopover = createColorPopover(dom, function (id) { return node(id).color; }, setColor);

    function selectNode(id) {
      selectedId = id;
      selectedEdgeId = null;
      Object.keys(elements).forEach(function (k) {
        elements[k].classList.toggle("is-selected", k === id);
      });
      updateEdgeSelection();
      colorPopover.close();
    }

    function selectEdge(edgeId) {
      selectedEdgeId = edgeId;
      Object.keys(elements).forEach(function (k) {
        elements[k].classList.remove("is-selected");
      });
      selectedId = null;
      updateEdgeSelection();
      colorPopover.close();
    }

    function clearSelection() {
      selectedId = null;
      selectedEdgeId = null;
      Object.keys(elements).forEach(function (k) {
        elements[k].classList.remove("is-selected");
      });
      updateEdgeSelection();
    }

    function updateEdgeSelection() {
      Object.keys(edgeGroups).forEach(function (eid) {
        edgeGroups[eid].classList.toggle("is-selected", eid === selectedEdgeId);
      });
    }

    function startEdit(id) {
      var el = elements[id];
      if (!el) return;
      var span = el.querySelector(".node__text");
      isEditingId = id;
      span.setAttribute("contenteditable", "true");
      span.dataset.original = span.textContent;
      selectNode(id);
      span.focus();
      if (document.execCommand) document.execCommand("selectAll", false, null);
      var range = document.createRange();
      range.selectNodeContents(span);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function commitEdit(id) {
      var el = elements[id];
      if (!el) return;
      var span = el.querySelector(".node__text");
      span.setAttribute("contenteditable", "false");
      isEditingId = null;
      setText(id, span.textContent.trim());
    }

    function cancelEdit(id) {
      var el = elements[id];
      if (!el) return;
      var span = el.querySelector(".node__text");
      span.textContent = span.dataset.original || "";
      span.setAttribute("contenteditable", "false");
      isEditingId = null;
    }

    var editingEdgeId = null;
    var editingEdgeOriginal = "";

    function worldToScreen(x, y) {
      var rect = dom.canvasWrap.getBoundingClientRect();
      return {
        x: rect.left + pan.x + x * getZoom(),
        y: rect.top + pan.y + y * getZoom()
      };
    }

    function openEdgeLabelEditor(edgeId) {
      var edge = edgeById(edgeId);
      if (!edge) return;
      editingEdgeId = edgeId;
      editingEdgeOriginal = edge.label;
      var ep = edgeEndpoints(edge.from, edge.to);
      var scr = worldToScreen(ep.mx, ep.my);
      edgeLabelEditor.value = edge.label;
      edgeLabelEditor.style.left = scr.x + "px";
      edgeLabelEditor.style.top = scr.y + "px";
      edgeLabelEditor.style.transform = "translate(-50%, -50%)";
      edgeLabelEditor.classList.add("is-open");
      edgeLabelEditor.focus();
      edgeLabelEditor.select();
      selectEdge(edgeId);
    }

    function closeEdgeLabelEditor(commit) {
      if (!editingEdgeId) return;
      if (commit) {
        var edge = edgeById(editingEdgeId);
        if (edge) {
          var val = edgeLabelEditor.value.trim();
          edge.label = val || "relates to";
          scheduleSave();
          updateEdges();
        }
      } else {
        var edge2 = edgeById(editingEdgeId);
        if (edge2) edge2.label = editingEdgeOriginal;
        updateEdges();
      }
      edgeLabelEditor.classList.remove("is-open");
      editingEdgeId = null;
      editingEdgeOriginal = "";
    }

    edgeLabelEditor.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        closeEdgeLabelEditor(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeEdgeLabelEditor(false);
      }
    });
    edgeLabelEditor.addEventListener("blur", function () {
      if (editingEdgeId) closeEdgeLabelEditor(true);
    });

    function edgeEndpoints(fromId, toId) {
      var fp = currentPositions[fromId];
      var tp = currentPositions[toId];
      if (!fp || !tp) return { x1: 0, y1: 0, x2: 0, y2: 0, mx: 0, my: 0 };
      var fs = sizes[fromId] || { w: 120, h: 44 };
      var ts = sizes[toId] || { w: 120, h: 44 };
      var dx = tp.x - fp.x, dy = tp.y - fp.y;
      var len = Math.hypot(dx, dy) || 1;
      var ux = dx / len, uy = dy / len;
      var x1 = fp.x + ux * fs.w / 2;
      var y1 = fp.y + uy * fs.h / 2;
      var x2 = tp.x - ux * ts.w / 2;
      var y2 = tp.y - uy * ts.h / 2;
      return { x1: x1, y1: y1, x2: x2, y2: y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
    }

    function ensureEdgeGroup(edgeId) {
      if (edgeGroups[edgeId]) return edgeGroups[edgeId];
      var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "graph-edge");
      g.setAttribute("data-edge-id", edgeId);

      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      var bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("class", "graph-edge__label-bg");
      bg.setAttribute("rx", "4");
      bg.setAttribute("ry", "4");
      bg.setAttribute("fill", "#fbf8f2");
      bg.setAttribute("stroke", "rgba(23, 55, 94, 0.10)");
      var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "graph-edge__label");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "middle");

      g.appendChild(line);
      g.appendChild(bg);
      g.appendChild(label);

      g.addEventListener("click", function (e) {
        e.stopPropagation();
        selectEdge(edgeId);
      });
      label.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        openEdgeLabelEditor(edgeId);
      });
      bg.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        openEdgeLabelEditor(edgeId);
      });

      dom.edgesSvg.appendChild(g);
      edgeGroups[edgeId] = g;
      return g;
    }

    function updateEdges() {
      var seen = {};
      state.edges.forEach(function (edge) {
        seen[edge.id] = true;
        var g = ensureEdgeGroup(edge.id);
        var ep = edgeEndpoints(edge.from, edge.to);
        var line = g.querySelector("line");
        var bg = g.querySelector("rect");
        var label = g.querySelector("text");

        line.setAttribute("x1", ep.x1);
        line.setAttribute("y1", ep.y1);
        line.setAttribute("x2", ep.x2);
        line.setAttribute("y2", ep.y2);
        styleConnector(line, "#13233a");

        label.textContent = edge.label;
        var textLen = Math.max(40, edge.label.length * 7 + 16);
        var textH = 18;
        bg.setAttribute("x", ep.mx - textLen / 2);
        bg.setAttribute("y", ep.my - textH / 2);
        bg.setAttribute("width", textLen);
        bg.setAttribute("height", textH);
        label.setAttribute("x", ep.mx);
        label.setAttribute("y", ep.my);

        g.classList.toggle("is-selected", edge.id === selectedEdgeId);
      });

      Object.keys(edgeGroups).forEach(function (eid) {
        if (!seen[eid]) {
          edgeGroups[eid].parentNode.removeChild(edgeGroups[eid]);
          delete edgeGroups[eid];
        }
      });

      if (editingEdgeId && edgeLabelEditor.classList.contains("is-open")) {
        var ed = edgeById(editingEdgeId);
        if (ed) {
          var ep2 = edgeEndpoints(ed.from, ed.to);
          var scr2 = worldToScreen(ep2.mx, ep2.my);
          edgeLabelEditor.style.left = scr2.x + "px";
          edgeLabelEditor.style.top = scr2.y + "px";
        }
      }
    }

    function createNodeEl(id) {
      var el = document.createElement("div");
      el.className = "node";
      el.dataset.id = id;

      var card = document.createElement("div");
      card.className = "node__card";

      var text = document.createElement("span");
      text.className = "node__text";
      text.setAttribute("spellcheck", "false");
      card.appendChild(text);

      var linkBtn = document.createElement("button");
      linkBtn.className = "node__btn node__link";
      linkBtn.type = "button";
      linkBtn.textContent = "⟷";
      linkBtn.title = "Drag to link (draw relationship)";
      linkBtn.setAttribute("aria-label", "Link to another concept");

      var colorBtn = document.createElement("button");
      colorBtn.className = "node__btn node__color";
      colorBtn.type = "button";
      colorBtn.textContent = "●";
      colorBtn.title = "Colour";
      colorBtn.setAttribute("aria-label", "Change colour");

      var delBtn = document.createElement("button");
      delBtn.className = "node__btn node__delete";
      delBtn.type = "button";
      delBtn.textContent = "×";
      delBtn.title = "Delete (Del)";
      delBtn.setAttribute("aria-label", "Delete concept");

      el.appendChild(card);
      el.appendChild(linkBtn);
      el.appendChild(colorBtn);
      el.appendChild(delBtn);

      card.addEventListener("click", function () {
        if (dragMoved) return;
        if (selectedId === id && !isEditingId) startEdit(id);
        else selectNode(id);
      });
      card.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        startEdit(id);
      });
      text.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          text.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancelEdit(id);
          text.blur();
        } else if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          commitEdit(id);
          addConnectedNode(id, "relates to");
        }
      });
      text.addEventListener("blur", function () {
        if (isEditingId === id) commitEdit(id);
      });
      linkBtn.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
        e.preventDefault();
        beginLinkDrag(id, e);
      });
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteNode(id);
      });
      colorBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        colorPopover.open(id, colorBtn);
      });

      card.addEventListener("pointerdown", function (e) {
        if (e.target === linkBtn || e.target === colorBtn || e.target === delBtn) return;
        if (isEditingId === id) return;
        beginNodeMove(id, el, e);
      });

      return el;
    }

    function updateNodeStyle(id) {
      var el = elements[id];
      if (!el) return;
      var n = node(id);
      var card = el.querySelector(".node__card");
      card.style.background = n.color;
      card.style.color = n.textColor;
      card.style.borderColor = "rgba(255,255,255,0.85)";
      var span = el.querySelector(".node__text");
      if (span.textContent !== n.text) span.textContent = n.text;
      el.querySelector(".node__color").style.color = n.color;
    }

    function syncDOMNodes() {
      var ids = nodeIds();
      var idSet = {};
      ids.forEach(function (id) {
        idSet[id] = true;
        if (!elements[id]) {
          var el = createNodeEl(id);
          dom.nodesLayer.appendChild(el);
          elements[id] = el;
          if (!currentPositions[id]) {
            var n = node(id);
            if (enteringSet[id] && selectedId && currentPositions[selectedId]) {
              currentPositions[id] = { x: currentPositions[selectedId].x, y: currentPositions[selectedId].y };
            } else {
              currentPositions[id] = { x: n.x, y: n.y };
            }
          }
        }
        updateNodeStyle(id);
      });
      Object.keys(elements).forEach(function (id) {
        if (!idSet[id]) {
          if (elements[id] && elements[id].parentNode) elements[id].parentNode.removeChild(elements[id]);
          delete elements[id];
          delete currentPositions[id];
        }
      });
    }

    function exitNode(id) {
      var el = elements[id];
      if (!el) return;
      el.style.transition = "opacity .18s ease, transform .18s ease";
      el.style.opacity = "0";
      var t = currentPositions[id] || { x: 0, y: 0 };
      el.style.transform = "translate(" + t.x + "px," + t.y + "px) translate(-50%,-50%) scale(.7)";
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 200);
      delete elements[id];
      delete currentPositions[id];
    }

    function computeLayout() {
      var target = {};
      nodeIds().forEach(function (id) {
        var n = node(id);
        target[id] = { x: n.x, y: n.y };
      });
      return target;
    }

    var animCtx = {
      currentPositions: currentPositions,
      elements: elements,
      enteringSet: enteringSet,
      animHandle: animHandle,
      onAnimateFrame: updateEdges
    };

    function render() {
      syncDOMNodes();
      measureSizes(elements, getZoom(), sizes);
      var target = computeLayout();
      animCtx.animHandle = animHandle;
      animateTo(animCtx, target);
      animHandle = animCtx.animHandle;
      updateEdges();
      dom.emptyHint.style.display = "none";
      Object.keys(elements).forEach(function (id) {
        elements[id].classList.toggle("is-selected", id === selectedId);
      });
      scheduleSave();
    }

    function beginNodeMove(id, el, downEvent) {
      downEvent.preventDefault();
      var startX = downEvent.clientX, startY = downEvent.clientY;
      dragMoved = false;
      var origin = { x: currentPositions[id].x, y: currentPositions[id].y };
      selectNode(id);

      function onMove(e) {
        var dx = (e.clientX - startX) / getZoom();
        var dy = (e.clientY - startY) / getZoom();
        if (!dragMoved && Math.hypot(e.clientX - startX, e.clientY - startY) > 4) {
          dragMoved = true;
          el.classList.add("is-dragging");
        }
        if (!dragMoved) return;
        var nx = origin.x + dx, ny = origin.y + dy;
        currentPositions[id] = { x: nx, y: ny };
        node(id).x = nx;
        node(id).y = ny;
        setNodeTransform(el, nx, ny, 1.04, 1);
        updateEdges();
      }

      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        el.classList.remove("is-dragging");
        if (dragMoved) scheduleSave();
        setTimeout(function () { dragMoved = false; }, 0);
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }

    function showLinkBanner(show) {
      if (!linkBanner) return;
      linkBanner.classList.toggle("is-open", show);
      if (show) linkBanner.textContent = "Drag to another concept to create a relationship";
    }

    function ensureLinkTempLine() {
      if (linkTempLine) return linkTempLine;
      linkTempLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      styleConnector(linkTempLine, ORCA);
      linkTempLine.setAttribute("stroke-dasharray", "6 4");
      linkTempLine.setAttribute("stroke-opacity", "0.45");
      dom.edgesSvg.appendChild(linkTempLine);
      return linkTempLine;
    }

    function removeLinkTempLine() {
      if (linkTempLine && linkTempLine.parentNode) {
        linkTempLine.parentNode.removeChild(linkTempLine);
        linkTempLine = null;
      }
    }

    function beginLinkDrag(fromId, downEvent) {
      downEvent.preventDefault();
      linkFromId = fromId;
      selectNode(fromId);
      dom.canvasWrap.classList.add("is-linking");
      showLinkBanner(true);
      var line = ensureLinkTempLine();
      var start = currentPositions[fromId];
      var fs = sizes[fromId] || { w: 120, h: 44 };

      function clientToWorld(cx, cy) {
        var rect = dom.canvasWrap.getBoundingClientRect();
        return {
          x: (cx - rect.left - pan.x) / getZoom(),
          y: (cy - rect.top - pan.y) / getZoom()
        };
      }

      function onMove(e) {
        var w = clientToWorld(e.clientX, e.clientY);
        var dx = w.x - start.x, dy = w.y - start.y;
        var len = Math.hypot(dx, dy) || 1;
        var ux = dx / len, uy = dy / len;
        line.setAttribute("x1", start.x + ux * fs.w / 2);
        line.setAttribute("y1", start.y + uy * fs.h / 2);
        line.setAttribute("x2", w.x);
        line.setAttribute("y2", w.y);

        var elAtPoint = document.elementFromPoint(e.clientX, e.clientY);
        var targetNodeEl = elAtPoint && elAtPoint.closest && elAtPoint.closest(".node");
        Object.keys(elements).forEach(function (k) {
          elements[k].classList.remove("is-link-target");
        });
        if (targetNodeEl && targetNodeEl.dataset.id !== fromId) {
          targetNodeEl.classList.add("is-link-target");
        }
      }

      function onUp(e) {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        dom.canvasWrap.classList.remove("is-linking");
        showLinkBanner(false);
        removeLinkTempLine();
        Object.keys(elements).forEach(function (k) {
          elements[k].classList.remove("is-link-target");
        });

        var elAtPoint = document.elementFromPoint(e.clientX, e.clientY);
        var targetNodeEl = elAtPoint && elAtPoint.closest && elAtPoint.closest(".node");
        if (targetNodeEl && targetNodeEl.dataset.id !== fromId) {
          createEdge(fromId, targetNodeEl.dataset.id, "relates to");
        }
        linkFromId = null;
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }

    function hardReset() {
      state = createInitialState();
      selectedId = Object.keys(state.nodes)[0];
      selectedEdgeId = null;
      elements = {};
      currentPositions = {};
      sizes = {};
      edgeGroups = {};
      resetCanvas(dom);
      dom.edgesSvg.classList.add("concept-edges");
      render();
      pz.centerView();
    }

    function importState(parsed) {
      if (!validateImport(parsed)) throw new Error("bad shape");
      if (parsed.kind && parsed.kind !== "conceptmap" && parsed.kind !== undefined) throw new Error("wrong kind");
      state = parsed;
      if (!state.kind) state.kind = "conceptmap";
      selectedId = Object.keys(state.nodes)[0];
      selectedEdgeId = null;
      elements = {};
      currentPositions = {};
      sizes = {};
      edgeGroups = {};
      resetCanvas(dom);
      dom.edgesSvg.classList.add("concept-edges");
      render();
      requestAnimationFrame(function () { pz.fitView(currentPositions, sizes); });
    }

    if (!embedded) {
      setupToolbar(dom, config, {
        onNew: function () {
          if (!confirm(config.strings.newConfirm)) return;
          hardReset();
        },
        onExport: function () {
          var out = JSON.parse(JSON.stringify(state));
          out.kind = "conceptmap";
          exportJson(out, config.exportPrefix);
        },
        onImport: importState
      });
    }

    if (!readOnly && dom.fabAdd) {
      dom.fabAdd.addEventListener("click", function () {
        if (selectedId) addNodeNear(selectedId);
        else addNodeAt(0, 0, "");
      });
    } else if (dom.fabAdd) {
      dom.fabAdd.hidden = true;
    }

    pz.setupZoomButtons(function () { pz.centerView(); });
    if (dom.btnFit) dom.btnFit.addEventListener("click", function () { pz.fitView(currentPositions, sizes); });
    pz.setupWheel();

    (function setupCanvasPan() {
      var panning = false, panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0, moved = false;
      dom.canvasWrap.addEventListener("pointerdown", function (e) {
        if (e.target !== dom.canvasWrap && e.target !== dom.edgesSvg && e.target !== dom.world) return;
        if (e.target.closest && e.target.closest(".graph-edge")) return;
        panning = true;
        moved = false;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panOriginX = pan.x;
        panOriginY = pan.y;
        dom.canvasWrap.classList.add("is-panning");
      });
      window.addEventListener("pointermove", function (e) {
        if (!panning) return;
        var dx = e.clientX - panStartX, dy = e.clientY - panStartY;
        if (Math.hypot(dx, dy) > 3) moved = true;
        pan.x = panOriginX + dx;
        pan.y = panOriginY + dy;
        pz.applyWorldTransform();
        if (editingEdgeId) updateEdges();
      });
      window.addEventListener("pointerup", function () {
        if (!panning) return;
        panning = false;
        dom.canvasWrap.classList.remove("is-panning");
        if (!moved) clearSelection();
      });
    })();

    function cycleNode(dir) {
      var ids = nodeIds().sort();
      if (!ids.length) return;
      if (!selectedId) {
        selectNode(ids[0]);
        return;
      }
      var idx = ids.indexOf(selectedId);
      var next = idx + dir;
      if (next < 0) next = ids.length - 1;
      if (next >= ids.length) next = 0;
      selectNode(ids[next]);
    }

    if (!readOnly) {
      document.addEventListener("keydown", onKeyDown);
      teardown.push(function () { document.removeEventListener("keydown", onKeyDown); });
    }

    function onKeyDown(e) {
      if (isEditingId) return;
      if (editingEdgeId && document.activeElement === edgeLabelEditor) return;
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Tab") {
        e.preventDefault();
        if (selectedId) addConnectedNode(selectedId, "relates to");
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedId) addNodeNear(selectedId);
        else addNodeAt(0, 0, "");
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedEdgeId) deleteEdge(selectedEdgeId);
        else if (selectedId) deleteNode(selectedId);
      } else if (e.key === "F2") {
        e.preventDefault();
        if (selectedId) startEdit(selectedId);
      } else if (e.key === "Escape") {
        if (linkFromId) {
          linkFromId = null;
          dom.canvasWrap.classList.remove("is-linking");
          showLinkBanner(false);
          removeLinkTempLine();
        }
        if (editingEdgeId) closeEdgeLabelEditor(false);
        clearSelection();
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        cycleNode(-1);
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        cycleNode(1);
      }
    }

    var resizeTimer = null;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        render();
        pz.fitView(currentPositions, sizes);
      }, 150);
    }
    window.addEventListener("resize", onResize);
    teardown.push(function () { window.removeEventListener("resize", onResize); });

    pz.centerView();
    render();
    requestAnimationFrame(function () {
      render();
      pz.fitView(currentPositions, sizes);
    });

    return {
      destroy: function () {
        clearTimeout(saveTimer);
        cancelAnimationFrame(animHandle);
        teardown.forEach(function (fn) { fn(); });
      }
    };
  }

  // ── Boot ───────────────────────────────────────────────────────────
  function boot(config) {
    if (!config || !config.mode) throw new Error("GraphMakerEngine.boot requires config.mode");
    if (!config.embedded && !config.storageKey) {
      throw new Error("GraphMakerEngine.boot requires config.storageKey");
    }

    var dom = config.domOverride || {
      canvasWrap: document.getElementById("canvasWrap"),
      world: document.getElementById("world"),
      edgesSvg: document.getElementById("edges"),
      nodesLayer: document.getElementById("nodesLayer"),
      emptyHint: document.getElementById("emptyHint"),
      colorPopover: document.getElementById("colorPopover"),
      zoomPct: document.getElementById("zoomPct"),
      fileInput: document.getElementById("fileInput"),
      btnNew: document.getElementById("btnNew"),
      btnImport: document.getElementById("btnImport"),
      btnExport: document.getElementById("btnExport"),
      btnFit: document.getElementById("btnFit"),
      zoomIn: document.getElementById("zoomIn"),
      zoomOut: document.getElementById("zoomOut"),
      zoomReset: document.getElementById("zoomReset"),
      fabAdd: document.getElementById("fabAdd"),
      hintBar: document.getElementById("hintBar"),
      linkBanner: document.getElementById("linkBanner"),
      edgeLabelEditor: document.getElementById("edgeLabelEditor")
    };

    if (!dom.canvasWrap || !dom.world || !dom.edgesSvg || !dom.nodesLayer) {
      throw new Error("GraphMakerEngine.boot: required DOM elements missing");
    }

    if (config.embedded) dom.canvasWrap.classList.add("graph-maker--embedded");
    if (config.readOnly) dom.canvasWrap.classList.add("graph-maker--readonly");

    if (config.mode === "mindmap") {
      return initMindmap(config, dom);
    }
    if (config.mode === "conceptmap") {
      return initConceptmap(config, dom);
    }
    throw new Error("GraphMakerEngine.boot: unknown mode " + config.mode);
  }

  global.GraphMakerEngine = { boot: boot };
})(window);
