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

const PLAY_ICON = '<svg viewBox="0 0 12 12"><path d="M2 1l9 5-9 5z" fill="currentColor"/></svg>';

function buildPacks(packs) {
  const wrap = $("packs");
  wrap.innerHTML = "";
  for (const p of packs) {
    const el = document.createElement("div");
    el.className = "pack";
    el.setAttribute("role", "radio");
    el.tabIndex = 0;
    el.dataset.id = p.id;
    el.innerHTML = `
      <div class="glyph">${p.name[0]}</div>
      <div class="meta"><div class="name">${p.name}</div><div class="blurb">${p.blurb}</div></div>
      <button class="play" title="Preview ${p.name}" aria-label="Preview ${p.name}">${PLAY_ICON}</button>`;
    el.addEventListener("click", (e) => {
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
  for (const el of document.querySelectorAll(".pack")) {
    el.setAttribute("aria-checked", String(el.dataset.id === settings.pack));
  }
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
  $("wpm").textContent = s.wpm;
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

  await listen("settings", (e) => {
    settings = e.payload;
    render();
  });
  await listen("key", (e) => {
    const [code, down] = e.payload;
    setKey(code, down);
    if (down) bounce();
  });

  setInterval(pollStats, 500);
  pollStats();

  setInterval(async () => {
    if (!$("perm").hidden) showPermission(await invoke("permission"));
  }, 2000);
}

init();
