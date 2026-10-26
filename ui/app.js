const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);
let settings = null;
let platform = "macos";

// [evdev code, label, width] — mirrors src-tauri/src/keymap.rs
const ROWS = () => {
  const mac = platform === "macos";
  return [
    [[1, "esc", 1.5], [59, "F1"], [60, "F2"], [61, "F3"], [62, "F4"], [63, "F5"], [64, "F6"],
     [65, "F7"], [66, "F8"], [67, "F9"], [68, "F10"], [87, "F11"], [88, "F12"], [111, "del", 1.5]],
    [[41, "`"], [2, "1"], [3, "2"], [4, "3"], [5, "4"], [6, "5"], [7, "6"], [8, "7"], [9, "8"],
     [10, "9"], [11, "0"], [12, "-"], [13, "="], [14, mac ? "delete" : "backspace", 2]],
    [[15, "tab", 1.5], [16, "Q"], [17, "W"], [18, "E"], [19, "R"], [20, "T"], [21, "Y"], [22, "U"],
     [23, "I"], [24, "O"], [25, "P"], [26, "["], [27, "]"], [43, "\\", 1.5]],
    [[58, "caps", 1.75], [30, "A"], [31, "S"], [32, "D"], [33, "F"], [34, "G"], [35, "H"], [36, "J"],
     [37, "K"], [38, "L"], [39, ";"], [40, "'"], [28, mac ? "return" : "enter", 2.25]],
    [[42, "shift", 2.25], [44, "Z"], [45, "X"], [46, "C"], [47, "V"], [48, "B"], [49, "N"], [50, "M"],
     [51, ","], [52, "."], [53, "/"], [54, "shift", 2.75]],
    mac
      ? [[464, "fn"], [29, "ctrl"], [56, "opt"], [125, "cmd", 1.25], [57, "", 6.25], [126, "cmd", 1.25],
         [100, "opt"], [105, "←"], [108, "↓"], [106, "→"]]
      : [[29, "ctrl", 1.25], [125, "win", 1.25], [56, "alt", 1.25], [57, "", 6.25], [100, "alt", 1.25],
         [126, "win", 1.25], [127, "menu", 1.25], [97, "ctrl", 1.25]],
  ];
};

const keyEls = new Map();

function buildKeyboard() {
  const kb = $("keyboard");
  kb.innerHTML = "";
  keyEls.clear();
  for (const row of ROWS()) {
    const r = document.createElement("div");
    r.className = "krow";
    for (const [code, label, w = 1] of row) {
      const k = document.createElement("button");
      k.className = "key";
      k.style.setProperty("--w", w);
      k.textContent = label;
      k.tabIndex = -1;
      k.addEventListener("mousedown", () => {
        invoke("tap", { code });
        flash(code);
      });
      r.appendChild(k);
      if (!keyEls.has(code)) keyEls.set(code, []);
      keyEls.get(code).push(k);
    }
    kb.appendChild(r);
  }
}

function setKey(code, down) {
  for (const el of keyEls.get(code) || []) el.classList.toggle("down", down);
}

function flash(code) {
  setKey(code, true);
  bounce();
  setTimeout(() => setKey(code, false), 110);
}

let bounceTimer;
function bounce() {
  const b = $("buddy");
  b.classList.add("press");
  clearTimeout(bounceTimer);
  bounceTimer = setTimeout(() => b.classList.remove("press"), 90);
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const PLAY_ICON = '<svg viewBox="0 0 12 12"><path d="M2 1l9 5-9 5z" fill="currentColor"/></svg>';

function buildChips(packs) {
  const wrap = $("pack-chips");
  wrap.innerHTML = "";
  for (const p of packs) {
    const c = document.createElement("button");
    c.className = "chip";
    c.setAttribute("role", "radio");
    c.dataset.id = p.id;
    c.textContent = p.name;
    c.title = `${p.kind} · ${p.blurb}`;
    // keep focus in the typing test so you can switch mid-sentence
    c.addEventListener("mousedown", (e) => e.preventDefault());
    c.addEventListener("click", () => save({ pack: p.id }));
    wrap.appendChild(c);
  }
}

let currentPacks = [];

function buildPacks(packs) {
  currentPacks = packs;
  buildChips(packs);
  const wrap = $("packs");
  wrap.innerHTML = "";
  for (const p of packs) {
    const el = document.createElement("div");
    el.className = "pack";
    el.setAttribute("role", "radio");
    el.tabIndex = 0;
    el.dataset.id = p.id;
    el.innerHTML = `
      <div class="glyph">${esc([...p.name][0] || "?")}</div>
      <div class="meta">
        <div class="name">${esc(p.name)} <span class="kind">${esc(p.kind)}</span></div>
        <div class="blurb">${esc(p.blurb)}</div>
      </div>
      <button class="play" title="Preview" aria-label="Preview ${esc(p.name)}">${PLAY_ICON}</button>
      ${p.custom ? `<button class="del" title="Delete" aria-label="Delete ${esc(p.name)}">×</button>` : ""}`;
    el.addEventListener("click", (e) => {
      if (e.target.closest(".del")) {
        if (confirm(`Delete "${p.name}"? This can't be undone.`)) invoke("delete_pack", { id: p.id });
        return;
      }
      if (e.target.closest(".play")) {
        invoke("preview", { pack: p.id });
        return;
      }
      if (settings.pack !== p.id) {
        save({ pack: p.id });
        invoke("preview", { pack: p.id });
      }
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.click();
      }
    });
    wrap.appendChild(el);
  }
}

function render() {
  $("enabled").checked = settings.enabled;
  $("enabled-label").textContent = settings.enabled ? "On" : "Off";
  $("buddy").classList.toggle("off", !settings.enabled);
  $("key_up").checked = settings.key_up;
  $("stereo").checked = settings.stereo;
  const vol = Math.round(settings.volume * 100);
  $("volume").value = vol;
  $("volume-out").textContent = `${vol}%`;
  for (const el of document.querySelectorAll(".pack, .chip")) {
    el.setAttribute("aria-checked", String(el.dataset.id === settings.pack));
  }
  renderFeel();
  if (pr.pack !== null && pr.pack !== settings.pack) newPassage();
}

// ---------- soft <-> hard ----------

const LEVELS = ["Pillow", "Soft", "Medium", "Firm", "Hard"];
const feelOf = (pack) => {
  const h = settings.feel && settings.feel[pack];
  return typeof h === "number" ? h : 0.5;
};

function buildLevels() {
  $("levels").innerHTML = LEVELS.map((name, i) =>
    `<button class="level" role="radio" aria-checked="false" style="--i:${i}" title="${name}">
      <span class="block"></span><span class="lbl">${name}</span>
    </button>`).join("");
  document.querySelectorAll(".level").forEach((el, i) => {
    el.addEventListener("mousedown", (e) => e.preventDefault()); // keep typing focus
    el.addEventListener("click", () => {
      save({ feel: { ...(settings.feel || {}), [settings.pack]: i / (LEVELS.length - 1) } });
      invoke("tap", { code: 37 }); // hear it right away
    });
  });
}

function renderFeel() {
  if (!$("levels").children.length) return;
  const lvl = Math.round(feelOf(settings.pack) * (LEVELS.length - 1));
  const pack = currentPacks.find((p) => p.id === settings.pack);
  $("feel-name").textContent = pack ? pack.name : "This sound";
  $("feel-value").textContent = LEVELS[lvl];
  document.querySelectorAll(".level").forEach((el, i) => {
    el.classList.toggle("on", i <= lvl);
    el.setAttribute("aria-checked", String(i === lvl));
  });
}

function save(patch) {
  settings = { ...settings, ...patch };
  render();
  invoke("set_settings", { settings });
}

function showPermission(state) {
  const banner = $("perm");
  banner.hidden = state === "granted";
  if (platform === "linux") {
    $("perm-text").textContent =
      "Your user needs read access to keyboards: run `sudo usermod -aG input $USER`, then log out and back in.";
    $("perm-btn").hidden = true;
    $("perm-restart").hidden = true;
  }
}

function mood(s) {
  if (!settings.enabled) return "Shh. Sounds are off.";
  if (s.wpm >= 90) return "Whoa. Keyboard's on fire.";
  if (s.wpm >= 60) return "Flying along!";
  if (s.wpm > 0) return "Clack clack clack.";
  return "Ready when you are.";
}

async function pollStats() {
  const s = await invoke("get_stats");
  // While you're in the typing test, show its live speed: it's what you're watching.
  const testing = pr.start && !pr.end;
  $("wpm").textContent = testing ? practiceNumbers().wpm : s.wpm;
  $("best-today").textContent = s.best_today;
  $("best-ever").textContent = s.best_ever;
  $("today").textContent = s.today.toLocaleString();
  $("mood").textContent = mood(s);
}

async function init() {
  const state = await invoke("get_state");
  settings = state.settings;
  platform = state.platform;
  buildPacks(state.packs);
  buildKeyboard();
  render();
  $("autostart").checked = state.autostart;
  showPermission(state.permission);

  $("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
  $("key_up").addEventListener("change", (e) => save({ key_up: e.target.checked }));
  $("stereo").addEventListener("change", (e) => save({ stereo: e.target.checked }));
  $("volume").addEventListener("input", (e) => save({ volume: e.target.value / 100 }));
  $("volume").addEventListener("change", () => invoke("tap", { code: 37 }));
  $("autostart").addEventListener("change", async (e) => {
    try {
      e.target.checked = await invoke("set_autostart", { enabled: e.target.checked });
    } catch {
      e.target.checked = !e.target.checked;
    }
  });
  $("perm-btn").addEventListener("click", () => invoke("open_permission_settings"));
  $("perm-restart").addEventListener("click", () => invoke("restart"));

  await listen("packs", (e) => {
    buildPacks(e.payload);
    render();
  });
  await listen("settings", (e) => {
    settings = e.payload;
    render();
  });
  await listen("key", (e) => {
    const [code, down] = e.payload;
    setKey(code, down);
    if (down) bounce();
  });

  setupRecorder();
  setupTabs();
  setupPractice();
  buildLevels();
  renderFeel();

  // Poll only while the window is actually visible (not minimized/covered).
  setInterval(() => !document.hidden && pollStats(), 500);
  pollStats();

  setInterval(async () => {
    if (!document.hidden && !$("perm").hidden) showPermission(await invoke("permission"));
  }, 2000);
}

// ---------- tabs ----------

function setupTabs() {
  const tabs = [...document.querySelectorAll(".tabs [role=tab]")];
  const show = (name) => {
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.tab === name));
    for (const p of document.querySelectorAll(".tab-panel")) p.hidden = p.dataset.panel !== name;
    try { localStorage.setItem("tab", name); } catch {}
    if (name === "practice") $("passage").focus();
  };
  for (const t of tabs) t.addEventListener("click", () => show(t.dataset.tab));
  let saved = "sounds";
  try { saved = localStorage.getItem("tab") || "sounds"; } catch {}
  show(saved);
}

// ---------- practice ----------

// Typing-test texts, matched to the sound you're hearing.
const PASSAGES = {
  creamy: [
    "Creamy is what happens when smooth switches meet a soft plate: no rattle, no ping, just a warm, buttery press.",
    "A polypropylene plate flexes a little under each key, so the sound comes out rounder and softer than metal.",
    "Lubed linears glide all the way down, and the only thing left to hear is a smooth, muted landing.",
  ],
  poppy: [
    "Poppy boards make a tiny round pop on every key, like stepping on bubble wrap that never runs out.",
    "Long-pole switches bottom out on the stem instead of the housing, which gives each press a sharp, high pop.",
    "Type a little faster and the pops start to blur into a soft, bouncy rhythm that is hard to stop.",
  ],
  lego: [
    "Lego switches snap like bricks clicking together: bright, plasticky and oddly satisfying.",
    "A little bump, a hard plastic landing, and a quick snap back up. Every key sounds like building something.",
    "Some people call it the lego sound, and once you hear it you will not be able to unhear it.",
  ],
  thocky: [
    "Thock is the deep, round sound of a lubed linear landing on a foam-filled board. Low, soft, and very satisfying.",
    "Linear switches have no bump and no click. The key travels straight down, so its only voice is the bottom-out.",
    "Heavy springs, thick caps, and a dampened case push the sound lower until every press lands like a soft drum.",
  ],
  clacky: [
    "Clack is bright and sharp: hard plastic caps striking a stiff plate, with nothing there to soften the blow.",
    "A hollow case makes every key ring a little, so fast typing turns into a crisp, rattling clatter.",
    "Thin ABS keycaps sound higher than thick ones, which is why older boards have that classic clacky voice.",
  ],
  clicky: [
    "Clicky switches hide a little jacket that snaps as you press, so every key announces itself out loud.",
    "Blue switches click on the way down and again on the way up. Everyone nearby hears every word you type.",
    "The click arrives just as the key registers, telling your finger it can let go and move on to the next one.",
  ],
  tactile: [
    "A tactile switch has a small bump halfway down, so you feel the key register without a loud click.",
    "Browns are the quiet middle ground: a gentle bump, a muted landing, and nothing that wakes the room.",
    "Good tactiles let you type lightly, stopping at the bump instead of slamming every key to the bottom.",
  ],
  custom: [
    "This is the sound of your own keyboard, recorded on your desk and cut into takes one key at a time.",
    "Every switch on your board sounds a little different, and now each one plays back exactly as you type.",
    "Same keys, same switches, same desk. KeyBuddy just makes sure you hear them in every app you use.",
  ],
};

const passagesFor = (pack) => PASSAGES[pack] || PASSAGES.custom;

const pr = { pack: null, text: "", typed: "", strokes: 0, errors: 0, start: 0, end: 0, idx: -1, timer: null };

function setupPractice() {
  const el = $("passage");
  el.addEventListener("keydown", onPracticeKey);
  $("p-new").addEventListener("click", () => {
    newPassage();
    el.focus();
  });
  // In the Playground, just start typing: the first key jumps into the test.
  document.addEventListener("keydown", (e) => {
    if (document.activeElement === el || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!(e.key.length === 1 || e.key === "Backspace")) return;
    if ($("tab-practice").getAttribute("aria-selected") !== "true" || !$("rec").hidden) return;
    const t = e.target;
    if (t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
    el.focus();
    onPracticeKey(e);
  });
  newPassage();
}

function newPassage() {
  const pack = settings ? settings.pack : "thocky";
  const list = passagesFor(pack);
  let i;
  do i = Math.floor(Math.random() * list.length); while (pack === pr.pack && i === pr.idx && list.length > 1);
  Object.assign(pr, { pack, idx: i, text: list[i], typed: "", strokes: 0, errors: 0, start: 0, end: 0 });
  clearInterval(pr.timer);
  $("passage").classList.remove("done");
  $("p-hint").className = "hint";
  $("p-hint").textContent = "Click the text and start typing. Mistakes show in red; backspace to fix them.";
  renderPassage();
  updatePracticeStats();
}

function onPracticeKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey || pr.end) return;
  if (e.key === "Backspace") {
    e.preventDefault();
    pr.typed = pr.typed.slice(0, -1);
  } else if (e.key.length === 1) {
    e.preventDefault();
    if (!pr.start) {
      pr.start = performance.now();
      pr.timer = setInterval(updatePracticeStats, 100);
    }
    const expected = pr.text[pr.typed.length];
    pr.strokes += 1;
    if (e.key !== expected) pr.errors += 1;
    pr.typed += e.key;
    if (pr.typed.length >= pr.text.length) finishPassage();
  } else {
    return;
  }
  renderPassage();
  updatePracticeStats();
}

function renderPassage() {
  const html = [];
  for (let i = 0; i < pr.text.length; i++) {
    const c = pr.text[i];
    let cls = "";
    if (i < pr.typed.length) cls = pr.typed[i] === c ? "ok" : "bad";
    else if (i === pr.typed.length) cls = "cur";
    html.push(`<span class="${cls}">${c === " " ? "&nbsp;" : esc(c)}</span>`);
  }
  // let long lines wrap at spaces
  $("passage").innerHTML = html.join("").replaceAll("&nbsp;</span>", "&nbsp;</span><wbr>");
}

function practiceNumbers() {
  const now = pr.end || performance.now();
  const secs = pr.start ? (now - pr.start) / 1000 : 0;
  let correct = 0;
  for (let i = 0; i < pr.typed.length; i++) if (pr.typed[i] === pr.text[i]) correct++;
  const wpm = secs > 1 ? Math.round(correct / 5 / (secs / 60)) : 0;
  const acc = pr.strokes ? Math.round(((pr.strokes - pr.errors) / pr.strokes) * 100) : 100;
  return { secs, wpm, acc };
}

function updatePracticeStats() {
  const { secs, wpm, acc } = practiceNumbers();
  $("p-wpm").textContent = wpm;
  // no accuracy until something has been typed
  $("p-acc").textContent = pr.strokes ? `${acc}%` : "–";
  $("p-time").textContent = secs.toFixed(1);
}

function finishPassage() {
  pr.end = performance.now();
  clearInterval(pr.timer);
  const { wpm, acc } = practiceNumbers();
  let best = 0;
  try { best = Number(localStorage.getItem("practiceBest") || 0); } catch {}
  const record = wpm > best;
  if (record) try { localStorage.setItem("practiceBest", String(wpm)); } catch {}
  $("passage").classList.add("done");
  $("p-hint").className = "hint result";
  $("p-hint").textContent = record
    ? `New personal best: ${wpm} wpm at ${acc}% accuracy!`
    : `${wpm} wpm at ${acc}% accuracy. Your best is ${best} wpm.`;
}

// ---------- record your keyboard ----------

const STEPS = [
  { id: "intro" },
  { id: "type", key: "normal", target: 60 },
  { id: "space", key: "space", target: 8 },
  { id: "enter", key: "enter", target: 8 },
  { id: "back", key: "back", target: 8 },
  { id: "working" },
  { id: "done" },
];

const rec = { step: 0, timer: null, pack: null, quietSince: 0 };

function setupRecorder() {
  $("rec-steps").innerHTML = STEPS.slice(0, 5).map(() => "<i></i>").join("");
  $("record-open").addEventListener("click", openRecorder);
  $("rec-cancel").addEventListener("click", closeRecorder);
  $("rec-next").addEventListener("click", nextStep);
  $("rec-skip").addEventListener("click", () => goTo(rec.step + 1));
  $("rec-play").addEventListener("click", () => rec.pack && invoke("preview", { pack: rec.pack.id }));
  $("rec-mic-settings").addEventListener("click", () => invoke("open_mic_settings"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("rec").hidden) closeRecorder();
  });
}

function openRecorder() {
  rec.pack = null;
  $("rec-name").value = "";
  $("rec").hidden = false;
  goTo(0);
  $("rec-name").focus();
}

function closeRecorder() {
  clearInterval(rec.timer);
  if (rec.step > 0 && rec.step < 5) invoke("record_cancel");
  $("rec").hidden = true;
}

function goTo(i) {
  rec.step = i;
  const step = STEPS[i] || { id: "error" };
  for (const el of document.querySelectorAll(".rec-step")) {
    el.classList.toggle("active", el.dataset.step === step.id);
  }
  [...$("rec-steps").children].forEach((d, n) => d.classList.toggle("on", n <= i));
  const recording = i >= 1 && i <= 4;
  $("rec-meter-row").hidden = !recording;
  if (!recording) $("rec-silent").hidden = true;
  $("rec-skip").hidden = !(i >= 2 && i <= 4);
  $("rec-play").hidden = step.id !== "done";
  $("rec-cancel").textContent = step.id === "done" ? "Close" : "Cancel";
  $("rec-cancel").hidden = step.id === "working";
  const next = $("rec-next");
  next.hidden = step.id === "working";
  next.textContent =
    step.id === "intro" ? "Start recording" :
    step.id === "done" ? "Use this pack" :
    step.id === "error" ? "Try again" :
    i === 4 ? "Finish" : "Next";
  if (step.id === "type") setTimeout(() => $("rec-pad").focus(), 50);
  if (step.id === "working") finishRecording();
}

async function nextStep() {
  const id = (STEPS[rec.step] || { id: "error" }).id;
  if (id === "intro") {
    try {
      const device = await invoke("record_start");
      $("rec-device").textContent = device;
      $("rec-pad").value = "";
      rec.quietSince = Date.now();
      rec.timer = setInterval(pollRecorder, 100);
      goTo(1);
    } catch (err) {
      showError(err);
    }
  } else if (id === "done") {
    save({ pack: rec.pack.id });
    closeRecorder();
  } else if (id === "error") {
    goTo(0);
  } else {
    goTo(rec.step + 1);
  }
}

async function pollRecorder() {
  const s = await invoke("record_status");
  if (!s) return;
  $("rec-meter").style.width = `${Math.min(100, Math.sqrt(s.level) * 140)}%`;
  if (s.level > 0.004) rec.quietSince = Date.now();
  $("rec-silent").hidden = Date.now() - rec.quietSince < 3500;
  const step = STEPS[rec.step];
  if (!step || !step.key) return;
  const n = s[step.key];
  $("rec-count").textContent = `${Math.min(n, step.target)} / ${step.target}`;
  if (n >= step.target && !step.reached) {
    step.reached = true;
    setTimeout(() => {
      step.reached = false;
      if (STEPS[rec.step] === step) goTo(rec.step + 1);
    }, 500);
  }
}

async function finishRecording() {
  clearInterval(rec.timer);
  try {
    const name = $("rec-name").value.trim() || "My keyboard";
    rec.pack = await invoke("record_finish", { name });
    const s = rec.pack.summary;
    $("rec-done-title").textContent = `“${rec.pack.name}” is ready`;
    $("rec-summary").innerHTML = [
      ["keys", s.normal], ["modifiers", s.modifier], ["space", s.space],
      ["enter", s.enter], ["backspace", s.back], ["releases", s.release],
    ].map(([k, v]) => `<span><b>${v}</b> ${k}</span>`).join("");
    goTo(6);
    invoke("preview", { pack: rec.pack.id });
  } catch (err) {
    showError(err);
  }
}

function showError(err) {
  $("rec-error").textContent = String(err);
  goTo(99);
}

init();
