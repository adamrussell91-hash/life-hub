(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    form: $("casting-form"), preset: $("preset"), description: $("voice-description"),
    descriptionCount: $("description-count"), scriptSelect: $("script-select"), scriptText: $("script-text"),
    count: $("count"), seed: $("seed"), seedNote: $("seed-note"), model: $("model-name"),
    temperature: $("temperature"), topP: $("top-p"), topK: $("top-k"),
    repetitionPenalty: $("repetition-penalty"), maxTokens: $("max-tokens"),
    generate: $("generate"), cancel: $("cancel"), retry: $("retry"), error: $("form-error"),
    results: $("results"), empty: $("empty-state"), resultCount: $("result-count"),
    statusCard: $("status-card"), statusLabel: $("status-label"), statusMessage: $("status-message"),
    elapsed: $("elapsed"), progress: $("progress-bar"), live: $("live-status"),
    lockForm: $("lock-form"), lockModel: $("lock-model-name"), lockTests: $("lock-tests"),
    lockSeed: $("lock-seed"), lockMaxTokens: $("lock-max-tokens"), lockGenerate: $("lock-generate"),
    lockCancel: $("lock-cancel"), lockError: $("lock-error"), referenceAudio: $("reference-audio"),
    referenceMeta: $("reference-meta"), referenceText: $("reference-text"),
    lockResults: $("lock-results"), lockEmpty: $("lock-empty-state"),
    lockResultCount: $("lock-result-count"), lockStatusCard: $("lock-status-card"),
    lockStatusLabel: $("lock-status-label"), lockStatusMessage: $("lock-status-message"),
    lockElapsed: $("lock-elapsed"), lockProgress: $("lock-progress-bar"), lockLive: $("lock-live-status")
  };

  let config = null;
  let lastState = null;
  let pollTimer = null;
  let elapsedTimer = null;
  let lockPollTimer = null;
  let lockElapsedTimer = null;
  let lockState = null;
  let castingActive = false;
  let lockActive = false;
  let lastAnnouncement = "";
  let lastLockAnnouncement = "";
  const candidateNodes = new Map();
  const lockNodes = new Map();

  async function request(url, options = {}) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (_) {
      const error = new Error("Could not reach the local Voice Lab server. It may be restarting.");
      error.connection = true;
      throw error;
    }
    let data;
    try { data = await response.json(); } catch (_) { data = null; }
    if (!response.ok) throw new Error(data && data.error ? data.error : `Request failed (${response.status})`);
    return data;
  }

  function setOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function loadConfig(data) {
    const firstLoad = !config;
    config = data;
    els.model.textContent = data.model || "";
    els.model.title = data.model || "";
    els.seedNote.textContent = data.seed_note || "";
    if (!firstLoad) return;
    (data.presets || []).forEach((preset) => setOption(els.preset, preset.id, preset.title));
    (data.scripts || []).forEach((script) => setOption(els.scriptSelect, script.id, script.title));

    const defaults = data.defaults || {};
    els.description.value = defaults.description || "";
    const matchingPreset = (data.presets || []).find((preset) => preset.description === els.description.value);
    els.preset.value = matchingPreset ? matchingPreset.id : "";
    els.scriptSelect.value = defaults.script_id || (data.scripts && data.scripts[0] ? data.scripts[0].id : "");
    els.count.value = defaults.count ?? 3;
    els.seed.value = defaults.seed ?? "";
    els.temperature.value = defaults.temperature ?? 0.9;
    els.topP.value = defaults.top_p ?? 1;
    els.topK.value = defaults.top_k ?? 50;
    els.repetitionPenalty.value = defaults.repetition_penalty ?? 1.05;
    els.maxTokens.value = defaults.max_tokens ?? 1536;
    syncScript();
    updateDescriptionCount();
    loadLockConfig(data.voice_lock);
  }

  function loadLockConfig(lockConfig) {
    if (!lockConfig) {
      els.lockStatusCard.dataset.status = "error";
      els.lockStatusLabel.textContent = "Restart Voice Lab";
      els.lockStatusMessage.textContent = "The server needs one restart to load the new Voice Lock stage.";
      els.lockGenerate.disabled = true;
      return;
    }
    els.lockModel.textContent = lockConfig.model || "";
    els.lockModel.title = lockConfig.model || "";
    const defaults = lockConfig.defaults || {};
    els.lockSeed.value = defaults.seed ?? 600;
    els.lockMaxTokens.value = defaults.max_tokens ?? 768;
    els.lockTests.replaceChildren();
    (lockConfig.tests || []).forEach((test) => {
      const label = document.createElement("label");
      label.className = "test-option";
      const input = document.createElement("input");
      input.type = "checkbox"; input.name = "lock_test"; input.value = test.id;
      input.checked = (defaults.test_ids || []).includes(test.id);
      const copy = document.createElement("span");
      const title = document.createElement("strong"); title.textContent = test.title;
      const text = document.createElement("small"); text.textContent = test.text;
      copy.append(title, text); label.append(input, copy); els.lockTests.appendChild(label);
    });
    const reference = lockConfig.reference || {};
    els.referenceMeta.textContent = `Candidate ${reference.candidate_number || 6} · seed ${reference.seed ?? 45} · ${seconds(reference.reference_seconds)} cloning excerpt`;
    els.referenceText.textContent = reference.reference_text || "";
    if (reference.wav_url) els.referenceAudio.src = reference.wav_url;
    els.lockGenerate.disabled = !reference.available;
    if (!reference.available) {
      els.lockStatusCard.dataset.status = "error";
      els.lockStatusLabel.textContent = "Approved reference missing";
      els.lockStatusMessage.textContent = "Restore Candidate 6 in the approved local folder before running Voice Lock.";
    }
  }

  function syncScript() {
    const script = config && (config.scripts || []).find((item) => item.id === els.scriptSelect.value);
    els.scriptText.value = script ? script.text : "";
  }

  function updateDescriptionCount() {
    els.descriptionCount.textContent = `${els.description.value.length} characters`;
  }

  function pauseOtherAudio(current) {
    [...candidateNodes.values(), ...lockNodes.values()].forEach(({ audio }) => {
      if (audio !== current && !audio.paused) audio.pause();
    });
    if (els.referenceAudio !== current && !els.referenceAudio.paused) els.referenceAudio.pause();
  }

  function seconds(value) {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}s` : "—";
  }

  function dateLabel(value) {
    if (!value) return "Saved candidate";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function addMeta(list, label, value) {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value == null || value === "" ? "—" : String(value);
    list.append(term, detail);
  }

  function makeCandidate(candidate) {
    const item = document.createElement("li");
    item.className = "candidate";
    item.dataset.candidateId = candidate.id;

    const head = document.createElement("div"); head.className = "candidate-head";
    const titleWrap = document.createElement("div"); titleWrap.className = "candidate-title";
    const number = document.createElement("span"); number.className = "candidate-number";
    const text = document.createElement("div");
    const title = document.createElement("h3");
    const created = document.createElement("p"); created.className = "created";
    text.append(title, created); titleWrap.append(number, text);
    const timings = document.createElement("div"); timings.className = "timings";
    const generation = document.createElement("span");
    const duration = document.createElement("span");
    const load = document.createElement("span");
    timings.append(generation, duration, load); head.append(titleWrap, timings);

    const audio = document.createElement("audio");
    audio.controls = true; audio.preload = "metadata";
    audio.ariaLabel = `Play candidate ${candidate.number}`;
    audio.addEventListener("play", () => pauseOtherAudio(audio));
    const warning = document.createElement("p"); warning.className = "warning"; warning.hidden = true;
    const details = document.createElement("details");
    const summary = document.createElement("summary"); summary.textContent = "Candidate details";
    const metadata = document.createElement("dl"); metadata.className = "metadata";
    details.append(summary, metadata);
    const download = document.createElement("a"); download.className = "download"; download.textContent = "Download WAV"; download.download = "";
    item.append(head, audio, warning, details, download);
    els.results.appendChild(item);
    const refs = { item, number, title, created, generation, duration, load, audio, warning, metadata, download };
    candidateNodes.set(candidate.id, refs);
    return refs;
  }

  function updateCandidate(candidate) {
    const refs = candidateNodes.get(candidate.id) || makeCandidate(candidate);
    refs.number.textContent = String(candidate.number).padStart(2, "0");
    refs.title.textContent = `Candidate ${candidate.number}`;
    refs.audio.ariaLabel = `Play candidate ${candidate.number}`;
    refs.created.textContent = dateLabel(candidate.created_at);
    refs.generation.textContent = `generation ${seconds(candidate.generation_seconds)}`;
    refs.duration.textContent = `audio ${seconds(candidate.duration_seconds)}`;
    refs.load.textContent = `load ${seconds(candidate.load_seconds)}`;
    if (refs.audio.getAttribute("src") !== candidate.wav_url) refs.audio.setAttribute("src", candidate.wav_url);
    refs.download.href = candidate.wav_url;
    refs.download.download = `${candidate.id}.wav`;
    refs.warning.textContent = candidate.warning || "";
    refs.warning.hidden = !candidate.warning;

    refs.metadata.replaceChildren();
    addMeta(refs.metadata, "Description", candidate.description);
    addMeta(refs.metadata, "Script", candidate.script);
    addMeta(refs.metadata, "Script ID", candidate.script_id);
    addMeta(refs.metadata, "Seed", candidate.seed);
    addMeta(refs.metadata, "Settings", JSON.stringify(candidate.settings || {}));
    addMeta(refs.metadata, "Model", candidate.model);
    addMeta(refs.metadata, "Revision", candidate.model_revision);
    if (candidate.runtime_versions) addMeta(refs.metadata, "Runtime", JSON.stringify(candidate.runtime_versions));
    addMeta(refs.metadata, "Candidate ID", candidate.id);
  }

  function makeLockClip(clip) {
    const item = document.createElement("li"); item.className = "candidate lock-clip";
    const head = document.createElement("div"); head.className = "candidate-head";
    const titleWrap = document.createElement("div"); titleWrap.className = "candidate-title";
    const number = document.createElement("span"); number.className = "candidate-number";
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    const created = document.createElement("p"); created.className = "created";
    copy.append(title, created); titleWrap.append(number, copy);
    const timings = document.createElement("div"); timings.className = "timings";
    const generation = document.createElement("span"); const duration = document.createElement("span");
    const rtf = document.createElement("span"); timings.append(generation, duration, rtf);
    head.append(titleWrap, timings);
    const script = document.createElement("p"); script.className = "clip-script";
    const audio = document.createElement("audio"); audio.controls = true; audio.preload = "metadata";
    audio.addEventListener("play", () => pauseOtherAudio(audio));
    const warning = document.createElement("p"); warning.className = "warning"; warning.hidden = true;
    const details = document.createElement("details");
    const summary = document.createElement("summary"); summary.textContent = "Voice Lock details";
    const metadata = document.createElement("dl"); metadata.className = "metadata";
    details.append(summary, metadata);
    const download = document.createElement("a"); download.className = "download";
    download.textContent = "Download WAV"; download.download = "";
    item.append(head, script, audio, warning, details, download); els.lockResults.appendChild(item);
    const refs = { item, number, title, created, generation, duration, rtf, script, audio, warning, metadata, download };
    lockNodes.set(clip.id, refs); return refs;
  }

  function updateLockClip(clip) {
    const refs = lockNodes.get(clip.id) || makeLockClip(clip);
    refs.number.textContent = String(clip.number).padStart(2, "0");
    refs.title.textContent = clip.title || "Validation line";
    refs.created.textContent = dateLabel(clip.created_at);
    refs.generation.textContent = `generation ${seconds(clip.generation_seconds)}`;
    refs.duration.textContent = `audio ${seconds(clip.duration_seconds)}`;
    refs.rtf.textContent = `render ${Number.isFinite(Number(clip.realtime_factor)) ? Number(clip.realtime_factor).toFixed(2) + "× audio length" : "—"}`;
    refs.script.textContent = clip.text || "";
    refs.audio.ariaLabel = `Play ${clip.title || "Voice Lock line"}`;
    if (refs.audio.getAttribute("src") !== clip.wav_url) refs.audio.src = clip.wav_url;
    refs.warning.textContent = clip.warning || ""; refs.warning.hidden = !clip.warning;
    refs.download.href = clip.wav_url; refs.download.download = `${clip.id}.wav`;
    refs.metadata.replaceChildren();
    addMeta(refs.metadata, "Test", clip.test_id);
    addMeta(refs.metadata, "Seed", clip.seed);
    addMeta(refs.metadata, "Reference", `Candidate 6 · ${clip.reference_seconds}s`);
    addMeta(refs.metadata, "Settings", JSON.stringify(clip.settings || {}));
    addMeta(refs.metadata, "Model", clip.model);
    addMeta(refs.metadata, "Revision", clip.model_revision);
    addMeta(refs.metadata, "Clip ID", clip.id);
  }

  function announce(message) {
    if (message && message !== lastAnnouncement) {
      els.live.textContent = message;
      lastAnnouncement = message;
    }
  }

  function statusCopy(job) {
    const labels = {
      idle: "Ready to audition", loading: "Loading voice model", generating: "Generating candidates",
      completed: "Audition complete", cancelled: "Generation cancelled", error: "Generation stopped"
    };
    return labels[job.status] || "Voice Lab";
  }

  function renderState(data) {
    lastState = data;
    const job = data.job || { status: "idle", completed: 0, total: 0 };
    const candidates = data.candidates || [];
    candidates.forEach(updateCandidate);
    els.empty.hidden = candidates.length > 0;
    els.resultCount.textContent = candidates.length ? `${candidates.length} saved` : "";
    els.statusCard.dataset.status = job.status || "idle";
    els.statusLabel.textContent = job.cancel_requested ? "Cancellation requested" : statusCopy(job);
    els.statusMessage.textContent = job.error || job.message || "Your completed candidates will stay here between sessions.";
    const total = Number(job.total) || 0;
    const completed = Number(job.completed) || 0;
    els.progress.style.width = total ? `${Math.min(100, completed / total * 100)}%` : "0%";
    const active = job.status === "loading" || job.status === "generating";
    castingActive = active;
    els.generate.disabled = active || lockActive || !config;
    if (config && config.voice_lock) {
      const referenceAvailable = Boolean(config.voice_lock.reference && config.voice_lock.reference.available);
      els.lockGenerate.disabled = active || lockActive || !referenceAvailable;
    }
    els.cancel.hidden = !active;
    els.cancel.disabled = Boolean(job.cancel_requested);
    els.cancel.textContent = job.cancel_requested ? "Cancelling…" : "Cancel after current";
    els.retry.hidden = true;
    announce(`${els.statusLabel.textContent}. ${els.statusMessage.textContent}${total ? ` ${completed} of ${total} complete.` : ""}`);
    updateElapsed(job);
    schedulePoll(active);
  }

  function lockStatusCopy(job) {
    const labels = { idle: "Ready to lock the voice", loading: "Loading cloning model",
      generating: "Generating validation pack", completed: "Validation pack complete",
      cancelled: "Voice Lock cancelled", error: "Voice Lock stopped" };
    return labels[job.status] || "Voice Lock";
  }

  function renderLockState(data) {
    lockState = data;
    const job = data.job || { status: "idle", completed: 0, total: 0 };
    const clips = data.clips || [];
    clips.forEach(updateLockClip);
    els.lockEmpty.hidden = clips.length > 0;
    els.lockResultCount.textContent = clips.length ? `${clips.length} saved` : "";
    els.lockStatusCard.dataset.status = job.status || "idle";
    els.lockStatusLabel.textContent = job.cancel_requested ? "Cancellation requested" : lockStatusCopy(job);
    els.lockStatusMessage.textContent = job.error || job.message || "Ready to test Candidate 6 on new lines.";
    const total = Number(job.total) || 0; const completed = Number(job.completed) || 0;
    els.lockProgress.style.width = total ? `${Math.min(100, completed / total * 100)}%` : "0%";
    lockActive = job.status === "loading" || job.status === "generating";
    const available = Boolean(config && config.voice_lock && config.voice_lock.reference && config.voice_lock.reference.available);
    els.lockGenerate.disabled = lockActive || castingActive || !available;
    els.lockCancel.hidden = !lockActive;
    els.lockCancel.disabled = Boolean(job.cancel_requested);
    els.lockCancel.textContent = job.cancel_requested ? "Cancelling…" : "Cancel after current";
    if (!castingActive) els.generate.disabled = lockActive || !config;
    const announcement = `${els.lockStatusLabel.textContent}. ${els.lockStatusMessage.textContent}${total ? ` ${completed} of ${total} complete.` : ""}`;
    if (announcement !== lastLockAnnouncement) { els.lockLive.textContent = announcement; lastLockAnnouncement = announcement; }
    updateLockElapsed(job);
    clearTimeout(lockPollTimer);
    lockPollTimer = setTimeout(refreshLockState, lockActive ? 1000 : 4000);
  }

  function updateLockElapsed(job = lockState && lockState.job) {
    if (!job || !job.started_at || !["loading", "generating"].includes(job.status)) {
      els.lockElapsed.textContent = ""; clearInterval(lockElapsedTimer); lockElapsedTimer = null; return;
    }
    const paint = () => {
      const latest = lockState && lockState.job;
      const started = latest && latest.started_at ? new Date(latest.started_at).getTime() : NaN;
      const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
      els.lockElapsed.textContent = Number.isFinite(elapsed) ? `${elapsed}s elapsed` : "";
    };
    paint(); if (!lockElapsedTimer) lockElapsedTimer = setInterval(paint, 1000);
  }

  function updateElapsed(job = lastState && lastState.job) {
    if (!job || !job.started_at || !["loading", "generating"].includes(job.status)) {
      els.elapsed.textContent = "";
      clearInterval(elapsedTimer); elapsedTimer = null;
      return;
    }
    const paint = () => {
      const latestJob = lastState && lastState.job;
      const started = latestJob && latestJob.started_at ? new Date(latestJob.started_at).getTime() : NaN;
      const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
      els.elapsed.textContent = Number.isFinite(elapsed) ? `${elapsed}s elapsed` : "";
    };
    paint();
    if (!elapsedTimer) elapsedTimer = setInterval(paint, 1000);
  }

  function schedulePoll(active) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(refreshState, active ? 1000 : 4000);
  }

  function showConnectionError(error) {
    els.statusCard.dataset.status = "error";
    els.statusLabel.textContent = "Connection unavailable";
    els.statusMessage.textContent = error.message;
    els.retry.hidden = false;
    els.generate.disabled = true;
    els.cancel.disabled = true;
    announce(`Voice Lab connection unavailable. ${error.message}`);
  }

  async function refreshState() {
    try { renderState(await request("/api/state")); }
    catch (error) { showConnectionError(error); schedulePoll(false); }
  }

  async function refreshLockState() {
    if (!config || !config.voice_lock) return;
    try { renderLockState(await request("/api/voice-lock/state")); }
    catch (error) {
      els.lockStatusCard.dataset.status = "error";
      els.lockStatusLabel.textContent = "Connection unavailable";
      els.lockStatusMessage.textContent = error.message;
      els.lockGenerate.disabled = true;
      clearTimeout(lockPollTimer); lockPollTimer = setTimeout(refreshLockState, 4000);
    }
  }

  function numericValue(element) { return Number(element.value); }

  function generationPayload() {
    const payload = {
      description: els.description.value.trim(), script_id: els.scriptSelect.value,
      count: numericValue(els.count), temperature: numericValue(els.temperature),
      top_p: numericValue(els.topP), top_k: numericValue(els.topK),
      repetition_penalty: numericValue(els.repetitionPenalty), max_tokens: numericValue(els.maxTokens)
    };
    if (els.seed.value.trim() !== "") payload.seed = numericValue(els.seed);
    return payload;
  }

  async function post(path, body) {
    return request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-voice-lab": "1" },
      body: JSON.stringify(body || {})
    });
  }

  async function generate(event) {
    event.preventDefault();
    els.error.hidden = true;
    if (!els.form.reportValidity()) return;
    els.generate.disabled = true;
    els.generate.textContent = "Starting…";
    try {
      renderState(await post("/api/generate", generationPayload()));
    } catch (error) {
      els.error.textContent = error.message;
      els.error.hidden = false;
      announce(`Generation could not start. ${error.message}`);
      if (error.connection) {
        showConnectionError(error);
        schedulePoll(false);
      } else {
        els.generate.disabled = false;
      }
    } finally {
      els.generate.textContent = "Generate candidates";
    }
  }

  async function cancel() {
    els.cancel.disabled = true;
    els.cancel.textContent = "Cancelling…";
    try { renderState(await post("/api/cancel")); }
    catch (error) {
      els.error.textContent = error.message;
      els.error.hidden = false;
      announce(`Cancellation failed. ${error.message}`);
      if (error.connection) {
        showConnectionError(error);
        schedulePoll(false);
      } else {
        els.cancel.disabled = false;
        els.cancel.textContent = "Cancel after current";
      }
    }
  }

  function lockPayload() {
    return { test_ids: [...els.lockTests.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value),
      seed: numericValue(els.lockSeed), max_tokens: numericValue(els.lockMaxTokens) };
  }

  async function generateLock(event) {
    event.preventDefault(); els.lockError.hidden = true;
    if (!els.lockForm.reportValidity()) return;
    const payload = lockPayload();
    if (!payload.test_ids.length) {
      els.lockError.textContent = "Choose at least one validation line."; els.lockError.hidden = false; return;
    }
    els.lockGenerate.disabled = true; els.lockGenerate.textContent = "Starting…";
    try { renderLockState(await post("/api/voice-lock/generate", payload)); }
    catch (error) { els.lockError.textContent = error.message; els.lockError.hidden = false; els.lockGenerate.disabled = false; }
    finally { els.lockGenerate.textContent = "Generate validation pack"; }
  }

  async function cancelLock() {
    els.lockCancel.disabled = true; els.lockCancel.textContent = "Cancelling…";
    try { renderLockState(await post("/api/voice-lock/cancel")); }
    catch (error) { els.lockError.textContent = error.message; els.lockError.hidden = false; els.lockCancel.disabled = false; }
  }

  async function init() {
    try {
      els.generate.disabled = true;
      if (!config) loadConfig(await request("/api/config"));
      renderState(await request("/api/state"));
      if (config.voice_lock) renderLockState(await request("/api/voice-lock/state"));
    } catch (error) { showConnectionError(error); schedulePoll(false); }
  }

  els.form.addEventListener("submit", generate);
  els.cancel.addEventListener("click", cancel);
  els.retry.addEventListener("click", init);
  els.lockForm.addEventListener("submit", generateLock);
  els.lockCancel.addEventListener("click", cancelLock);
  els.referenceAudio.addEventListener("play", () => pauseOtherAudio(els.referenceAudio));
  els.scriptSelect.addEventListener("change", syncScript);
  els.description.addEventListener("input", () => {
    updateDescriptionCount();
    const matchingPreset = config && (config.presets || []).find((preset) => preset.description === els.description.value);
    els.preset.value = matchingPreset ? matchingPreset.id : "";
  });
  els.preset.addEventListener("change", () => {
    if (!config || !els.preset.value) return;
    const preset = (config.presets || []).find((item) => item.id === els.preset.value);
    if (preset) { els.description.value = preset.description; updateDescriptionCount(); }
  });
  init();
})();
