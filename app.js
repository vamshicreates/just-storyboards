import { renderPanel, ANGLES, CHARACTERS, LOCATIONS } from './engine3d.js';

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */
const ASPECTS = [
  { id: '16:9', label: '16:9', v: 16 / 9 },
  { id: '2.39:1', label: '2.39:1 Cinema', v: 2.39 },
  { id: '4:3', label: '4:3', v: 4 / 3 },
  { id: '1:1', label: '1:1', v: 1 },
  { id: '9:16', label: '9:16 Vertical', v: 9 / 16 }
];
const POSES = [{ id: 'stand', label: 'Standing' }, { id: 'sit', label: 'Sitting' }, { id: 'walk', label: 'Walking' }];
const MOODS = [
  { id: 'neutral', label: 'Neutral' }, { id: 'happy', label: 'Happy' }, { id: 'sad', label: 'Sad' },
  { id: 'surprised', label: 'Surprised' }, { id: 'angry', label: 'Angry' }
];
const THEMES = [{ id: 'paper', label: 'Paper sheet' }, { id: 'dark', label: 'Dark sheet' }];
const SHEETS = {
  paper: { bg: '#f4f0e6', card: '#fffdf8', ink: '#15151a', muted: '#6b675c', red: '#e50914', border: '#15151a' },
  dark: { bg: '#141414', card: '#1f1f1f', ink: '#ffffff', muted: '#a3a3a3', red: '#e50914', border: '#3a3a3a' }
};
const STORE_KEY = 'just-storyboards:v1';

const $ = (id) => document.getElementById(id);
const byId = (list, id) => list.find((x) => x.id === id);
const aspectOf = (id) => byId(ASPECTS, id) || ASPECTS[0];
const angleOf = (id) => byId(ANGLES, id);
const locOf = (id) => byId(LOCATIONS, id);
const charOf = (id) => byId(CHARACTERS, id);

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
const blankShot = () => ({ chars: ['girl', 'boy'], angle: 'mid', loc: 'cafe', pose: 'sit', mood: 'happy', aspect: '16:9', action: '', dialogue: '' });
let shot = blankShot();
let board = [];
let editIndex = null;
let sheetTheme = 'paper';
let title = 'Untitled storyboard';

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (Array.isArray(d.board)) board = d.board.filter((s) => s && Array.isArray(s.chars)).slice(0, 60);
    if (typeof d.title === 'string') title = d.title.slice(0, 60);
    if (d.sheetTheme && SHEETS[d.sheetTheme]) sheetTheme = d.sheetTheme;
  } catch (e) { /* storage can be unavailable */ }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ board, title, sheetTheme })); } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Thumbnails (rendered one at a time so the page stays responsive)    */
/* ------------------------------------------------------------------ */
const thumbCache = new Map();
const queue = [];
let pumping = false;
function thumbInto(img, opts, w, h) {
  const key = JSON.stringify([opts, w, h]);
  if (thumbCache.has(key)) { img.src = thumbCache.get(key); img.classList.add('on'); return; }
  queue.push({ img, opts, w, h, key });
  if (!pumping) { pumping = true; setTimeout(pump, 0); }
}
function pump() {
  const j = queue.shift();
  if (!j) { pumping = false; return; }
  try {
    const c = renderPanel(j.opts, j.w, j.h);
    const url = c.toDataURL('image/jpeg', 0.88);
    thumbCache.set(j.key, url);
    j.img.src = url; j.img.classList.add('on');
  } catch (e) { console.error(e); }
  setTimeout(pump, 0);
}

/* ------------------------------------------------------------------ */
/* Build the controls                                                  */
/* ------------------------------------------------------------------ */
function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v);
  });
  (kids || []).forEach((k) => n.append(k));
  return n;
}
function card(label, abbr, onClick, withBadge) {
  const img = el('img', { alt: '', draggable: 'false' });
  const b = el('button', { type: 'button', class: 'card', 'aria-pressed': 'false' }, [
    el('span', { class: 'ph' }, [img]),
    ...(withBadge ? [el('span', { class: 'badge', text: '1' })] : []),
    el('span', { class: 'lab' }, [el('span', { text: label }), ...(abbr ? [el('em', { text: abbr })] : [])])
  ]);
  b.addEventListener('click', onClick);
  return { b, img };
}

const charCards = {}, angleCards = {}, locCards = {};
function buildControls() {
  CHARACTERS.forEach((c) => {
    const k = card(c.label, '', () => toggleChar(c.id), true);
    charCards[c.id] = k.b; $('chars').append(k.b);
    thumbInto(k.img, { chars: [c.id], angle: 'full', loc: 'blank', pose: 'stand', mood: 'happy' }, 270, 360);
  });
  ANGLES.forEach((a) => {
    const k = card(a.label, a.abbr, () => { shot.angle = a.id; update(); });
    angleCards[a.id] = k.b; $('angles').append(k.b);
    thumbInto(k.img, { chars: ['boy', 'girl'], angle: a.id, loc: 'blank', pose: 'stand', mood: 'neutral' }, 360, 202);
  });
  LOCATIONS.forEach((l) => {
    const k = card(l.label, '', () => { shot.loc = l.id; update(); });
    locCards[l.id] = k.b; $('locs').append(k.b);
    thumbInto(k.img, { chars: [], angle: 'wide', loc: l.id, pose: 'stand', mood: 'neutral' }, 360, 202);
  });
  segment($('poses'), POSES, 'pose');
  segment($('moods'), MOODS, 'mood');
  segment($('aspects'), ASPECTS, 'aspect');
  const st = $('sheetTheme');
  THEMES.forEach((t) => {
    const b = el('button', { type: 'button', 'aria-pressed': 'false', 'data-id': t.id, text: t.label });
    b.addEventListener('click', () => { sheetTheme = t.id; syncBoardUI(); save(); });
    st.append(b);
  });

  $('action').addEventListener('input', (e) => { shot.action = e.target.value; scheduleMeta(); });
  $('dialogue').addEventListener('input', (e) => { shot.dialogue = e.target.value; scheduleMeta(); });
  $('title').addEventListener('input', (e) => { title = e.target.value; save(); });
  $('addBtn').addEventListener('click', () => commit(false));
  $('addNewBtn').addEventListener('click', () => commit(true));
  $('cancelEdit').addEventListener('click', () => { editIndex = null; shot = blankShotKeepLook(); syncInputs(); update(); renderBoard(); });
  $('dlPanel').addEventListener('click', downloadPanel);
  $('dlBoard').addEventListener('click', downloadBoard);
  $('clearBoard').addEventListener('click', () => {
    if (!board.length) return;
    if (confirm('Remove all ' + board.length + ' shots from this storyboard?')) { board = []; editIndex = null; save(); renderBoard(); update(); }
  });
}
function blankShotKeepLook() { return Object.assign(blankShot(), { chars: shot.chars.slice(), angle: shot.angle, loc: shot.loc, pose: shot.pose, mood: shot.mood, aspect: shot.aspect }); }

function segment(host, list, key) {
  list.forEach((o) => {
    const b = el('button', { type: 'button', 'aria-pressed': 'false', 'data-id': o.id, text: o.label });
    b.addEventListener('click', () => { shot[key] = o.id; update(); });
    host.append(b);
  });
}
function toggleChar(id) {
  const i = shot.chars.indexOf(id);
  if (i >= 0) shot.chars.splice(i, 1); else shot.chars.push(id);
  update();
}

/* ------------------------------------------------------------------ */
/* Sync UI with state                                                  */
/* ------------------------------------------------------------------ */
function syncInputs() {
  $('action').value = shot.action; $('dialogue').value = shot.dialogue;
}
function pressed(host, id, attr) {
  host.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr || 'data-id') === id)));
}
function syncControls() {
  CHARACTERS.forEach((c) => {
    const i = shot.chars.indexOf(c.id), b = charCards[c.id];
    b.setAttribute('aria-pressed', String(i >= 0));
    b.querySelector('.badge').textContent = i + 1;
  });
  ANGLES.forEach((a) => angleCards[a.id].setAttribute('aria-pressed', String(a.id === shot.angle)));
  LOCATIONS.forEach((l) => locCards[l.id].setAttribute('aria-pressed', String(l.id === shot.loc)));
  const car = shot.loc === 'car';
  pressed($('poses'), car ? 'sit' : shot.pose);
  $('poses').querySelectorAll('button').forEach((b) => { b.disabled = car && b.dataset.id !== 'sit'; });
  pressed($('moods'), shot.mood);
  pressed($('aspects'), shot.aspect);
  const a = angleOf(shot.angle);
  let hint = a.desc;
  if (['ecu', 'ots', 'pov'].includes(shot.angle) && shot.chars.length) hint += ' Main character: ' + charOf(shot.chars[0]).label + '.';
  if (car) hint += ' People always sit in a car.';
  $('angleHint').textContent = hint;
  $('frame').style.aspectRatio = String(aspectOf(shot.aspect).v);
}
function syncBoardUI() {
  $('title').value = title;
  $('sheetTheme').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === sheetTheme)));
}

function scheduleMeta() {
  syncMeta();
}
function syncMeta() {
  const a = angleOf(shot.angle), l = locOf(shot.loc);
  const n = editIndex != null ? editIndex + 1 : board.length + 1;
  $('shotTitle').textContent = 'Shot ' + String(n).padStart(2, '0');
  $('shotMeta').textContent = a.label + ' · ' + l.label + ' · ' + shot.chars.map((c) => charOf(c).label).join(' + ');
  $('chip').textContent = a.abbr;
  const has = shot.chars.length > 0;
  $('empty').hidden = has;
  $('addBtn').disabled = !has; $('addNewBtn').disabled = !has; $('dlPanel').disabled = !has;
  const editing = editIndex != null;
  $('editing').hidden = !editing;
  $('addBtn').textContent = editing ? 'Update shot ' + (editIndex + 1) : 'Add to board';
  $('addNewBtn').hidden = !editing;
  if (editing) $('editingText').textContent = 'Editing shot ' + (editIndex + 1) + ' on your board';
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */
let raf = 0;
function update() {
  syncControls(); syncMeta();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(drawPreview);
}
function effective(s) {
  // With nobody on set the camera just shows the location.
  return Object.assign({}, s, s.chars.length ? {} : { angle: 'wide' });
}
function drawPreview() {
  const cv = $('preview'), fr = $('frame');
  const A = aspectOf(shot.aspect).v;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = Math.round(Math.min(1600, Math.max(480, fr.clientWidth * dpr)));
  let h = Math.round(w / A);
  if (h > 1500) { h = 1500; w = Math.round(h * A); }
  try { renderPanel(effective(shot), w, h, cv); } catch (e) { console.error(e); }
}
new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawPreview); }).observe($('frame'));

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */
const clone = (s) => JSON.parse(JSON.stringify(s));
function commit(asNew) {
  if (!shot.chars.length) return;
  if (editIndex != null && !asNew) {
    board[editIndex] = clone(shot);
    toast('Shot ' + (editIndex + 1) + ' updated');
    editIndex = null;
  } else {
    board.push(clone(shot)); editIndex = null;
    toast('Added as shot ' + board.length);
  }
  shot = blankShotKeepLook(); syncInputs();
  save(); renderBoard(); update();
}

function renderBoard() {
  const host = $('shots'); host.textContent = '';
  board.forEach((s, i) => {
    const a = angleOf(s.angle) || ANGLES[0], l = locOf(s.loc) || LOCATIONS[0];
    const A = aspectOf(s.aspect).v;
    const img = el('img', { alt: 'Shot ' + (i + 1) + ': ' + a.label + ', ' + l.label });
    const thumb = el('button', { type: 'button', class: 'thumb', 'aria-label': 'Edit shot ' + (i + 1) }, [img, el('span', { class: 'num', text: String(i + 1).padStart(2, '0') })]);
    img.style.aspectRatio = String(A);
    thumb.addEventListener('click', () => edit(i));
    const mk = (txt, label, fn, dis) => { const b = el('button', { type: 'button', 'aria-label': label, title: label, text: txt }); b.disabled = !!dis; b.addEventListener('click', fn); return b; };
    const tools = el('div', { class: 'tools' }, [
      mk('←', 'Move earlier', () => move(i, -1), i === 0), mk('→', 'Move later', () => move(i, 1), i === board.length - 1),
      el('span', { class: 'sp' }),
      mk('Copy', 'Duplicate shot', () => { board.splice(i + 1, 0, clone(s)); save(); renderBoard(); update(); }),
      mk('Delete', 'Delete shot', () => { board.splice(i, 1); if (editIndex === i) editIndex = null; else if (editIndex > i) editIndex--; save(); renderBoard(); update(); })
    ]);
    const art = el('article', { class: 'shot' + (editIndex === i ? ' editing-now' : '') }, [
      thumb,
      el('div', { class: 'meta' }, [el('b', { text: a.abbr }), document.createTextNode(a.label + ' · ' + l.label)]),
      ...(s.action ? [el('p', { text: s.action })] : []),
      ...(s.dialogue ? [el('p', { class: 'dlg', text: '“' + s.dialogue + '”' })] : []),
      tools
    ]);
    host.append(art);
    thumbInto(img, effective(s), 640, Math.round(640 / A));
  });
  $('boardEmpty').hidden = board.length > 0;
  $('count').textContent = board.length ? board.length + (board.length === 1 ? ' shot' : ' shots') : '';
  $('dlBoard').disabled = board.length === 0; $('clearBoard').disabled = board.length === 0;
  syncBoardUI();
}
function move(i, d) {
  const j = i + d; if (j < 0 || j >= board.length) return;
  [board[i], board[j]] = [board[j], board[i]];
  if (editIndex === i) editIndex = j; else if (editIndex === j) editIndex = i;
  save(); renderBoard(); update();
}
function edit(i) {
  shot = clone(board[i]); editIndex = i; syncInputs(); update(); renderBoard();
  $('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ------------------------------------------------------------------ */
/* Export to PNG                                                       */
/* ------------------------------------------------------------------ */
function wrap(ctx, text, maxW) {
  const out = [];
  String(text).split(/\n/).forEach((par) => {
    let line = '';
    par.split(/\s+/).filter(Boolean).forEach((w) => {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    });
    out.push(line);
  });
  return out;
}
function layoutCard(ctx, w, s) {
  const k = w / 1000, pad = 26 * k, A = aspectOf(s.aspect).v;
  const artH = Math.round(w / A);
  ctx.font = `400 ${26 * k}px Inter, Arial, sans-serif`;
  const aLines = s.action ? wrap(ctx, s.action, w - 2 * pad) : [];
  ctx.font = `italic 400 ${26 * k}px Inter, Arial, sans-serif`;
  const dLines = s.dialogue ? wrap(ctx, '“' + s.dialogue + '”', w - 2 * pad) : [];
  const headH = 70 * k, lh = 37 * k, n = aLines.length + dLines.length;
  return { k, pad, artH, aLines, dLines, headH, lh, h: artH + headH + n * lh + (n ? 20 * k : 6 * k) + 18 * k };
}
function drawCard(ctx, x, y, w, s, index, art, th, L) {
  const { k, pad } = L;
  ctx.fillStyle = th.card; ctx.fillRect(x, y, w, L.h);
  ctx.drawImage(art, x, y, w, L.artH);
  ctx.strokeStyle = th.border; ctx.lineWidth = 4 * k; ctx.strokeRect(x, y, w, L.h);
  ctx.beginPath(); ctx.moveTo(x, y + L.artH); ctx.lineTo(x + w, y + L.artH); ctx.stroke();
  const a = angleOf(s.angle) || ANGLES[0], l = locOf(s.loc) || LOCATIONS[0];
  const by = y + L.artH + L.headH * 0.72;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = th.ink; ctx.font = `400 ${46 * k}px "Bebas Neue", Impact, "Arial Narrow", sans-serif`; ctx.textAlign = 'left';
  ctx.fillText('SHOT ' + String(index).padStart(2, '0'), x + pad, by);
  ctx.fillStyle = th.red; ctx.font = `700 ${21 * k}px Inter, Arial, sans-serif`; ctx.textAlign = 'right';
  ctx.fillText((a.label + '  ·  ' + l.label).toUpperCase(), x + w - pad, by - 4 * k);
  ctx.textAlign = 'left';
  let ty = y + L.artH + L.headH + L.lh * 0.7;
  ctx.fillStyle = th.ink; ctx.font = `400 ${26 * k}px Inter, Arial, sans-serif`;
  L.aLines.forEach((t) => { ctx.fillText(t, x + pad, ty); ty += L.lh; });
  ctx.fillStyle = th.muted; ctx.font = `italic 400 ${26 * k}px Inter, Arial, sans-serif`;
  L.dLines.forEach((t) => { ctx.fillText(t, x + pad, ty); ty += L.lh; });
}
async function fontsReady() {
  try {
    await Promise.all(['400 40px "Bebas Neue"', '400 20px Inter', '700 20px Inter', 'italic 400 20px Inter'].map((f) => document.fonts.load(f)));
  } catch (e) { /* fall back to system fonts */ }
}
function download(canvas, name) {
  canvas.toBlob((blob) => {
    if (!blob) { toast('Could not create the image'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}
const slug = (t) => (String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'storyboard');
function artFor(s, w) {
  const A = aspectOf(s.aspect).v;
  return renderPanel(effective(s), w, Math.round(w / A));
}

async function downloadPanel() {
  if (!shot.chars.length) return;
  await fontsReady();
  const th = SHEETS.paper, W = 1800, margin = 56;
  const tmp = document.createElement('canvas').getContext('2d');
  const L = layoutCard(tmp, W, shot);
  const art = artFor(shot, W);
  const cv = document.createElement('canvas');
  cv.width = W + margin * 2; cv.height = Math.round(L.h + margin * 2 + 44);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, cv.width, cv.height);
  const idx = editIndex != null ? editIndex + 1 : board.length + 1;
  drawCard(ctx, margin, margin, W, shot, idx, art, th, L);
  ctx.fillStyle = th.muted; ctx.font = '500 22px Inter, Arial, sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('Made with Just Storyboards', cv.width - margin, cv.height - 20);
  download(cv, 'just-storyboards-shot-' + String(idx).padStart(2, '0') + '.png');
}

async function downloadBoard() {
  if (!board.length) return;
  toast('Building your storyboard…');
  await fontsReady();
  await new Promise((r) => setTimeout(r, 30));
  const th = SHEETS[sheetTheme];
  const portrait = board.some((s) => aspectOf(s.aspect).v < 1);
  const cols = board.length === 1 ? 1 : (portrait || board.length > 6 ? 3 : 2);
  const cw = cols === 1 ? 1700 : cols === 2 ? 1150 : 820;
  const margin = 90, gut = 56, headH = 300, footH = 120;
  const tmp = document.createElement('canvas').getContext('2d');
  const items = board.map((s, i) => ({ s, i, L: layoutCard(tmp, cw, s) }));
  const rows = [];
  for (let r = 0; r < items.length; r += cols) rows.push(items.slice(r, r + cols));
  const rowH = rows.map((r) => Math.max.apply(null, r.map((c) => c.L.h)));
  const W = margin * 2 + cols * cw + (cols - 1) * gut;
  const H = headH + rowH.reduce((a, b) => a + b, 0) + (rows.length - 1) * gut + footH + margin;
  const scale = Math.min(1, 15000 / H, 15000 / W);
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = th.red; ctx.fillRect(margin, 92, 110, 10);
  ctx.fillStyle = th.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = '400 128px "Bebas Neue", Impact, "Arial Narrow", sans-serif';
  ctx.fillText((title || 'Untitled storyboard').toUpperCase(), margin, 218);
  ctx.fillStyle = th.muted; ctx.font = '500 28px Inter, Arial, sans-serif';
  ctx.fillText(board.length + (board.length === 1 ? ' shot' : ' shots') + '  ·  Just Storyboards', margin, 268);
  let y = headH;
  rows.forEach((row, ri) => {
    row.forEach((c, ci) => {
      const art = artFor(c.s, cw);
      drawCard(ctx, margin + ci * (cw + gut), y, cw, c.s, c.i + 1, art, th, c.L);
    });
    y += rowH[ri] + gut;
  });
  ctx.fillStyle = th.muted; ctx.font = '500 24px Inter, Arial, sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('Made with Just Storyboards', W - margin, H - 56);
  download(cv, slug(title) + '.png');
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = el('div', { class: 'toast', role: 'status', text: msg });
  document.body.append(t); setTimeout(() => t.remove(), 2200);
}

/* ------------------------------------------------------------------ */
/* Go                                                                  */
/* ------------------------------------------------------------------ */
load();
buildControls();
syncInputs();
syncBoardUI();
renderBoard();
update();
document.fonts && document.fonts.ready && document.fonts.ready.then(() => { /* fonts only affect exports */ });
