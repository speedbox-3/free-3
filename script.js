const API = ""; // same-origin; point this at your API base URL if hosted separately

// ---------- API key rotation ----------
// Round-robins across every key you paste in. On a rate-limit/quota error,
// call markRateLimited(key) and that key is skipped for a cooldown window
// while the others keep going.
class KeyManager {
  constructor(keys = []) {
    this.keys = keys;
    this.idx = 0;
    this.cooldownUntil = new Map();
  }
  setKeys(keys) {
    this.keys = keys;
    this.idx = 0;
    this.cooldownUntil.clear();
  }
  next() {
    if (this.keys.length === 0) return null;
    const now = Date.now();
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[this.idx % this.keys.length];
      this.idx++;
      const until = this.cooldownUntil.get(key);
      if (!until || until < now) return key;
    }
    // everything is cooling down — use the next one anyway rather than stall
    return this.keys[this.idx % this.keys.length];
  }
  markRateLimited(key, cooldownMs = 60000) {
    this.cooldownUntil.set(key, Date.now() + cooldownMs);
  }
  get all() { return this.keys; }
}

// ---------- Model rotation ----------
// Cycles through a fixed model list, or hop to the next one when the
// current model errors out (call next() again inside your catch block).
class ModelRotator {
  constructor(models = []) {
    this.models = models;
    this.idx = 0;
  }
  next() {
    if (this.models.length === 0) return null;
    const m = this.models[this.idx % this.models.length];
    this.idx++;
    return m;
  }
  get all() { return this.models; }
}

const TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const TRANSLATE_MODELS = ["gemini-3-flash-preview", "gemini-3.6-flash", "gemini-robotics-er-2-preview"];

const groqKeyManager = new KeyManager();
const geminiKeyManager = new KeyManager();
const ttsModelRotator = new ModelRotator(TTS_MODELS);
const translateModelRotator = new ModelRotator(TRANSLATE_MODELS);

function parseKeysInput(raw) {
  return raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
}

const STAGES = [
  ["queued","QUEUED"],
  ["extracting_audio","AUDIO"],
  ["transcribing","TRANSCRIBE"],
  ["cleaning_translating","TRANSLATE"],
  ["generating_recap","RECAP"],
  ["dubbing","DUB"],
  ["merging_video","MERGE"],
  ["done","DONE"],
];

let selectedFiles = [];
let subtitleMode = "soft";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const fileListEl = document.getElementById("fileList");
const generateBtn = document.getElementById("generateBtn");
const voiceSelect = document.getElementById("voiceSelect");
const speedRange = document.getElementById("speedRange");
const pitchRange = document.getElementById("pitchRange");
const speedVal = document.getElementById("speedVal");
const pitchVal = document.getElementById("pitchVal");
const recapCheck = document.getElementById("recapCheck");
const queueSection = document.getElementById("queueSection");
const queueEl = document.getElementById("queue");

const themeToggleBtn = document.getElementById("themeToggleBtn");
const settingsToggleBtn = document.getElementById("settingsToggleBtn");
const settingsBody = document.getElementById("settingsBody");
const groqKeysInput = document.getElementById("groqKeysInput");
const geminiKeysInput = document.getElementById("geminiKeysInput");
const saveKeysBtn = document.getElementById("saveKeysBtn");
const keysStatus = document.getElementById("keysStatus");
const ttsModelChips = document.getElementById("ttsModelChips");
const translateModelChips = document.getElementById("translateModelChips");

// --- theme toggle ---
function applyTheme(theme) {
  document.body.classList.toggle("light", theme === "light");
  themeToggleBtn.textContent = theme === "light" ? "☀️" : "🌙";
  localStorage.setItem("mds_theme", theme);
}
themeToggleBtn.addEventListener("click", () => {
  applyTheme(document.body.classList.contains("light") ? "dark" : "light");
});

// --- settings panel collapse ---
settingsToggleBtn.addEventListener("click", () => {
  const hidden = settingsBody.classList.toggle("hidden");
  settingsToggleBtn.textContent = hidden ? "SHOW ▼" : "HIDE ▲";
});

// --- model chips (read-only, just shows the rotation order) ---
ttsModelChips.innerHTML = TTS_MODELS.map(m => `<span class="model-chip"><span class="dot"></span>${m}</span>`).join("");
translateModelChips.innerHTML = TRANSLATE_MODELS.map(m => `<span class="model-chip"><span class="dot"></span>${m}</span>`).join("");

// --- keys: load from localStorage, save back on click ---
function loadKeySettings() {
  const groqRaw = localStorage.getItem("mds_groq_keys") || "";
  const geminiRaw = localStorage.getItem("mds_gemini_keys") || "";
  groqKeysInput.value = groqRaw;
  geminiKeysInput.value = geminiRaw;
  groqKeyManager.setKeys(parseKeysInput(groqRaw));
  geminiKeyManager.setKeys(parseKeysInput(geminiRaw));
}
saveKeysBtn.addEventListener("click", () => {
  localStorage.setItem("mds_groq_keys", groqKeysInput.value);
  localStorage.setItem("mds_gemini_keys", geminiKeysInput.value);
  groqKeyManager.setKeys(parseKeysInput(groqKeysInput.value));
  geminiKeyManager.setKeys(parseKeysInput(geminiKeysInput.value));
  keysStatus.textContent = `SAVED · ${groqKeyManager.all.length} Groq key(s), ${geminiKeyManager.all.length} Gemini key(s)`;
  setTimeout(() => { keysStatus.textContent = ""; }, 3000);
});

applyTheme(localStorage.getItem("mds_theme") || "dark");
loadKeySettings();

// --- voices ---
fetch(`${API}/api/voices`).then(r => r.json()).then(d => {
  voiceSelect.innerHTML = d.voices.map(v => `<option value="${v}">${v}</option>`).join("");
}).catch(() => {
  voiceSelect.innerHTML = `<option value="Kore">Kore</option>`;
});

// --- subtitle mode buttons ---
document.querySelectorAll(".sub-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    subtitleMode = btn.dataset.sub;
    document.querySelectorAll(".sub-btn").forEach(b => {
      b.classList.toggle("glow-magenta", b === btn);
      b.classList.toggle("text-[var(--magenta)]", b === btn);
    });
  });
});
document.querySelector('[data-sub="soft"]').click();

speedRange.addEventListener("input", () => speedVal.textContent = parseFloat(speedRange.value).toFixed(2) + "x");
pitchRange.addEventListener("input", () => pitchVal.textContent = (pitchRange.value > 0 ? "+" : "") + pitchRange.value + " st");

// --- file selection ---
dropzone.addEventListener("click", () => fileInput.click());
["dragenter","dragover"].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add("drag"); }));
["dragleave","drop"].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove("drag"); }));
dropzone.addEventListener("drop", e => addFiles(e.dataTransfer.files));
fileInput.addEventListener("change", e => addFiles(e.target.files));

function addFiles(fileListObj) {
  selectedFiles = [...selectedFiles, ...Array.from(fileListObj)];
  renderFileList();
  generateBtn.disabled = selectedFiles.length === 0;
}

function renderFileList() {
  fileListEl.innerHTML = selectedFiles.map((f, i) =>
    `<li class="flex justify-between"><span>${f.name}</span><span>${(f.size/1024/1024).toFixed(1)} MB</span></li>`
  ).join("");
}

// --- generate ---
generateBtn.addEventListener("click", async () => {
  generateBtn.disabled = true;
  generateBtn.textContent = "▶ SUBMITTING…";
  queueSection.classList.remove("hidden");

  const form = new FormData();
  selectedFiles.forEach(f => form.append("files", f));
  form.append("voice_name", voiceSelect.value);
  form.append("speed", speedRange.value);
  form.append("pitch_semitones", pitchRange.value);
  form.append("subtitle_mode", subtitleMode);
  form.append("make_recap", recapCheck.checked);

  // Keys + models are sent as full lists so the backend can round-robin
  // keys and fall back across models itself (same pattern as key_manager.py).
  form.append("groq_api_keys", groqKeyManager.all.join(","));
  form.append("gemini_api_keys", geminiKeyManager.all.join(","));
  form.append("tts_models", TTS_MODELS.join(","));
  form.append("translate_models", TRANSLATE_MODELS.join(","));

  try {
    const endpoint = selectedFiles.length > 1 ? "/api/jobs/batch" : "/api/jobs";
    const body = selectedFiles.length > 1 ? form : (() => {
      const f2 = new FormData();
      f2.append("file", selectedFiles[0]);
      form.forEach((v, k) => { if (k !== "files") f2.append(k, v); });
      return f2;
    })();
    const resp = await fetch(`${API}${endpoint}`, { method: "POST", body });
    if (!resp.ok) throw new Error(await resp.text());
    const jobs = selectedFiles.length > 1 ? await resp.json() : [await resp.json()];
    jobs.forEach(job => trackJob(job));
    selectedFiles = [];
    renderFileList();
  } catch (err) {
    alert("Upload failed: " + err.message);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "▶ GENERATE";
  }
});

function stageIndex(status) {
  const i = STAGES.findIndex(([key]) => key === status);
  return i === -1 ? 0 : i;
}

function trackJob(job) {
  const card = document.createElement("div");
  card.className = "rounded-md bg-[var(--surface-2)] border border-[var(--line)] p-4";
  card.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <span class="font-display text-sm truncate max-w-[60%]">${job.original_filename}</span>
      <span class="font-mono text-xs text-[var(--cyan)]" data-role="pct">${job.progress}%</span>
    </div>
    <div class="flex gap-2 mb-3" data-role="stages"></div>
    <div class="font-mono text-[10px] text-[var(--ink-dim)]" data-role="status">${job.status}</div>
    <div data-role="actions" class="mt-3"></div>
  `;
  queueEl.prepend(card);

  const stagesEl = card.querySelector('[data-role="stages"]');
  stagesEl.innerHTML = STAGES.map(([key, label]) =>
    `<div class="flex-1 text-center">
       <div class="stage-dot mx-auto mb-1" data-key="${key}"></div>
       <div class="font-mono text-[8px] text-[var(--ink-dim)]">${label}</div>
     </div>`
  ).join("");

  const poll = setInterval(async () => {
    try {
      const r = await fetch(`${API}/api/jobs/${job.id}`);
      const data = await r.json();
      updateCard(card, data);
      if (data.status === "done" || data.status === "failed") clearInterval(poll);
    } catch (e) {
      clearInterval(poll);
    }
  }, 2000);
}

function updateCard(card, data) {
  card.querySelector('[data-role="pct"]').textContent = data.progress + "%";
  card.querySelector('[data-role="status"]').textContent = data.error_message
    ? `FAILED: ${data.error_message}` : data.status.toUpperCase();

  const idx = stageIndex(data.status);
  card.querySelectorAll(".stage-dot").forEach((dot, i) => {
    dot.classList.remove("active", "done", "failed");
    if (data.status === "failed" && i === idx) dot.classList.add("failed");
    else if (i < idx || data.status === "done") dot.classList.add("done");
    else if (i === idx) dot.classList.add("active");
  });

  const actions = card.querySelector('[data-role="actions"]');
  if (data.status === "done") {
    actions.innerHTML = `<a href="${API}/api/jobs/${data.id}/download" class="inline-block px-4 py-2 rounded bg-[var(--amber)] text-black font-display text-xs">↓ DOWNLOAD MP4</a>`;
  }
}
