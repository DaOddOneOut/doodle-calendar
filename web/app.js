/* Doodle Calendar — works in the browser, as an installed web app, and inside the Android app. */
(() => {
"use strict";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["S","M","T","W","T","F","S"];
const ACCENTS = ["#5f93cf","#e2789a","#6aa55a","#ea86a8","#d9a33a","#2f86d0","#3576c9","#e2a10f","#bd7638","#e0731d","#c06a26","#d32f37"];
const COLORS = ["#e2789a","#2f86d0","#6aa55a","#e2a10f","#8a63c9","#d32f37"];
const STORE_KEY = "dc.data.v1";
const SYNC_KEY = "dc.sync.v1";
const GIST_FILE = "doodle-calendar.json";
const isAndroid = !!window.AndroidBridge;

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const now = () => Date.now();

/* ---------------- storage ---------------- */
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

const defaults = () => ({ events: {}, monthNotes: {}, settings: { artOpacity: 30, artIntro: true, mondayStart: false } });
let data = (() => {
  try {
    const d = JSON.parse(safeGet(STORE_KEY));
    if (d && d.events) return { ...defaults(), ...d, settings: { ...defaults().settings, ...(d.settings || {}) } };
  } catch {}
  return defaults();
})();
let syncCfg = (() => { try { return JSON.parse(safeGet(SYNC_KEY)) || {}; } catch { return {}; } })();

function persist({ sync = true } = {}) {
  safeSet(STORE_KEY, JSON.stringify(data));
  pushToAndroid();
  if (sync) scheduleSync();
}

/* custom art lives in IndexedDB (blobs are too big for localStorage) */
const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("doodle-calendar", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("art");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => {
    const t = db.transaction("art", mode); const req = fn(t.objectStore("art"));
    t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error);
  }); };
  return {
    get: (k) => tx("readonly", (s) => s.get(k)).catch(() => null),
    set: (k, v) => tx("readwrite", (s) => s.put(v, k)),
    del: (k) => tx("readwrite", (s) => s.delete(k)),
  };
})();
const artUrlCache = {};
async function artUrl(m) {
  const blob = await idb.get(m + 1);
  if (blob) { if (!artUrlCache[m]) artUrlCache[m] = URL.createObjectURL(blob); return artUrlCache[m]; }
  return `art/${pad(m + 1)}.webp`;
}

/* ---------------- recurrence ---------------- */
function occurs(ev, ds) {
  if (ev.deleted) return false;
  if (ds === ev.date) return true;
  if (ds < ev.date || !ev.repeat || ev.repeat === "none") return false;
  const a = parseYmd(ev.date), b = parseYmd(ds);
  switch (ev.repeat) {
    case "weekly": return Math.round((b - a) / 864e5) % 7 === 0;
    case "monthly": return a.getDate() === b.getDate();
    case "yearly": return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
  }
  return false;
}
const allEvents = () => Object.values(data.events).filter((e) => !e.deleted);
function eventsOn(ds) {
  return allEvents().filter((e) => occurs(e, ds)).sort((x, y) => (x.time || "99").localeCompare(y.time || "99") || x.title.localeCompare(y.title));
}

/* ---------------- view ---------------- */
const today = new Date();
let view = { y: today.getFullYear(), m: today.getMonth() };
let selected = null;
let shownArtMonth = null;

function applySettings() {
  document.documentElement.style.setProperty("--art-opacity", (data.settings.artOpacity / 100).toFixed(2));
}

function render(dir = 0) {
  const { y, m } = view;
  document.documentElement.style.setProperty("--accent", ACCENTS[m]);
  $("monthLabel").textContent = MONTHS[m];
  $("yearLabel").textContent = y;
  $("artMonthName").textContent = MONTHS[m];

  const start = data.settings.mondayStart ? 1 : 0;
  $("dow").innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = (i + start) % 7;
    return `<span class="${d === 0 ? "sun" : ""}">${DOW[d]}</span>`;
  }).join("");

  const first = new Date(y, m, 1);
  const lead = (first.getDay() - start + 7) % 7;
  const daysIn = new Date(y, m + 1, 0).getDate();
  const cells = Math.ceil((lead + daysIn) / 7) * 7;
  const todayS = ymd(new Date());
  const grid = $("grid");
  let html = "";
  for (let i = 0; i < cells; i++) {
    const d = new Date(y, m, 1 - lead + i);
    const ds = ymd(d);
    const evs = eventsOn(ds);
    const cls = ["day", d.getDay() === 0 ? "sun" : "", d.getMonth() !== m ? "other" : "", ds === todayS ? "today" : "", ds === selected ? "selected" : ""].join(" ");
    const dots = evs.slice(0, 3).map((e) => `<i style="background:${e.color || ACCENTS[m]}"></i>`).join("");
    html += `<button class="${cls}" data-d="${ds}" aria-label="${d.toDateString()}${evs.length ? `, ${evs.length} event${evs.length > 1 ? "s" : ""}` : ""}"><span class="num">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  grid.innerHTML = html;
  grid.classList.remove("swap-next", "swap-prev");
  if (dir) { void grid.offsetWidth; grid.classList.add(dir > 0 ? "swap-next" : "swap-prev"); }

  renderAgenda();
  const key = `${y}-${pad(m + 1)}`;
  const note = $("monthNote");
  if (document.activeElement !== note) note.value = (data.monthNotes[key] && data.monthNotes[key].text) || "";
  showArt(m);
}

function renderAgenda() {
  const { y, m } = view;
  const daysIn = new Date(y, m + 1, 0).getDate();
  const items = [];
  for (let d = 1; d <= daysIn; d++) {
    const date = new Date(y, m, d), ds = ymd(date);
    for (const e of eventsOn(ds)) items.push({ e, ds, date });
  }
  const ul = $("agenda");
  if (!items.length) { ul.innerHTML = `<li class="empty">Nothing yet. Tap a day to add something.</li>`; return; }
  ul.innerHTML = items.map(({ e, ds, date }) =>
    `<li data-d="${ds}"><span class="c" style="background:${e.color || ACCENTS[m]}"></span><span class="d">${date.toLocaleDateString(undefined, { weekday: "short" })} ${date.getDate()}</span><span class="t">${esc(e.title)}${e.time ? ` <small>· ${fmtTime(e.time)}</small>` : ""}</span></li>`
  ).join("");
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function fmtTime(t) {
  const [h, mi] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, mi).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/* ---------------- illustration transition ---------------- */
let artFront = $("artA"), artBack = $("artB"), artTimer = 0, firstArt = true;
async function showArt(m) {
  if (shownArtMonth === m && !showArt.force) return;
  showArt.force = false;
  shownArtMonth = m;
  const url = await artUrl(m);
  if (shownArtMonth !== m) return;
  const incoming = artBack, outgoing = artFront;
  artFront = incoming; artBack = outgoing;
  incoming.className = "art";
  incoming.src = url;
  try { await incoming.decode(); } catch {}
  if (shownArtMonth !== m) return;
  outgoing.classList.remove("reveal", "flash", "settled");
  if (outgoing.getAttribute("src")) outgoing.classList.add("out");
  clearTimeout(artTimer);
  const intro = firstArt || data.settings.artIntro;
  requestAnimationFrame(() => {
    const cls = intro ? (firstArt ? "reveal" : "flash") : "settled";
    incoming.classList.add(cls);
    if (intro) {
      artTimer = setTimeout(() => {
        incoming.classList.remove("reveal", "flash"); incoming.classList.add("settled");
        document.body.classList.remove("intro");
      }, firstArt ? 1500 : 700);
    }
    firstArt = false;
  });
}

function go(delta) {
  view.m += delta;
  if (view.m < 0) { view.m = 11; view.y--; }
  if (view.m > 11) { view.m = 0; view.y++; }
  render(delta);
}

/* ---------------- day sheet ---------------- */
let formColor = COLORS[0];
function openSheet(el) {
  $("backdrop").hidden = false; el.hidden = false;
}
function closeSheets() {
  $("backdrop").hidden = true; $("daySheet").hidden = true; $("settingsSheet").hidden = true;
  selected = null; render();
}
function openDay(ds) {
  selected = ds;
  const d = parseYmd(ds);
  $("dayTitle").textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  renderDayEvents();
  resetForm();
  openSheet($("daySheet"));
  render();
}
function renderDayEvents() {
  const evs = eventsOn(selected);
  $("dayEvents").innerHTML = evs.map((e) => `
    <li data-id="${e.id}"><span class="c" style="background:${e.color}"></span>
      <div><div>${esc(e.title)}</div>
      <div class="meta">${[e.time ? fmtTime(e.time) : "All day", e.repeat !== "none" ? `repeats ${e.repeat}` : ""].filter(Boolean).join(" · ")}</div>
      ${e.notes ? `<div class="notes">${esc(e.notes)}</div>` : ""}</div></li>`).join("");
}
function paintColors() {
  $("evColors").innerHTML = COLORS.map((c) => `<button type="button" data-c="${c}" class="${c === formColor ? "on" : ""}" style="background:${c}" aria-label="color"></button>`).join("");
}
function resetForm() {
  $("evId").value = ""; $("evTitle").value = ""; $("evTime").value = ""; $("evRepeat").value = "none"; $("evNotes").value = "";
  formColor = COLORS[0]; paintColors();
  $("evSave").textContent = "Add"; $("evDelete").hidden = true; $("evCancel").hidden = true;
}
function editEvent(id) {
  const e = data.events[id]; if (!e) return;
  $("evId").value = id; $("evTitle").value = e.title; $("evTime").value = e.time || ""; $("evRepeat").value = e.repeat || "none"; $("evNotes").value = e.notes || "";
  formColor = e.color || COLORS[0]; paintColors();
  $("evSave").textContent = "Save"; $("evDelete").hidden = false; $("evCancel").hidden = false;
  $("evTitle").focus();
}
$("eventForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const title = $("evTitle").value.trim(); if (!title) return;
  const id = $("evId").value || uid();
  const prev = data.events[id];
  data.events[id] = {
    id, title, date: prev ? prev.date : selected,
    time: $("evTime").value, repeat: $("evRepeat").value, color: formColor,
    notes: $("evNotes").value.trim(), updatedAt: now(),
  };
  persist(); renderDayEvents(); resetForm(); render();
});
$("evDelete").onclick = () => {
  const id = $("evId").value; const e = data.events[id]; if (!e) return;
  data.events[id] = { id, deleted: true, updatedAt: now(), date: e.date };
  persist(); renderDayEvents(); resetForm(); render(); toast("Deleted");
};
$("evCancel").onclick = resetForm;
$("evColors").onclick = (e) => { const c = e.target.dataset.c; if (c) { formColor = c; paintColors(); } };
$("dayEvents").onclick = (e) => { const li = e.target.closest("li"); if (li) editEvent(li.dataset.id); };

/* ---------------- month notes ---------------- */
let noteTimer;
$("monthNote").addEventListener("input", () => {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    data.monthNotes[`${view.y}-${pad(view.m + 1)}`] = { text: $("monthNote").value, updatedAt: now() };
    persist();
  }, 500);
});

/* ---------------- interactions ---------------- */
$("prevBtn").onclick = () => go(-1);
$("nextBtn").onclick = () => go(1);
$("todayBtn").onclick = () => { const t = new Date(); const d = (t.getFullYear() - view.y) * 12 + t.getMonth() - view.m; view = { y: t.getFullYear(), m: t.getMonth() }; render(Math.sign(d)); };
$("grid").onclick = (e) => { const b = e.target.closest(".day"); if (b) openDay(b.dataset.d); };
$("agenda").onclick = (e) => { const li = e.target.closest("li[data-d]"); if (li) openDay(li.dataset.d); };
$("backdrop").onclick = closeSheets;
$("dayClose").onclick = closeSheets;
$("peekBtn").onclick = () => document.body.classList.toggle("peek");
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.key === "ArrowLeft") go(-1);
  if (e.key === "ArrowRight") go(1);
  if (e.key === "Escape") { document.body.classList.remove("peek"); closeSheets(); }
});
(() => { // swipe between months
  let x0 = null, y0 = 0;
  const el = $("cal");
  el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    x0 = null;
  });
})();
document.addEventListener("click", (e) => { if (document.body.classList.contains("peek") && !e.target.closest("#peekBtn")) document.body.classList.remove("peek"); }, true);

/* ---------------- settings ---------------- */
$("settingsBtn").onclick = () => {
  $("artOpacity").value = data.settings.artOpacity;
  $("artIntro").checked = data.settings.artIntro;
  $("mondayStart").checked = data.settings.mondayStart;
  $("syncToken").value = syncCfg.token ? "••••••••••••" : "";
  updateSyncUi();
  openSheet($("settingsSheet"));
};
$("settingsClose").onclick = closeSheets;
$("artOpacity").oninput = (e) => { data.settings.artOpacity = +e.target.value; applySettings(); };
$("artOpacity").onchange = () => persist({ sync: false });
$("artIntro").onchange = (e) => { data.settings.artIntro = e.target.checked; persist({ sync: false }); };
$("mondayStart").onchange = (e) => { data.settings.mondayStart = e.target.checked; persist({ sync: false }); render(); };

$("artUploadBtn").onclick = () => $("artFile").click();
$("artFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const blob = await prepareArt(f, $("artCutout").checked);
    const m = view.m;
    await idb.set(m + 1, blob);
    if (artUrlCache[m]) { URL.revokeObjectURL(artUrlCache[m]); delete artUrlCache[m]; }
    if (isAndroid) window.AndroidBridge.setArt(m + 1, await blobToDataUrl(blob));
    showArt.force = true; showArt(m); toast(`${MONTHS[m]} art updated`);
  } catch (err) { toast("Couldn't use that image"); console.error(err); }
};
$("artResetBtn").onclick = async () => {
  const m = view.m; await idb.del(m + 1);
  if (artUrlCache[m]) { URL.revokeObjectURL(artUrlCache[m]); delete artUrlCache[m]; }
  if (isAndroid) window.AndroidBridge.clearArt(m + 1);
  showArt.force = true; showArt(m); toast("Original art restored");
};

/* resize an upload and (optionally) knock out the white paper around it */
async function prepareArt(file, cutout) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.drawImage(bmp, 0, 0, w, h);
  if (cutout) {
    const img = g.getImageData(0, 0, w, h), p = img.data;
    const isPaper = (i) => p[i + 3] > 0 && Math.min(p[i], p[i + 1], p[i + 2]) > 232 && Math.max(p[i], p[i + 1], p[i + 2]) - Math.min(p[i], p[i + 1], p[i + 2]) < 18;
    const seen = new Uint8Array(w * h), stack = [];
    for (let x = 0; x < w; x++) { stack.push(x, x + (h - 1) * w); }
    for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
    while (stack.length) {
      const k = stack.pop(); if (seen[k]) continue;
      if (!isPaper(k * 4)) continue;
      seen[k] = 1; p[k * 4 + 3] = 0;
      const x = k % w;
      if (x > 0) stack.push(k - 1); if (x < w - 1) stack.push(k + 1);
      if (k >= w) stack.push(k - w); if (k < w * (h - 1)) stack.push(k + w);
    }
    g.putImageData(img, 0, 0);
  }
  return new Promise((res) => c.toBlob(res, "image/png"));
}
const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

$("exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify({ v: 1, events: data.events, monthNotes: data.monthNotes }, null, 2)], { type: "application/json" });
  if (isAndroid) { window.AndroidBridge.saveFile("doodle-calendar-backup.json", JSON.stringify({ v: 1, events: data.events, monthNotes: data.monthNotes })); return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `doodle-calendar-backup-${ymd(new Date())}.json`; a.click();
};
$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const incoming = JSON.parse(await f.text());
    mergeInto(incoming); persist(); render(); toast("Backup imported");
  } catch { toast("That file isn't a calendar backup"); }
};

/* ---------------- sync (private GitHub gist) ---------------- */
function mergeMaps(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || (v.updatedAt || 0) > (out[k].updatedAt || 0)) out[k] = v;
  return out;
}
function prune(events) {
  const cutoff = now() - 180 * 864e5; const out = {};
  for (const [k, v] of Object.entries(events)) if (!(v.deleted && v.updatedAt < cutoff)) out[k] = v;
  return out;
}
function mergeInto(remote) {
  data.events = prune(mergeMaps(data.events, remote.events));
  data.monthNotes = mergeMaps(data.monthNotes, remote.monthNotes);
}
const syncPayload = () => JSON.stringify({ v: 1, events: data.events, monthNotes: data.monthNotes });

async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${syncCfg.token}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    cache: "no-store",
  });
  if (!r.ok) { const err = new Error(`GitHub ${r.status}`); err.status = r.status; throw err; }
  return r.json();
}
function setDot(state) { $("syncDot").className = "sync-dot " + (state || ""); }
function updateSyncUi(msg) {
  const on = !!(syncCfg.token && syncCfg.gistId);
  $("syncConnect").hidden = on; $("syncNow").hidden = !on; $("syncDisconnect").hidden = !on;
  $("syncToken").disabled = on;
  $("syncStatus").textContent = msg || (on ? `Connected${syncCfg.login ? ` as ${syncCfg.login}` : ""}. Last sync: ${syncCfg.last ? new Date(syncCfg.last).toLocaleString() : "never"}` : "Not connected.");
}
let syncing = false, syncAgain = false, syncTimer;
function scheduleSync() { if (!syncCfg.gistId) return; clearTimeout(syncTimer); syncTimer = setTimeout(sync, 1500); }
async function sync() {
  if (!syncCfg.token || !syncCfg.gistId || !navigator.onLine) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true; setDot("busy");
  try {
    const gist = await gh(`/gists/${syncCfg.gistId}`);
    const file = gist.files && gist.files[GIST_FILE];
    let remote = { events: {}, monthNotes: {} };
    if (file) remote = JSON.parse(file.truncated ? await (await fetch(file.raw_url, { cache: "no-store" })).text() : file.content || "{}");
    const before = JSON.stringify([data.events, data.monthNotes]);
    mergeInto(remote);
    const payload = syncPayload();
    if (payload !== JSON.stringify({ v: 1, events: remote.events || {}, monthNotes: remote.monthNotes || {} })) {
      await gh(`/gists/${syncCfg.gistId}`, { method: "PATCH", body: JSON.stringify({ files: { [GIST_FILE]: { content: payload } } }) });
    }
    if (before !== JSON.stringify([data.events, data.monthNotes])) { persist({ sync: false }); render(); }
    syncCfg.last = now(); safeSet(SYNC_KEY, JSON.stringify(syncCfg));
    setDot("ok"); updateSyncUi();
  } catch (e) {
    setDot("err");
    updateSyncUi(e.status === 401 ? "Your token was rejected. Disconnect and paste a new one." : e.status === 404 ? "The sync gist wasn't found. Disconnect and connect again." : "Sync failed. Will retry.");
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(); }
  }
}
$("syncConnect").onclick = async () => {
  const token = $("syncToken").value.trim(); if (!token || token.startsWith("•")) return toast("Paste your token first");
  syncCfg = { token }; updateSyncUi("Connecting…"); setDot("busy");
  try {
    const user = await gh("/user"); syncCfg.login = user.login;
    let gistId = null;
    for (let page = 1; page <= 5 && !gistId; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      const hit = list.find((g) => g.files && g.files[GIST_FILE]); if (hit) gistId = hit.id;
      if (list.length < 100) break;
    }
    if (!gistId) {
      const g = await gh("/gists", { method: "POST", body: JSON.stringify({ description: "Doodle Calendar data (synced by the app)", public: false, files: { [GIST_FILE]: { content: syncPayload() } } }) });
      gistId = g.id;
    }
    syncCfg.gistId = gistId; safeSet(SYNC_KEY, JSON.stringify(syncCfg));
    $("syncToken").value = "••••••••••••";
    await sync(); toast("Sync connected");
  } catch (e) {
    syncCfg = {}; safeSet(SYNC_KEY, "{}"); setDot("err");
    updateSyncUi(e.status === 401 ? "That token didn't work. Check it has the gist permission." : "Couldn't connect. Check your internet and try again.");
  }
};
$("syncNow").onclick = () => sync();
$("syncDisconnect").onclick = () => { syncCfg = {}; safeSet(SYNC_KEY, "{}"); $("syncToken").value = ""; setDot(""); updateSyncUi(); };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sync(); refreshTodayIfNeeded(); } });
window.addEventListener("online", () => sync());
setInterval(sync, 5 * 60 * 1000);

/* ---------------- Android widget bridge ---------------- */
function pushToAndroid() {
  if (!isAndroid) return;
  try {
    window.AndroidBridge.saveData(JSON.stringify({
      events: allEvents().map(({ id, title, date, time, repeat, color }) => ({ id, title, date, time, repeat, color })),
      settings: data.settings,
    }));
  } catch (e) { console.error(e); }
}

/* ---------------- misc ---------------- */
let toastTimer;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2200);
}
let lastDay = ymd(new Date());
function refreshTodayIfNeeded() { const d = ymd(new Date()); if (d !== lastDay) { lastDay = d; render(); } }
setInterval(refreshTodayIfNeeded, 60 * 1000);

let installEvt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("installBtn").hidden = false; });
$("installBtn").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("installBtn").hidden = true; };

if (!isAndroid && "serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// open a specific date when launched from the widget (?date=YYYY-MM-DD)
const qDate = new URLSearchParams(location.search).get("date");
if (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)) { const d = parseYmd(qDate); view = { y: d.getFullYear(), m: d.getMonth() }; }

document.body.classList.add("intro");
applySettings();
render();
pushToAndroid();
if (syncCfg.gistId) { setDot("ok"); sync(); }

// test hook (used by automated checks only)
window.__dc = { occurs, mergeMaps, data: () => data };
})();
