// KeyBuddy website: plays the app's real sound packs in the browser.

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- downloads ----------

// Release assets use Tauri's default bundle names. Update VERSION on release.
const VERSION = "0.1.0";
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
  const dark = () =>
    root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  $("theme").addEventListener("click", () => {
    root.dataset.theme = dark() ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch {}
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
  { id: "thocky", name: "Thocky", kind: "Linear", blurb: "Smooth linears with a deep, round bottom-out. The sound of a foam-filled board." },
  { id: "clacky", name: "Clacky", kind: "Linear", blurb: "Bright, hollow clack off hard caps. Crisp and a little rattly." },
  { id: "clicky", name: "Clicky", kind: "Clicky", blurb: "Click-jacket blues. Loud, crisp and completely unapologetic." },
  { id: "tactile", name: "Tactile", kind: "Tactile", blurb: "Browns: a soft bump, then a muted landing. Quiet but present." },
];

let ctx = null;
let master = null;
let pack = "thocky";
const raw = {}; // id -> Promise<{press: Float32Array[][], release: ...}>
const buffers = {}; // id -> {press: AudioBuffer[][], release: AudioBuffer[][]}

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
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
  buffers[id] = { press: data.press.map((l) => l.map(toBuf)), release: data.release.map((l) => l.map(toBuf)) };
  return buffers[id];
}

function playKey(code, down, id = pack) {
  const bank = buffers[id];
  if (!bank) {
    bankFor(id).then(() => down && playKey(code, down, id));
    return;
  }
  const c = audio();
  const cls = keyClass(code);
  const takes = (down ? bank.press : bank.release)[cls];
  if (!takes || !takes.length) return;
  // each key keeps its own take; tiny jitter keeps repeats alive
  const take = takes[(Math.imul(code, 2654435761) >>> 0) % takes.length];
  const src = c.createBufferSource();
  src.buffer = take;
  src.playbackRate.value = 0.975 + Math.random() * 0.05;
  const gain = c.createGain();
  gain.gain.value = 0.85 + Math.random() * 0.15;
  let node = src.connect(gain);
  if (c.createStereoPanner) {
    const pan = c.createStereoPanner();
    pan.pan.value = ((KEY_X.get(code) ?? 0.85) * 2 - 1) * 0.7;
    node = node.connect(pan);
  }
  node.connect(master);
  src.start();
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
        e.preventDefault();
        playKey(code, true);
        press(code, true);
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

function buildPacks() {
  $("pack-grid").innerHTML = PACKS.map((p) => `
    <button class="pack-card" role="radio" data-id="${p.id}" aria-checked="false">
      <span class="glyph">${esc(p.name[0])}</span>
      <div><span class="kind">${esc(p.kind)}</span><h3>${esc(p.name)}</h3></div>
      <p>${esc(p.blurb)}</p>
      <span class="play"><i>▶</i>Hear it</span>
    </button>`).join("");
  $("pg-chips").innerHTML = PACKS.map((p) =>
    `<button class="chip" role="radio" data-id="${p.id}" aria-checked="false">${esc(p.name)}</button>`).join("");

  for (const card of document.querySelectorAll(".pack-card")) {
    card.addEventListener("click", () => {
      selectPack(card.dataset.id);
      card.classList.add("playing");
      demo(card.dataset.id, () => card.classList.remove("playing"));
    });
  }
  for (const chip of document.querySelectorAll(".chip")) {
    chip.addEventListener("mousedown", (e) => e.preventDefault()); // keep typing focus
    chip.addEventListener("click", () => selectPack(chip.dataset.id));
  }
}

function selectPack(id) {
  if (!PACKS.some((p) => p.id === id)) return;
  const changed = id !== pack;
  pack = id;
  for (const el of document.querySelectorAll(".pack-card, .chip")) {
    el.setAttribute("aria-checked", String(el.dataset.id === id));
  }
  bankFor(id);
  if (changed) newPassage();
}

// ---------- typing test ----------

const PASSAGES = {
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
  const list = PASSAGES[pack];
  let i;
  do i = Math.floor(Math.random() * list.length); while (pack === pr.pack && i === pr.idx && list.length > 1);
  clearInterval(pr.timer);
  Object.assign(pr, { pack, idx: i, text: list[i], typed: "", strokes: 0, errors: 0, start: 0, end: 0 });
  $("pg-hint").className = "muted";
  $("pg-hint").textContent = "Mistakes show in red. Backspace to fix them.";
  renderPassage();
  updateStats();
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

function typeKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey || pr.end) return false;
  if (e.key === "Backspace") {
    pr.typed = pr.typed.slice(0, -1);
  } else if (e.key.length === 1) {
    if (!pr.start) {
      pr.start = performance.now();
      pr.timer = setInterval(updateStats, 100);
    }
    pr.strokes++;
    if (e.key !== pr.text[pr.typed.length]) pr.errors++;
    pr.typed += e.key;
    if (pr.typed.length >= pr.text.length) finish();
  } else {
    return false;
  }
  renderPassage();
  updateStats();
  return true;
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

function setupKeys() {
  const held = new Set();
  document.addEventListener("keydown", (e) => {
    const code = CODES[e.code];
    if (code && !held.has(code)) {
      held.add(code);
      playKey(code, true);
      press(code, true);
    }
    if (document.activeElement === $("passage") && typeKey(e)) e.preventDefault();
  });
  document.addEventListener("keyup", (e) => {
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

setupTheme();
setupDownloads();
buildPacks();
buildKeyboard();
setupKeys();
selectPack("thocky");
newPassage();
$("pg-new").addEventListener("click", () => { newPassage(); $("passage").focus(); });
loadPack("thocky");
// fetch the rest once the page has settled
setTimeout(() => PACKS.forEach((p) => loadPack(p.id)), 1500);
