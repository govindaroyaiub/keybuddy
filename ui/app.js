const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);
let settings = null;
let platform = "macos";

// KeyBuddy custom 75% board, same as the website: [code, label, width, kind]
//   kind: "a" alpha cap, "m" modifier cap, "x" accent cap (wears the picked
//   sound's colour). code null = gap. Codes mirror src-tauri/src/keymap.rs.
const ROWS = () => {
  const M = platform === "macos";
  return [
    [[1, "esc", 1, "x"], [null, "", 0.25], [59, "F1", 1, "m"], [60, "F2", 1, "m"], [61, "F3", 1, "m"], [62, "F4", 1, "m"],
     [null, "", 0.25], [63, "F5"], [64, "F6"], [65, "F7"], [66, "F8"], [null, "", 0.25],
     [67, "F9", 1, "m"], [68, "F10", 1, "m"], [87, "F11", 1, "m"], [88, "F12", 1, "m"], [null, "", 0.25],
     [111, "del", 1, "m"], [110, "ins", 1, "m"]],
    [[41, "`"], [2, "1"], [3, "2"], [4, "3"], [5, "4"], [6, "5"], [7, "6"], [8, "7"], [9, "8"], [10, "9"], [11, "0"],
     [12, "-"], [13, "="], [14, M ? "delete" : "backspace", 2, "m"], [102, "home", 1, "m"]],
    [[15, "tab", 1.5, "m"], [16, "Q"], [17, "W"], [18, "E"], [19, "R"], [20, "T"], [21, "Y"], [22, "U"], [23, "I"],
     [24, "O"], [25, "P"], [26, "["], [27, "]"], [43, "\\", 1.5], [104, "pg up", 1, "m"]],
    [[58, "caps", 1.75, "m"], [30, "A"], [31, "S"], [32, "D"], [33, "F"], [34, "G"], [35, "H"], [36, "J"], [37, "K"],
     [38, "L"], [39, ";"], [40, "'"], [28, M ? "return" : "enter", 2.25, "x"], [109, "pg dn", 1, "m"]],
    [[42, "shift", 2.25, "m"], [44, "Z"], [45, "X"], [46, "C"], [47, "V"], [48, "B"], [49, "N"], [50, "M"], [51, ","],
     [52, "."], [53, "/"], [54, "shift", 1.75, "m"], [103, "↑", 1, "m"], [107, "end", 1, "m"]],
    M
      ? [[29, "ctrl", 1.25, "m"], [56, "opt", 1.25, "m"], [125, "cmd", 1.25, "m"], [57, "", 6.25], [126, "cmd", 1, "m"],
         [100, "opt", 1, "m"], [464, "fn", 1, "m"], [105, "←", 1, "m"], [108, "↓", 1, "m"], [106, "→", 1, "m"]]
      : [[29, "ctrl", 1.25, "m"], [125, "win", 1.25, "m"], [56, "alt", 1.25, "m"], [57, "", 6.25], [100, "alt", 1, "m"],
         [127, "menu", 1, "m"], [97, "ctrl", 1, "m"], [105, "←", 1, "m"], [108, "↓", 1, "m"], [106, "→", 1, "m"]],
  ];
};

// Browser key codes -> evdev, so typing inside this window lights the keys
// even before the system-wide hook is allowed.
const CODES = {
  Escape: 1, Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6, Digit6: 7, Digit7: 8, Digit8: 9,
  Digit9: 10, Digit0: 11, Minus: 12, Equal: 13, Backspace: 14, Tab: 15, KeyQ: 16, KeyW: 17, KeyE: 18,
  KeyR: 19, KeyT: 20, KeyY: 21, KeyU: 22, KeyI: 23, KeyO: 24, KeyP: 25, BracketLeft: 26, BracketRight: 27,
  Enter: 28, ControlLeft: 29, KeyA: 30, KeyS: 31, KeyD: 32, KeyF: 33, KeyG: 34, KeyH: 35, KeyJ: 36,
  KeyK: 37, KeyL: 38, Semicolon: 39, Quote: 40, Backquote: 41, ShiftLeft: 42, Backslash: 43, KeyZ: 44,
  KeyX: 45, KeyC: 46, KeyV: 47, KeyB: 48, KeyN: 49, KeyM: 50, Comma: 51, Period: 52, Slash: 53,
  ShiftRight: 54, AltLeft: 56, Space: 57, CapsLock: 58, F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64,
  F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88, ControlRight: 97, AltRight: 100, Home: 102,
  ArrowUp: 103, PageUp: 104, ArrowLeft: 105, ArrowRight: 106, End: 107, ArrowDown: 108, PageDown: 109,
  Insert: 110, Delete: 111, MetaLeft: 125, MetaRight: 126, ContextMenu: 127, Fn: 464,
};

// Each sound's cap colours (same as the website); recorded packs use the accent.
const GLOWS = {
  creamy: ["#f4e7d0", "#c9b08a", "#6b5233"],
  poppy: ["#cbbcff", "#8a6fd8", "#35256b"],
  clacky: ["#c3ead3", "#7db796", "#285a3e"],
  thocky: ["#6e4c3b", "#3e281e", "#f6e4d4"],
  clicky: ["#a3cbff", "#5c8dcf", "#1d3e6b"],
  lego: ["#ffd462", "#cf9f28", "#6b4c0a"],
};

function renderGlow() {
  const [glow, edge, ink] = GLOWS[settings.pack] || ["#ff8a57", "#c4582c", "#fff"];
  const pg = $("pg");
  pg.style.setProperty("--glow", glow);
  pg.style.setProperty("--glow-edge", edge);
  pg.style.setProperty("--glow-ink", ink);
  const pack = currentPacks.find((p) => p.id === settings.pack);
  $("wtitle").textContent = `${pack ? pack.name : "Typing"}.txt`;
}

// ---------- fit the stage to the window ----------

// The Playground never scrolls: the stage is laid out at a fixed design width
// and zoomed to whatever room the window leaves. Then the hologram is sized
// to the keyboard's back edge as it looks on screen (the board is tilted, so
// that edge appears narrower) and lowered until it sits right on it.
const PG_W = 840;

// Sounds tab: same idea, zoomed to fit its box.
function fitSounds() {
  const box = $("snd-fit");
  const snd = $("snd");
  if (!box.clientWidth || !box.clientHeight) return;
  snd.style.zoom = 1;
  snd.style.zoom = Math.min(1, box.clientWidth / PG_W, box.clientHeight / snd.offsetHeight);
}

function fitStage() {
  const box = $("pg-fit");
  const pg = $("pg");
  const stage = $("holo-stage");
  if (!box.clientWidth || !box.clientHeight) return; // tab hidden
  pg.style.zoom = 1;
  stage.style.marginBottom = "0px";
  const deck = $("deck").getBoundingClientRect();
  const edge = $("deck-edge").getBoundingClientRect();
  if (deck.width > 0) pg.style.setProperty("--back-w", `${(edge.width / deck.width) * 100}%`);
  const gap = edge.top - $("holo").getBoundingClientRect().bottom;
  stage.style.marginBottom = `${Math.round(-gap)}px`;
  const z = Math.min(1, box.clientWidth / PG_W, box.clientHeight / pg.offsetHeight);
  pg.style.zoom = z;
}

const keyEls = new Map();
const KEY_X = new Map(); // 0 = left edge, 1 = right edge: where RGB ripples start

function makeKey(code, label, kind) {
  const k = document.createElement("button");
  k.className = `key k-${kind}`;
  if (["↑", "↓", "←", "→"].includes(label)) k.classList.add("k-arrow");
  k.innerHTML = `<span class="legend">${esc(label)}</span>`;
  k.tabIndex = -1;
  k.setAttribute("aria-label", label || "space");
  let downAt = 0;
  let releaseTimer = 0;
  k.addEventListener("pointerdown", (e) => {
    e.preventDefault(); // keep focus in the typing test
    clearTimeout(releaseTimer);
    downAt = performance.now();
    invoke("tap", { code });
    setKey(code, true);
  });
  const up = () => {
    if (!k.classList.contains("down")) return;
    // a click is over in ~50 ms; hold the pressed look so the cap visibly travels
    const wait = Math.max(0, 120 - (performance.now() - downAt));
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => setKey(code, false), wait);
  };
  k.addEventListener("pointerup", up);
  k.addEventListener("pointerleave", up);
  if (!keyEls.has(code)) keyEls.set(code, []);
  keyEls.get(code).push(k);
  return k;
}

function buildKeyboard() {
  const kb = $("keyboard");
  kb.innerHTML = "";
  keyEls.clear();
  KEY_X.clear();
  ROWS().forEach((row, i) => {
    const r = document.createElement("div");
    r.className = i === 0 ? "krow fn" : "krow";
    const total = row.reduce((s, k) => s + (k[2] || 1), 0);
    let x = 0;
    for (const [code, label, w = 1, kind = "a"] of row) {
      if (code === null) {
        const gap = document.createElement("span");
        gap.className = "kgap";
        gap.style.setProperty("--w", w);
        r.appendChild(gap);
      } else {
        KEY_X.set(code, (x + w / 2) / total);
        const k = makeKey(code, label, kind);
        k.style.setProperty("--w", w);
        r.appendChild(k);
      }
      x += w;
    }
    kb.appendChild(r);
  });
}

function setKey(code, down) {
  const els = keyEls.get(code) || [];
  const was = els.length && els[0].classList.contains("down");
  for (const el of els) el.classList.toggle("down", down);
  if (down && !was) {
    rgbPulse(KEY_X.get(code) ?? 0.5);
    bounce();
  }
}

// ---------- RGB light bar ----------

// A rainbow wave runs along the case's front lip. Each keypress sends a ripple
// out from that key's position; typing faster speeds the wave up. The bar is
// copied into a blurred canvas: the underglow on the "desk".
const rgb = { hue: 0, energy: 0, ripples: [], last: 0, running: false };

function rgbPulse(x) {
  rgb.ripples.push({ x, t: 0 });
  if (rgb.ripples.length > 24) rgb.ripples.shift();
  rgb.energy = Math.min(rgb.energy + 1, 12);
  rgbStart();
}

function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const RGB_W = 240;
let rgbDraw = null; // set once the canvases are ready

function setupRGB() {
  const bar = $("rgb-bar");
  const glow = $("rgb-glow");
  for (const c of [bar, glow]) { c.width = RGB_W; c.height = 1; }
  const ctx = bar.getContext("2d");
  const gctx = glow.getContext("2d");
  const img = ctx.createImageData(RGB_W, 1);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  rgbDraw = (now) => {
    const dt = rgb.last ? Math.min((now - rgb.last) / 1000, 0.05) : 0;
    rgb.last = now;
    rgb.energy *= Math.exp(-dt * 1.2);
    rgb.hue = (rgb.hue + dt * (25 + rgb.energy * 22)) % 360;
    for (const r of rgb.ripples) r.t += dt;
    rgb.ripples = rgb.ripples.filter((r) => r.t < 0.9);
    for (let i = 0; i < RGB_W; i++) {
      const x = i / (RGB_W - 1);
      let boost = 0;
      for (const r of rgb.ripples) {
        const front = r.t * 0.9;
        const fade = 1 - r.t / 0.9;
        const d = Math.min(Math.abs(x - (r.x - front)), Math.abs(x - (r.x + front)));
        boost += Math.exp(-(d * d) / 0.0016) * fade + Math.exp(-((x - r.x) ** 2) / 0.0009) * fade * 0.6;
      }
      boost = Math.min(boost, 1.2);
      const [rr, gg, bb] = hsl((rgb.hue + x * 300) % 360, 1, Math.min(0.5 + boost * 0.3, 0.9));
      const a = Math.min(1, 0.62 + rgb.energy * 0.03 + boost * 0.4);
      img.data.set([rr, gg, bb, a * 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    gctx.clearRect(0, 0, RGB_W, 1);
    gctx.drawImage(bar, 0, 0);
    // only animate while the Playground is showing and the window is visible
    if (!reduce && rgbVisible()) requestAnimationFrame(rgbDraw);
    else rgb.running = false;
  };
  rgbStart();
}

const rgbVisible = () => !document.hidden && $("tab-practice").getAttribute("aria-selected") === "true";

function rgbStart() {
  if (!rgbDraw || rgb.running || !rgbVisible()) return;
  rgb.running = true;
  rgb.last = 0;
  requestAnimationFrame(rgbDraw);
}

let bounceTimer;
function bounce() {
  const b = $("buddy");
  b.classList.add("press");
  clearTimeout(bounceTimer);
  bounceTimer = setTimeout(() => b.classList.remove("press"), 90);
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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

// Builds behind each recording (same as the website).
const BUILDS = {
  creamy: ["Evo80", "PP plate", "Neo x Keygeek Oat"],
  poppy: ["Rainy75 Pro", "HMX Pink Pig"],
  clacky: ["Rainy75", "Akko Cilantro"],
  thocky: ["Crush80", "Ceramic keycaps", "Kailh Cocoa"],
  clicky: ["QK65", "Outemu Ocean"],
  lego: ["Luminkey80", "BSUN Dusty Rose"],
};
const ACCENT_CAP = ["#ff8a57", "#c4582c", "#fff"]; // recorded packs
const capColors = (id) => GLOWS[id] || ACCENT_CAP;
const capStyle = (id) => {
  const [cap, edge, ink] = capColors(id);
  return `--cap:${cap};--edge:${edge};--cap-ink:${ink}`;
};

function buildPacks(packs) {
  currentPacks = packs;
  buildChips(packs);
  const wrap = $("packs");
  wrap.style.setProperty("--n", Math.max(packs.length, 6));
  $("hint-last").textContent = Math.min(packs.length, 9);
  wrap.innerHTML = packs.map((p, i) => `
    <button class="tcap" role="radio" aria-checked="false" data-id="${esc(p.id)}" style="${capStyle(p.id)}"
      aria-label="${esc(p.name)}${i < 9 ? `, key ${i + 1}` : ""}">
      <span class="well"><span class="led"></span><span class="top"><span class="face"><b>${esc([...p.name][0] || "?")}</b></span></span></span>
      <span class="tname">${esc(p.name)}</span>
    </button>`).join("");
  for (const cap of wrap.querySelectorAll(".tcap")) {
    const id = cap.dataset.id;
    cap.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pressCap(id);
    });
    cap.addEventListener("keydown", (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        pressCap(id);
      }
    });
  }
}

// Press a cap: it sinks, picks that sound and plays one key with it.
async function pressCap(id) {
  const cap = document.querySelector(`.tcap[data-id="${CSS.escape(id)}"]`);
  if (cap) {
    cap.classList.add("down");
    setTimeout(() => cap.classList.remove("down"), 130);
  }
  if (settings.pack !== id) {
    settings = { ...settings, pack: id };
    render();
    await invoke("set_settings", { settings }); // load the bank before playing
  }
  invoke("tap", { code: 35 }); // the H key: a normal key near the middle
}

function renderInfo() {
  const p = currentPacks.find((x) => x.id === settings.pack);
  const box = $("pack-info");
  if (!p) {
    box.innerHTML = "";
    return;
  }
  const build = BUILDS[p.id] || (p.custom ? ["Recorded by you"] : [p.kind]);
  box.style.cssText = capStyle(p.id);
  box.innerHTML = `
    <span class="mini-cap" aria-hidden="true">${esc([...p.name][0] || "?")}</span>
    <div class="info-text">
      <h3>${esc(p.name)} <span class="kind">${esc(p.kind)}</span></h3>
      <p>${esc(p.blurb)}</p>
      <div class="build">${build.map((b) => `<span>${esc(b)}</span>`).join("")}</div>
    </div>
    <div class="info-actions">
      <button class="btn primary" id="info-play">▶ Hear a sentence</button>
      ${p.custom
        ? `<button class="btn" id="info-del">Delete</button>`
        : `<button class="btn" id="info-type">Type with it</button>`}
    </div>`;
  $("info-play").addEventListener("click", () => invoke("preview", { pack: p.id }));
  if (p.custom) {
    $("info-del").addEventListener("click", () => {
      if (confirm(`Delete "${p.name}"? This can't be undone.`)) invoke("delete_pack", { id: p.id });
    });
  } else {
    $("info-type").addEventListener("click", () => $("tab-practice").click());
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
  for (const el of document.querySelectorAll(".tcap, .chip")) {
    el.setAttribute("aria-checked", String(el.dataset.id === settings.pack));
  }
  renderFeel();
  renderGlow();
  renderInfo();
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
  // the knob isn't a control: it turns to match the bars, -135° (Pillow) to
  // +135° (Hard), and its LED ring fills up
  const turn = (lvl / (LEVELS.length - 1)) * 270;
  $("knob").style.setProperty("--angle", `${turn - 135}deg`);
  $("knob").style.setProperty("--sweep", `${turn}deg`);
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
  });
  // Keys typed in this window light up too (the hook covers every other app).
  addEventListener("keydown", (e) => CODES[e.code] && setKey(CODES[e.code], true));
  addEventListener("keyup", (e) => CODES[e.code] && setKey(CODES[e.code], false));
  addEventListener("blur", () => keyEls.forEach((els, code) => setKey(code, false)));

  setupRecorder();
  setupTabs();
  setupPractice();
  buildLevels();
  renderFeel();
  setupRGB();
  document.addEventListener("visibilitychange", rgbStart);
  new ResizeObserver(fitStage).observe($("pg-fit"));
  new ResizeObserver(fitSounds).observe($("snd-fit"));
  // Sounds tab: number keys press the caps, like the website
  document.addEventListener("keydown", (e) => {
    const n = /^Digit([1-9])$/.exec(e.code);
    if (!n || e.repeat || e.metaKey || e.ctrlKey || e.altKey || !$("rec").hidden) return;
    if ($("tab-sounds").getAttribute("aria-selected") !== "true") return;
    const p = currentPacks[Number(n[1]) - 1];
    if (p) pressCap(p.id);
  });

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
    if (name === "sounds") fitSounds();
    if (name === "practice") {
      fitStage();
      $("passage").focus();
      rgbStart();
    }
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
  for (const id of ["p-new", "p-reset"]) {
    $(id).addEventListener("mousedown", (e) => e.preventDefault()); // keep typing focus
  }
  $("p-new").addEventListener("click", () => {
    newPassage();
    el.focus();
  });
  $("p-reset").addEventListener("click", () => {
    resetPassage();
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
  Object.assign(pr, { pack, idx: i, text: list[i] });
  resetPassage();
}

// Start the same text again.
function resetPassage() {
  Object.assign(pr, { typed: "", strokes: 0, errors: 0, start: 0, end: 0 });
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
