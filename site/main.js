// KeyBuddy website: plays the app's real sound packs in the browser.

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- downloads ----------

// Release assets use Tauri's default bundle names. Update VERSION on release.
const VERSION = "0.2.1";
const RELEASES = "https://github.com/govindaroyaiub/keybuddy/releases/latest/download/";

const ICONS = {
  mac: '<svg viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5V15H4zM6 6v7h12V6zM2 16.5h20l-1 2.2c-.2.5-.7.8-1.2.8H4.2c-.5 0-1-.3-1.2-.8z"/></svg>',
  windows: '<svg viewBox="0 0 24 24"><path d="M3 5.2 10.5 4v7.3H3zM11.5 3.9 21 2.5v8.8h-9.5zM3 12.7h7.5V20L3 18.8zM11.5 12.7H21v8.8l-9.5-1.4z"/></svg>',
  linux: '<svg viewBox="0 0 24 24"><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm2.6 3.6 3.6 3.4-3.6 3.4 1.2 1.2 4.9-4.6-4.9-4.6zM12 15.6v1.7h6v-1.7z"/></svg>',
};

const PLATFORMS = {
  mac: {
    name: "macOS",
    blurb: "macOS 11 or later. Lives in your menu bar.",
    files: [
      { label: "Apple Silicon", note: ".dmg", file: `KeyBuddy_${VERSION}_aarch64.dmg`, arch: "arm" },
      { label: "Intel", note: ".dmg", file: `KeyBuddy_${VERSION}_x64.dmg`, arch: "x64" },
    ],
  },
  windows: {
    name: "Windows",
    blurb: "Windows 10 or 11. Lives in your system tray.",
    files: [
      { label: "Installer", note: ".exe", file: `KeyBuddy_${VERSION}_x64-setup.exe` },
      { label: "MSI package", note: ".msi", file: `KeyBuddy_${VERSION}_x64_en-US.msi` },
    ],
  },
  linux: {
    name: "Linux",
    blurb: "X11 and Wayland. Needs to be in the input group.",
    files: [
      { label: "AppImage", note: ".AppImage", file: `KeyBuddy_${VERSION}_amd64.AppImage` },
      { label: "Debian / Ubuntu", note: ".deb", file: `KeyBuddy_${VERSION}_amd64.deb` },
    ],
  },
};

function detectOS() {
  const ua = navigator.userAgent;
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  if (/iPhone|iPad|iPod/.test(ua) || (/Mac/.test(platform) && navigator.maxTouchPoints > 1)) return "mobile";
  if (/Android/i.test(ua)) return "mobile";
  if (/Mac/i.test(platform) || /Mac OS X/.test(ua)) return "mac";
  if (/Win/i.test(platform) || /Windows/.test(ua)) return "windows";
  if (/Linux|X11|CrOS/i.test(platform + ua)) return "linux";
  return "unknown";
}

// Browsers hide the CPU, but the GPU name gives Apple Silicon away.
function isAppleSilicon() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "";
    return /Apple/i.test(r) && !/Intel/i.test(r);
  } catch {
    return true;
  }
}

function setupDownloads() {
  const os = detectOS();
  const arm = os === "mac" ? isAppleSilicon() : false;
  const order = os in PLATFORMS ? [os, ...Object.keys(PLATFORMS).filter((k) => k !== os)] : Object.keys(PLATFORMS);

  $("dl-grid").innerHTML = order.map((key) => {
    const p = PLATFORMS[key];
    const files = p.files.map((f) => {
      const best = key === os && (!f.arch || (f.arch === "arm") === arm);
      return `<a class="btn ${best ? "primary" : ""}" href="${RELEASES}${f.file}" download>
        <span>${f.label}</span><small>${f.note}</small></a>`;
    }).join("");
    return `<div class="dl-card ${key === os ? "yours" : ""}">
      ${key === os ? '<span class="tag">Your computer</span>' : ""}
      <div class="os">${ICONS[key]}${p.name}</div>
      <p>${p.blurb}</p>
      <div class="files">${files}</div>
    </div>`;
  }).join("");

  const hero = $("hero-download");
  if (os in PLATFORMS) {
    const p = PLATFORMS[os];
    const f = p.files.find((x) => !x.arch || (x.arch === "arm") === arm) || p.files[0];
    hero.href = RELEASES + f.file;
    hero.setAttribute("download", "");
    $("hero-download-label").textContent = `Download for ${p.name}`;
    $("hero-os-icon").innerHTML = ICONS[os];
    $("hero-note").textContent = `Free · ${f.label} ${f.note} · Other systems below`;
    $("dl-title").textContent = `Looks like you're on ${p.name}.`;
  } else if (os === "mobile") {
    hero.href = "#sounds";
    $("hero-download-label").textContent = "Try the sounds";
    $("hero-try").hidden = true; // same job as the main button here
    $("hero-note").textContent = "KeyBuddy is a desktop app for macOS, Windows & Linux.";
    $("dl-mobile").hidden = false;
  }
}

// ---------- theme ----------

function setupTheme() {
  const root = document.documentElement;
  // Light unless you've switched to dark.
  const dark = () => root.dataset.theme === "dark";
  const btn = $("theme");
  btn.addEventListener("click", () => {
    const next = dark() ? "light" : "dark";
    const apply = () => {
      root.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch {}
    };
    btn.classList.remove("spin");
    void btn.offsetWidth; // restart the icon spin
    btn.classList.add("spin");

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    if (!document.startViewTransition) {
      // Older browsers: cross-fade colours instead of snapping.
      root.classList.add("theming");
      apply();
      setTimeout(() => root.classList.remove("theming"), 450);
      return;
    }
    // The new theme grows out of the toggle as a circle.
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(apply).ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 600, easing: "cubic-bezier(0.22, 0.8, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
  });
}

// ---------- keys ----------

// KeyboardEvent.code -> the app's key codes (Linux evdev numbering).
const CODES = {
  Escape: 1, Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6, Digit6: 7, Digit7: 8, Digit8: 9,
  Digit9: 10, Digit0: 11, Minus: 12, Equal: 13, Backspace: 14, Tab: 15, KeyQ: 16, KeyW: 17, KeyE: 18,
  KeyR: 19, KeyT: 20, KeyY: 21, KeyU: 22, KeyI: 23, KeyO: 24, KeyP: 25, BracketLeft: 26, BracketRight: 27,
  Enter: 28, ControlLeft: 29, KeyA: 30, KeyS: 31, KeyD: 32, KeyF: 33, KeyG: 34, KeyH: 35, KeyJ: 36,
  KeyK: 37, KeyL: 38, Semicolon: 39, Quote: 40, Backquote: 41, ShiftLeft: 42, Backslash: 43, KeyZ: 44,
  KeyX: 45, KeyC: 46, KeyV: 47, KeyB: 48, KeyN: 49, KeyM: 50, Comma: 51, Period: 52, Slash: 53,
  ShiftRight: 54, AltLeft: 56, Space: 57, CapsLock: 58, F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64,
  F7: 65, F8: 66, F9: 67, F10: 68, IntlBackslash: 86, F11: 87, F12: 88, NumpadEnter: 96, ControlRight: 97,
  AltRight: 100, Home: 102, ArrowUp: 103, PageUp: 104, ArrowLeft: 105, ArrowRight: 106, End: 107,
  ArrowDown: 108, PageDown: 109, Insert: 110, Delete: 111, MetaLeft: 125, MetaRight: 126, ContextMenu: 127,
  Fn: 464,
};

// Same classes as the app: 0 normal, 1 modifier, 2 space, 3 enter, 4 backspace.
function keyClass(code) {
  if (code === 57) return 2;
  if (code === 28 || code === 96) return 3;
  if (code === 14 || code === 111) return 4;
  if ([15, 29, 42, 54, 56, 58, 97, 100, 125, 126, 127, 464].includes(code)) return 1;
  return 0;
}

const MAC_LIKE = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// [code, label, width]
const ROWS = [
  [[1, "esc", 1.5], [59, "F1"], [60, "F2"], [61, "F3"], [62, "F4"], [63, "F5"], [64, "F6"],
   [65, "F7"], [66, "F8"], [67, "F9"], [68, "F10"], [87, "F11"], [88, "F12"], [111, "del", 1.5]],
  [[41, "`"], [2, "1"], [3, "2"], [4, "3"], [5, "4"], [6, "5"], [7, "6"], [8, "7"], [9, "8"],
   [10, "9"], [11, "0"], [12, "-"], [13, "="], [14, MAC_LIKE ? "delete" : "backspace", 2]],
  [[15, "tab", 1.5], [16, "Q"], [17, "W"], [18, "E"], [19, "R"], [20, "T"], [21, "Y"], [22, "U"],
   [23, "I"], [24, "O"], [25, "P"], [26, "["], [27, "]"], [43, "\\", 1.5]],
  [[58, "caps", 1.75], [30, "A"], [31, "S"], [32, "D"], [33, "F"], [34, "G"], [35, "H"], [36, "J"],
   [37, "K"], [38, "L"], [39, ";"], [40, "'"], [28, MAC_LIKE ? "return" : "enter", 2.25]],
  [[42, "shift", 2.25], [44, "Z"], [45, "X"], [46, "C"], [47, "V"], [48, "B"], [49, "N"], [50, "M"],
   [51, ","], [52, "."], [53, "/"], [54, "shift", 2.75]],
  MAC_LIKE
    ? [[464, "fn"], [29, "ctrl"], [56, "opt"], [125, "cmd", 1.25], [57, "", 6.25], [126, "cmd", 1.25],
       [100, "opt"], [105, "←"], [108, "↓"], [106, "→"]]
    : [[29, "ctrl", 1.25], [125, "win", 1.25], [56, "alt", 1.25], [57, "", 6.25], [100, "alt", 1.25],
       [126, "win", 1.25], [127, "menu", 1.25], [97, "ctrl", 1.25]],
];

// Horizontal position of each key (0 = left, 1 = right) for stereo.
const KEY_X = new Map();
for (const row of ROWS) {
  const total = row.reduce((s, k) => s + (k[2] || 1), 0);
  let x = 0;
  for (const [code, , w = 1] of row) {
    KEY_X.set(code, (x + w / 2) / total);
    x += w;
  }
}

// ---------- audio ----------

const SR = 48000;
const PACKS = [
  { id: "lk-creamy", name: "Creamy", kind: "Evo80", build: ["Evo80", "PP plate", "Neo x Keygeek Oat"],
    blurb: "Smooth, soft and buttery, like typing on frosting.", cap: "#f4e7d0", edge: "#c9b08a", ink: "#6b5233" },
  { id: "lk-poppy", name: "Poppy", kind: "Rainy75 Pro", build: ["Rainy75 Pro", "HMX Pink Pig"],
    blurb: "Round little pops, like bubble wrap that never runs out.", cap: "#ffb8ca", edge: "#d47b95", ink: "#7a2a43" },
  { id: "lk-clacky", name: "Clacky", kind: "Rainy75", build: ["Rainy75", "Akko Cilantro"],
    blurb: "Bright, crisp and a little rattly.", cap: "#c3ead3", edge: "#7db796", ink: "#285a3e" },
  { id: "lk-thocky", name: "Thocky", kind: "Crush80", build: ["Crush80", "Ceramic keycaps", "Kailh Cocoa"],
    blurb: "Deep, heavy and solid. The one people mean when they say thock.", cap: "#6e4c3b", edge: "#3e281e", ink: "#f6e4d4" },
  { id: "lk-clicky", name: "Clicky", kind: "QK65", build: ["QK65", "Outemu Ocean"],
    blurb: "A sharp click on every single press. Your neighbours will know.", cap: "#a3cbff", edge: "#5c8dcf", ink: "#1d3e6b" },
  { id: "lk-lego", name: "Lego", kind: "Luminkey80", build: ["Luminkey80", "BSUN Dusty Rose"],
    blurb: "Plasticky snaps, like clicking bricks together.", cap: "#ffd462", edge: "#cf9f28", ink: "#6b4c0a" },
];
const DEFAULT_PACK = PACKS[0].id;

let ctx = null;
let master = null;
let pack = DEFAULT_PACK;
const raw = {}; // id -> Promise<{press: Float32Array[][], release: ...}>
const buffers = {}; // id -> {press: AudioBuffer[][], release: AudioBuffer[][]}

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.gain.value = 0.9;
    // Gentle limiter so "hard" settings never clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    master.connect(limiter).connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// .kbp: "KBP1", then entries of u8 kind, u8 class, u32 LE count, i16 LE samples.
function parseKbp(buf) {
  const v = new DataView(buf);
  const out = { press: [[], [], [], [], []], release: [[], [], [], [], []] };
  if (v.getUint32(0) !== 0x4b425031) throw new Error("not a KeyBuddy pack");
  let o = 4;
  while (o + 6 <= v.byteLength) {
    const kind = v.getUint8(o);
    const cls = v.getUint8(o + 1);
    const n = v.getUint32(o + 2, true);
    o += 6;
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = v.getInt16(o + i * 2, true) / 32768;
    o += n * 2;
    (kind === 0 ? out.press : out.release)[cls]?.push(s);
  }
  return out;
}

function loadPack(id) {
  raw[id] ||= fetch(`packs/${id}.kbp`).then((r) => {
    if (!r.ok) throw new Error(`pack ${id}: ${r.status}`);
    return r.arrayBuffer();
  }).then(parseKbp);
  return raw[id];
}

async function bankFor(id) {
  if (buffers[id]) return buffers[id];
  const data = await loadPack(id);
  const c = audio();
  const toBuf = (s) => {
    const b = c.createBuffer(1, s.length, SR);
    b.copyToChannel(s, 0);
    return b;
  };
  // Sort every class's takes from softest to hardest hit, so "feel" can pick
  // gentler or harder real recordings instead of only changing volume.
  const peak = (s) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const sorted = (lists) => lists.map((l) => [...l].sort((a, b) => peak(a) - peak(b)).map(toBuf));
  buffers[id] = { press: sorted(data.press), release: sorted(data.release) };
  return buffers[id];
}

// ---------- soft <-> hard ----------

// 0 = softest, 1 = hardest, per sound. Remembered in this browser.
const feel = (() => {
  try { return JSON.parse(localStorage.getItem("feel") || "{}"); } catch { return {}; }
})();
const feelOf = (id) => (typeof feel[id] === "number" ? feel[id] : 0.5);
function setFeel(id, h) {
  feel[id] = Math.min(1, Math.max(0, h));
  try { localStorage.setItem("feel", JSON.stringify(feel)); } catch {}
}

function playKey(code, down, id = pack) {
  const bank = buffers[id];
  if (!bank) {
    bankFor(id).then(() => down && playKey(code, down, id));
    return;
  }
  const c = audio();
  const h = feelOf(id);
  const cls = keyClass(code);
  const takes = (down ? bank.press : bank.release)[cls];
  if (!takes || !takes.length) return;

  // Pick from the soft or hard end of the recordings. Each key keeps its own
  // spot inside that window, so repeated keys still sound like the same key.
  const n = takes.length;
  const span = Math.max(2, Math.round(n * 0.4));
  const offset = ((Math.imul(code, 2654435761) >>> 0) % span) - Math.floor(span / 2);
  const take = takes[Math.min(n - 1, Math.max(0, Math.round(h * (n - 1)) + offset))];

  const src = c.createBufferSource();
  src.buffer = take;
  // softer presses land a touch lower, harder ones a touch higher
  src.playbackRate.value = (0.95 + 0.08 * h) * (0.985 + Math.random() * 0.03);

  // Level, with a rounded attack when soft (takes the edge off the click).
  const gain = c.createGain();
  // takes already carry real loudness differences; this just adds a little on top
  const level = (0.75 + 0.35 * h) * (0.9 + Math.random() * 0.1);
  const t = c.currentTime;
  const attack = (1 - h) * 0.006;
  if (attack > 0.0005) {
    gain.gain.setValueAtTime(level * 0.2, t);
    gain.gain.linearRampToValueAtTime(level, t + attack);
  } else {
    gain.gain.value = level;
  }

  // Tone: soft is darker and muffled, hard is brighter and snappier.
  const shelf = c.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 3000;
  shelf.gain.value = (h - 0.5) * 14;
  const lowpass = c.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 1600 * Math.pow(20000 / 1600, Math.min(1, h * 2));

  let node = src.connect(gain).connect(shelf).connect(lowpass);
  if (c.createStereoPanner) {
    const pan = c.createStereoPanner();
    pan.pan.value = ((KEY_X.get(code) ?? 0.85) * 2 - 1) * 0.7;
    node = node.connect(pan);
  }
  node.connect(master);
  src.start(t);
}

function demo(id, onDone) {
  // "keybuddy hi⏎" with human-ish timing
  const phrase = [37, 18, 21, 48, 22, 32, 32, 21, 57, 35, 23, 28];
  bankFor(id).then(() => {
    let t = 0;
    phrase.forEach((code, i) => {
      setTimeout(() => { playKey(code, true, id); press(code, true); }, t);
      setTimeout(() => { playKey(code, false, id); press(code, false); }, t + 70);
      t += 115 + ((code * 7) % 40);
      if (i === phrase.length - 1) setTimeout(() => onDone && onDone(), t);
    });
  });
}

// ---------- visuals ----------

const keyEls = new Map();
let buddyTimer;

function press(code, down) {
  for (const el of keyEls.get(code) || []) el.classList.toggle("down", down);
  if (down) {
    const b = $("hero-buddy");
    b.classList.add("press");
    clearTimeout(buddyTimer);
    buddyTimer = setTimeout(() => b.classList.remove("press"), 90);
  }
}

function buildKeyboard() {
  const kb = $("keyboard");
  ROWS.forEach((row, i) => {
    const r = document.createElement("div");
    r.className = i === 0 ? "krow fn" : "krow";
    for (const [code, label, w = 1] of row) {
      const k = document.createElement("button");
      k.className = "key";
      k.style.setProperty("--w", w);
      k.textContent = label;
      k.tabIndex = -1;
      k.setAttribute("aria-label", label || "space");
      k.addEventListener("pointerdown", (e) => {
        e.preventDefault(); // don't steal focus (keeps a phone keyboard closed)
        playKey(code, true);
        press(code, true);
        tapType(code);
      });
      const up = () => {
        if (!k.classList.contains("down")) return;
        playKey(code, false);
        press(code, false);
      };
      k.addEventListener("pointerup", up);
      k.addEventListener("pointerleave", up);
      r.appendChild(k);
      if (!keyEls.has(code)) keyEls.set(code, []);
      keyEls.get(code).push(k);
    }
    kb.appendChild(r);
  });
}

// ---------- switch tester ----------

// Press a keycap: it sinks and plays that sound's press; letting go plays the
// release, like a real tester. Pressing also picks the sound everywhere.
const TESTER_CODE = 35; // play as the H key: a normal key near the middle

function pressCap(id, down) {
  const cap = document.querySelector(`.tcap[data-id="${id}"]`);
  if (!cap) return;
  if (down) {
    if (cap.classList.contains("down")) return;
    cap.classList.add("down");
    playKey(TESTER_CODE, true, id);
    if (id !== pack) selectPack(id);
  } else if (cap.classList.contains("down")) {
    cap.classList.remove("down");
    playKey(TESTER_CODE, false, id);
  }
}

function renderInfo() {
  const p = PACKS.find((x) => x.id === pack);
  if (!p) return;
  $("tester-info").style.cssText = `--cap:${p.cap};--edge:${p.edge};--cap-ink:${p.ink}`;
  $("tester-info").innerHTML = `
    <span class="mini-cap" aria-hidden="true">${esc(p.name[0])}</span>
    <div class="info-text">
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.blurb)}</p>
      <div class="build">${p.build.map((b) => `<span>${esc(b)}</span>`).join("")}</div>
    </div>
    <div class="info-actions">
      <button class="btn primary small" id="info-demo">▶ Hear a sentence</button>
      <a class="btn ghost small" href="#playground">Type with it ↓</a>
    </div>`;
  $("info-demo").addEventListener("click", () => {
    const cap = document.querySelector(`.tcap[data-id="${p.id}"]`);
    cap && cap.classList.add("playing");
    demo(p.id, () => cap && cap.classList.remove("playing"));
  });
}

function buildPacks() {
  $("tester").innerHTML = PACKS.map((p, i) => `
    <button class="tcap" role="radio" aria-checked="false" data-id="${p.id}" data-n="${i + 1}"
      style="--cap:${p.cap};--edge:${p.edge};--cap-ink:${p.ink}" aria-label="${esc(p.name)}, key ${i + 1}">
      <span class="well"><span class="led"></span><span class="top"><b>${esc(p.name[0])}</b></span></span>
      <span class="tname">${esc(p.name)}</span>
    </button>`).join("");
  $("pg-chips").innerHTML = PACKS.map((p) =>
    `<button class="chip" role="radio" data-id="${p.id}" aria-checked="false">${esc(p.name)}</button>`).join("");

  for (const cap of document.querySelectorAll(".tcap")) {
    const id = cap.dataset.id;
    cap.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pressCap(id, true);
    });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
      cap.addEventListener(ev, () => pressCap(id, false));
    }
    // keyboard users: Space / Enter on a focused cap
    cap.addEventListener("keydown", (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        pressCap(id, true);
      }
    });
    cap.addEventListener("keyup", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.stopPropagation();
        pressCap(id, false);
      }
    });
  }
  for (const chip of document.querySelectorAll(".chip")) {
    chip.addEventListener("mousedown", (e) => e.preventDefault()); // keep typing focus
    chip.addEventListener("click", () => selectPack(chip.dataset.id));
  }
}

// True when the switch tester is in the middle of the screen.
function testerInView() {
  const r = $("tester").getBoundingClientRect();
  return r.top < innerHeight * 0.75 && r.bottom > innerHeight * 0.25;
}

// Five feel levels, softest to hardest.
const LEVELS = ["Pillow", "Soft", "Medium", "Firm", "Hard"];
const levelOf = (h) => Math.round(h * (LEVELS.length - 1));

function renderFeel() {
  const lvl = levelOf(feelOf(pack));
  const p = PACKS.find((x) => x.id === pack);
  $("feel-name").textContent = p ? p.name : "";
  $("feel-value").textContent = LEVELS[lvl];
  document.querySelectorAll(".level").forEach((el, i) => {
    el.classList.toggle("on", i <= lvl);
    el.setAttribute("aria-checked", String(i === lvl));
  });
}

function setupFeel() {
  $("levels").innerHTML = LEVELS.map((name, i) =>
    `<button class="level" role="radio" aria-checked="false" style="--i:${i}" title="${name}">
      <span class="block"></span><span class="lbl">${name}</span>
    </button>`).join("");
  document.querySelectorAll(".level").forEach((el, i) => {
    el.addEventListener("mousedown", (e) => e.preventDefault()); // keep typing focus
    el.addEventListener("click", () => {
      setFeel(pack, i / (LEVELS.length - 1));
      renderFeel();
      // let you hear it right away
      playKey(37, true);
      setTimeout(() => playKey(37, false), 80);
    });
  });
}

function selectPack(id) {
  if (!PACKS.some((p) => p.id === id)) return;
  const changed = id !== pack;
  pack = id;
  for (const el of document.querySelectorAll(".tcap, .chip")) {
    el.setAttribute("aria-checked", String(el.dataset.id === id));
  }
  bankFor(id);
  renderFeel();
  renderInfo();
  if (changed) newPassage();
}

// ---------- typing test ----------

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
};

const pr = { pack: null, idx: -1, text: "", typed: "", strokes: 0, errors: 0, start: 0, end: 0, timer: null };

function newPassage() {
  const list = PASSAGES[pack.replace(/^lk-/, "")] || PASSAGES.thocky;
  let i;
  do i = Math.floor(Math.random() * list.length); while (pack === pr.pack && i === pr.idx && list.length > 1);
  clearInterval(pr.timer);
  Object.assign(pr, { pack, idx: i, text: list[i], typed: "", strokes: 0, errors: 0, start: 0, end: 0 });
  $("pg-hint").className = "muted";
  $("pg-hint").textContent = "Mistakes show in red. Backspace to fix them.";
  afterTyping();
}

function renderPassage() {
  const html = [];
  for (let i = 0; i < pr.text.length; i++) {
    const c = pr.text[i];
    let cls = "";
    if (i < pr.typed.length) cls = pr.typed[i] === c ? "ok" : "bad";
    else if (i === pr.typed.length) cls = "cur";
    html.push(`<span class="${cls}">${c === " " ? "&nbsp;</span><wbr>" : esc(c) + "</span>"}`);
  }
  $("passage").innerHTML = html.join("");
}

function numbers() {
  const now = pr.end || performance.now();
  const secs = pr.start ? (now - pr.start) / 1000 : 0;
  let correct = 0;
  for (let i = 0; i < pr.typed.length; i++) if (pr.typed[i] === pr.text[i]) correct++;
  return {
    secs,
    wpm: secs > 1 ? Math.round(correct / 5 / (secs / 60)) : 0,
    acc: pr.strokes ? Math.round(((pr.strokes - pr.errors) / pr.strokes) * 100) : 100,
  };
}

function updateStats() {
  const { secs, wpm, acc } = numbers();
  $("pg-wpm").textContent = wpm;
  $("pg-acc").textContent = acc;
  $("pg-time").textContent = secs.toFixed(1);
}

function typeChar(ch) {
  if (pr.end) return;
  if (!pr.start) {
    pr.start = performance.now();
    pr.timer = setInterval(updateStats, 100);
  }
  pr.strokes++;
  if (ch !== pr.text[pr.typed.length]) pr.errors++;
  pr.typed += ch;
  if (pr.typed.length >= pr.text.length) finish();
}

function typeBack() {
  if (!pr.end) pr.typed = pr.typed.slice(0, -1);
}

function afterTyping() {
  renderPassage();
  updateStats();
  syncInput();
}

// Physical keyboards (desktop). Phones send "Unidentified" here and go through onInput.
function typeKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey || pr.end) return false;
  if (e.key === "Backspace") typeBack();
  else if (e.key.length === 1) typeChar(e.key);
  else return false;
  afterTyping();
  return true;
}

// ----- phone keyboards -----
// The hidden field always holds SENT + what you've typed. Comparing old and new
// values handles typing, backspace and autocorrect swapping a word. SENT lets a
// backspace register even when nothing is typed yet.
const SENT = "\u200b";

function syncInput() {
  const input = $("pg-input");
  const v = SENT + pr.typed;
  if (input.value !== v) input.value = v;
}

const CHAR_CODE = (() => {
  const m = {};
  const plain = "1234567890-=qwertyuiop[]asdfghjkl;'`\\zxcvbnm,./";
  const shifted = '!@#$%^&*()_+QWERTYUIOP{}ASDFGHJKL:"~|ZXCVBNM<>?';
  const codes = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
    30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53];
  codes.forEach((c, i) => { m[plain[i]] = c; m[shifted[i]] = c; });
  m[" "] = 57;
  return m;
})();
const CODE_CHAR = (() => {
  const plain = {}, shifted = {};
  for (const [ch, code] of Object.entries(CHAR_CODE)) {
    if (/[a-z0-9\-=\[\];'`\\,.\/ ]/.test(ch)) plain[code] = ch;
    else shifted[code] = ch;
  }
  return { plain, shifted };
})();

function tapSound(code) {
  playKey(code, true);
  press(code, true);
  setTimeout(() => { playKey(code, false); press(code, false); }, 70);
}

function onInput() {
  const v = $("pg-input").value;
  if (!v.startsWith(SENT)) {
    // backspaced past the start
    typeBack();
    tapSound(14);
  } else {
    const next = v.slice(SENT.length);
    let same = 0;
    while (same < next.length && same < pr.typed.length && next[same] === pr.typed[same]) same++;
    for (let i = pr.typed.length; i > same; i--) { typeBack(); tapSound(14); }
    for (const ch of next.slice(same)) {
      typeChar(ch);
      tapSound(CHAR_CODE[ch] || 30);
      if (pr.end) break;
    }
  }
  afterTyping();
}

// ----- on-screen keyboard -----
const mods = { shift: false, caps: false };

function setLatch(code, on) {
  for (const el of keyEls.get(code) || []) el.classList.toggle("latched", on);
}

function tapType(code) {
  if (code === 42 || code === 54) {
    mods.shift = !mods.shift;
    setLatch(42, mods.shift);
    setLatch(54, mods.shift);
    return;
  }
  if (code === 58) {
    mods.caps = !mods.caps;
    setLatch(58, mods.caps);
    return;
  }
  if (code === 14) {
    typeBack();
  } else {
    let ch = (mods.shift ? CODE_CHAR.shifted[code] : CODE_CHAR.plain[code]) || CODE_CHAR.plain[code];
    if (!ch) return;
    if (mods.caps && /[a-z]/.test(ch)) ch = ch.toUpperCase();
    typeChar(ch);
    if (mods.shift) {
      mods.shift = false;
      setLatch(42, false);
      setLatch(54, false);
    }
  }
  afterTyping();
}

function finish() {
  pr.end = performance.now();
  clearInterval(pr.timer);
  const { wpm, acc } = numbers();
  let best = 0;
  try { best = Number(localStorage.getItem("best") || 0); } catch {}
  if (wpm > best) try { localStorage.setItem("best", String(wpm)); } catch {}
  $("pg-hint").className = "result";
  $("pg-hint").textContent = wpm > best
    ? `New best: ${wpm} wpm at ${acc}% accuracy!`
    : `${wpm} wpm at ${acc}% accuracy. Your best is ${best} wpm.`;
}

// ---------- typing anywhere ----------

// True when the Playground fills the middle of the screen.
function playgroundInView() {
  const r = $("playground").getBoundingClientRect();
  return r.top < innerHeight * 0.6 && r.bottom > innerHeight * 0.4;
}

function setupKeys() {
  const held = new Set();
  document.addEventListener("keydown", (e) => {
    const digit = /^Digit([1-6])$/.exec(e.code);
    if (digit && !e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement !== $("pg-input") && testerInView()) {
      e.preventDefault();
      if (!e.repeat) pressCap(PACKS[digit[1] - 1].id, true);
      return;
    }
    const code = CODES[e.code];
    if (code && !held.has(code)) {
      held.add(code);
      playKey(code, true);
      press(code, true);
    }
    const input = $("pg-input");
    if (document.activeElement === input) {
      if (typeKey(e)) e.preventDefault();
    } else if (playgroundInView() && !e.target.closest("input, textarea, select, button, [contenteditable]")) {
      // On the Playground, just start typing: the first key jumps into the test.
      if (typeKey(e)) {
        e.preventDefault(); // also stops space from scrolling the page
        input.focus({ preventScroll: true });
      }
    }
  });
  document.addEventListener("keyup", (e) => {
    const digit = /^Digit([1-6])$/.exec(e.code);
    if (digit && document.querySelector(`.tcap[data-n="${digit[1]}"].down`)) {
      pressCap(PACKS[digit[1] - 1].id, false);
      return;
    }
    const code = CODES[e.code];
    if (code && held.delete(code)) {
      playKey(code, false);
      press(code, false);
    }
  });
  // Safari won't start audio until a gesture; any click or key unlocks it.
  const unlock = () => audio();
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}

// ---------- in-page links ----------

// Scroll to sections without adding #sounds etc. to the address bar.
function setupAnchors() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const id = a.getAttribute("href").slice(1);
    const target = id && id !== "top" ? document.getElementById(id) : null;
    e.preventDefault();
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  });
  // Old shared links with a hash still land in the right place, then tidy the URL.
  if (location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) requestAnimationFrame(() => target.scrollIntoView());
    history.replaceState(null, "", location.pathname + location.search);
  }
}

// ---------- go ----------

setupAnchors();
setupFeel();

setupTheme();
setupDownloads();
buildPacks();
buildKeyboard();
setupKeys();
selectPack(DEFAULT_PACK);
newPassage();
$("pg-new").addEventListener("click", () => { newPassage(); $("pg-input").focus(); });
{
  const input = $("pg-input");
  const wrap = $("passage-wrap");
  input.addEventListener("input", onInput);
  input.addEventListener("focus", () => { wrap.classList.add("focused"); syncInput(); });
  input.addEventListener("blur", () => wrap.classList.remove("focused"));
  // keep the caret at the end so edits only happen to what you just typed
  input.addEventListener("selectionchange", () => input.setSelectionRange(input.value.length, input.value.length));
}
loadPack(DEFAULT_PACK);
// fetch the rest once the page has settled
setTimeout(() => PACKS.forEach((p) => loadPack(p.id)), 1500);
