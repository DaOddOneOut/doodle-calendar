/* Doodle Calendar — works in the browser, as an installed web app, and inside the Android app. */
(() => {
"use strict";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["S","M","T","W","T","F","S"];
const ACCENTS = ["#5f93cf","#e2789a","#6aa55a","#ea86a8","#d9a33a","#2f86d0","#3576c9","#e2a10f","#bd7638","#e0731d","#c06a26","#d32f37"];
const COLORS = ["#e2789a","#2f86d0","#6aa55a","#e2a10f","#8a63c9","#d32f37"];
const STORE_KEY = "dc.data.v1";
const isAndroid = !!window.AndroidBridge;
// Safari can't show transparent WebM, so it always gets the still art.
const canAnimate = (() => {
  const ua = navigator.userAgent;
  const safari = /safari/i.test(ua) && !/chrome|chromium|crios|android|edg/i.test(ua);
  const v = document.createElement("video");
  return !safari && !!v.canPlayType && v.canPlayType('video/webm; codecs="vp9"') !== "";
})();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const now = () => Date.now();

/* ---------------- storage ---------------- */
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

const defaults = () => ({ events: {}, monthNotes: {}, settings: { artOpacity: 40, artIntro: true, mondayStart: false, artMode: "anim", frostOn: true, frost: 60, frostBlur: 6 } });
let data = (() => {
  try {
    const d = JSON.parse(safeGet(STORE_KEY));
    if (d && d.events) return { ...defaults(), ...d, settings: { ...defaults().settings, ...(d.settings || {}) } };
  } catch {}
  return defaults();
})();
try { localStorage.removeItem("dc.sync.v1"); } catch {}

function persist() {
  safeSet(STORE_KEY, JSON.stringify(data));
  pushToAndroid();
}

/* custom art lives in IndexedDB (files are too big for localStorage) */
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
const customCache = {};
/** What to show for a month: {url, video:boolean, custom:boolean} */
async function artSource(m) {
  const blob = await idb.get(m + 1);
  if (blob) {
    if (!customCache[m]) customCache[m] = URL.createObjectURL(blob);
    return { url: customCache[m], video: (blob.type || "").startsWith("video/"), custom: true };
  }
  const anim = data.settings.artMode === "anim" && canAnimate && !reducedMotion;
  return anim ? { url: `art/anim/${pad(m + 1)}.webm`, video: true, custom: false }
              : { url: `art/still/${pad(m + 1)}.webp`, video: false, custom: false };
}
function forgetCustom(m) { if (customCache[m]) { URL.revokeObjectURL(customCache[m]); delete customCache[m]; } }

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
let shownArtKey = null;

function applySettings() {
  const st = document.documentElement.style;
  st.setProperty("--art-opacity", (data.settings.artOpacity / 100).toFixed(2));
  const on = data.settings.frostOn;
  st.setProperty("--frost-a", on ? (data.settings.frost / 100 * 0.85).toFixed(3) : "0");
  st.setProperty("--frost-blur", on ? data.settings.frostBlur + "px" : "0px");
  $("frostOpacityRow").classList.toggle("off", !on);
  $("frostBlurRow").classList.toggle("off", !on);
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
function makeMedia(src) {
  return new Promise((resolve) => {
    let el;
    if (src.video) {
      el = document.createElement("video");
      Object.assign(el, { muted: true, loop: true, autoplay: true, playsInline: true, preload: "auto" });
      el.setAttribute("muted", ""); el.setAttribute("playsinline", "");
      el.src = src.url;
      const done = () => { el.play().catch(() => {}); resolve(el); };
      el.addEventListener("loadeddata", done, { once: true });
      el.addEventListener("error", () => resolve(null), { once: true });
    } else {
      el = new Image(); el.alt = ""; el.src = src.url;
      el.decode().then(() => resolve(el), () => resolve(el.complete && el.naturalWidth ? el : null));
    }
    setTimeout(() => resolve(el), 2500); // never block the calendar on a slow file
  });
}
async function showArt(m, force = false) {
  const src = await artSource(m);
  const key = `${m}|${src.url}`;
  if (key === shownArtKey && !force) return;
  shownArtKey = key;
  let media = await makeMedia(src);
  if (!media && src.video && !src.custom) media = await makeMedia({ url: `art/still/${pad(m + 1)}.webp`, video: false });
  if (shownArtKey !== key) return;

  const incoming = artBack, outgoing = artFront;
  artFront = incoming; artBack = outgoing;
  incoming.className = "art";
  incoming.replaceChildren(...(media ? [media] : []));
  outgoing.classList.remove("reveal", "flash", "settled");
  if (outgoing.firstChild) outgoing.classList.add("out");
  const old = outgoing.firstChild;
  setTimeout(() => { if (outgoing !== artFront && outgoing.firstChild === old) { if (old && old.pause) old.pause(); outgoing.replaceChildren(); } }, 900);

  clearTimeout(artTimer);
  const intro = firstArt || data.settings.artIntro;
  const cls = intro ? (firstArt ? "reveal" : "flash") : "settled";
  const wasFirst = firstArt;
  firstArt = false;
  requestAnimationFrame(() => {
    incoming.classList.add(cls);
    if (intro) {
      artTimer = setTimeout(() => {
        incoming.classList.remove("reveal", "flash"); incoming.classList.add("settled");
        document.body.classList.remove("intro");
      }, wasFirst ? 1700 : 700);
    }
  });
}

function setView(y, m, dir = 0) {
  view = { y, m };
  render(dir);
}
function go(delta) {
  let { y, m } = view;
  m += delta;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  setView(y, m, delta);
}

/* ---------------- year / month picker ---------------- */
let pick = null; // {kind:"year"|"month", base}
function openPicker(kind) {
  pick = { kind, base: kind === "year" ? view.y - 4 : view.y };
  drawPicker();
  $("backdrop").hidden = false; $("picker").hidden = false;
}
function drawPicker() {
  const t = new Date();
  if (pick.kind === "year") {
    $("pickTitle").textContent = `${pick.base} – ${pick.base + 11}`;
    $("pickGrid").innerHTML = Array.from({ length: 12 }, (_, i) => {
      const y = pick.base + i;
      return `<button data-y="${y}" class="${y === view.y ? "cur" : ""} ${y === t.getFullYear() ? "now" : ""}">${y}</button>`;
    }).join("");
  } else {
    $("pickTitle").textContent = pick.base;
    $("pickGrid").innerHTML = MONTHS.map((name, i) =>
      `<button data-m="${i}" class="${pick.base === view.y && i === view.m ? "cur" : ""} ${pick.base === t.getFullYear() && i === t.getMonth() ? "now" : ""}">${name.slice(0, 3)}</button>`).join("");
  }
}
$("yearLabel").onclick = () => openPicker("year");
$("monthLabel").onclick = () => openPicker("month");
$("pickPrev").onclick = () => { pick.base -= pick.kind === "year" ? 12 : 1; drawPicker(); };
$("pickNext").onclick = () => { pick.base += pick.kind === "year" ? 12 : 1; drawPicker(); };
$("pickGrid").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const before = view.y * 12 + view.m;
  if (b.dataset.y) { const y = +b.dataset.y; closeSheets(); setView(y, view.m, Math.sign(y * 12 + view.m - before)); }
  else { const m = +b.dataset.m; closeSheets(); setView(pick.base, m, Math.sign(pick.base * 12 + m - before)); }
};

/* ---------------- day sheet ---------------- */
let formColor = COLORS[0];
function openSheet(el) { $("backdrop").hidden = false; el.hidden = false; }
function closeSheets() {
  const hadDay = !$("daySheet").hidden;
  $("backdrop").hidden = true; $("daySheet").hidden = true; $("settingsSheet").hidden = true; $("picker").hidden = true;
  if (hadDay) { selected = null; render(); }
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
  const id = $("evId").value; if (!data.events[id]) return;
  delete data.events[id];
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
$("todayBtn").onclick = () => { const t = new Date(); const d = (t.getFullYear() - view.y) * 12 + t.getMonth() - view.m; setView(t.getFullYear(), t.getMonth(), Math.sign(d)); };
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
function paintArtMode() {
  for (const b of $("artMode").querySelectorAll("button")) {
    const on = b.dataset.mode === data.settings.artMode;
    b.classList.toggle("on", on); b.setAttribute("aria-checked", on);
  }
}
async function paintArtMonthState() {
  const blob = await idb.get(view.m + 1);
  $("artMonthState").textContent = blob ? "Using your own art for this month." : "Using the original art.";
  $("artResetBtn").hidden = !blob;
}
$("settingsBtn").onclick = () => {
  $("artOpacity").value = data.settings.artOpacity;
  $("frost").value = data.settings.frost;
  $("frostOn").checked = data.settings.frostOn;
  $("frostBlur").value = data.settings.frostBlur;
  $("artIntro").checked = data.settings.artIntro;
  $("mondayStart").checked = data.settings.mondayStart;
  paintArtMode(); paintArtMonthState();
  openSheet($("settingsSheet"));
};
$("settingsClose").onclick = closeSheets;
$("settingsX").onclick = closeSheets;
$("artMode").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  data.settings.artMode = b.dataset.mode; persist(); paintArtMode();
  if (b.dataset.mode === "anim" && !canAnimate) toast("This browser can't play the animations, so it shows the still art");
  showArt(view.m);
};
$("artOpacity").oninput = (e) => { data.settings.artOpacity = +e.target.value; applySettings(); };
$("artOpacity").onchange = () => persist();
$("frost").oninput = (e) => { data.settings.frost = +e.target.value; applySettings(); };
$("frost").onchange = () => persist();
$("frostBlur").oninput = (e) => { data.settings.frostBlur = +e.target.value; applySettings(); };
$("frostBlur").onchange = () => persist();
$("frostOn").onchange = (e) => { data.settings.frostOn = e.target.checked; applySettings(); persist(); };
$("artIntro").onchange = (e) => { data.settings.artIntro = e.target.checked; persist(); };
$("mondayStart").onchange = (e) => { data.settings.mondayStart = e.target.checked; persist(); render(); };

$("artUploadBtn").onclick = () => $("artFile").click();
$("artFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const m = view.m;
  try {
    const animated = f.type.startsWith("video/") || f.type === "image/gif" || (f.type === "image/webp" && await isAnimatedWebp(f));
    const blob = animated ? f : await prepareArt(f, $("artCutout").checked);
    await idb.set(m + 1, blob);
    forgetCustom(m);
    if (isAndroid) window.AndroidBridge.setArt(m + 1, await stillFrameDataUrl(blob));
    showArt(m, true); paintArtMonthState(); toast(`${MONTHS[m]} art updated`);
  } catch (err) { toast("Couldn't use that file"); console.error(err); }
};
$("artResetBtn").onclick = async () => {
  const m = view.m; await idb.del(m + 1); forgetCustom(m);
  if (isAndroid) window.AndroidBridge.clearArt(m + 1);
  showArt(m, true); paintArtMonthState(); toast("Original art restored");
};

async function isAnimatedWebp(file) {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const s = String.fromCharCode(...head);
  return s.includes("ANIM") || (s.includes("VP8X") && (head[20] & 0x02) !== 0);
}
/* resize a still upload and (optionally) knock out the white paper around it */
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
/* the Android widget can't animate, so it gets the first frame as a PNG */
async function stillFrameDataUrl(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const media = await makeMedia({ url, video: (blob.type || "").startsWith("video/") });
    const w = media.videoWidth || media.naturalWidth, h = media.videoHeight || media.naturalHeight;
    const s = Math.min(1, 800 / Math.max(w, h));
    const c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext("2d").drawImage(media, 0, 0, c.width, c.height);
    if (media.pause) media.pause();
    return c.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

$("exportBtn").onclick = () => {
  const json = JSON.stringify({ v: 1, events: data.events, monthNotes: data.monthNotes }, null, 2);
  if (isAndroid) { window.AndroidBridge.saveFile(`doodle-calendar-backup-${ymd(new Date())}.json`, json); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = `doodle-calendar-backup-${ymd(new Date())}.json`; a.click();
};
$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const incoming = JSON.parse(await f.text());
    if (!incoming.events) throw new Error("not a backup");
    for (const [k, v] of Object.entries(incoming.events)) if (!v.deleted) data.events[k] = v;
    for (const [k, v] of Object.entries(incoming.monthNotes || {})) {
      if (!data.monthNotes[k] || (v.updatedAt || 0) > (data.monthNotes[k].updatedAt || 0)) data.monthNotes[k] = v;
    }
    persist(); render(); toast("Backup imported");
  } catch { toast("That file isn't a calendar backup"); }
};

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
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2400);
}
let lastDay = ymd(new Date());
function refreshTodayIfNeeded() { const d = ymd(new Date()); if (d !== lastDay) { lastDay = d; render(); } }
setInterval(refreshTodayIfNeeded, 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  refreshTodayIfNeeded();
  const v = artFront.querySelector("video"); if (v) v.play().catch(() => {});
});

let installEvt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("installBtn").hidden = false; });
$("installBtn").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("installBtn").hidden = true; };

if (!isAndroid && "serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// open a specific month when launched from the widget (?date=YYYY-MM-DD)
const qDate = new URLSearchParams(location.search).get("date");
if (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)) { const d = parseYmd(qDate); view = { y: d.getFullYear(), m: d.getMonth() }; }

document.body.classList.add("intro");
applySettings();
render();
pushToAndroid();

// test hook (used by automated checks only)
window.__dc = { occurs, data: () => data, canAnimate };
})();
