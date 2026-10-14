// ================= FIREBASE + ROOM (BODY DOUBLING) =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getDatabase, ref, update, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCMbxZVw1FtO40U_nQML2E8FKI2BxZaQtA",
  authDomain: "study-buddy-cac.firebaseapp.com",
  databaseURL: "https://study-buddy-cac-default-rtdb.firebaseio.com",
  projectId: "study-buddy-cac",
  storageBucket: "study-buddy-cac.firebasestorage.app",
  messagingSenderId: "193273871338",
  appId: "1:193273871338:web:7cfdc637494160225e5093",
  measurementId: "G-RP7XB7EVQJ"
};

const db = getDatabase(initializeApp(firebaseConfig));
const $ = (id) => document.getElementById(id);
// getRandomValues chạy được cả khi mở bằng http (randomUUID thì không)
const randId = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => (b % 36).toString(36)).join('');

function getRoomId() {
  // chỉ giữ ký tự an toàn: Firebase cấm . # $ [ ] / trong đường dẫn
  let id = (new URLSearchParams(location.search).get('room') || '').replace(/[^\w-]/g, '').slice(0, 40);
  if (!id) { id = randId(10); history.replaceState(null, '', `?room=${id}`); }
  return id;
}

const roomId = getRoomId();
const myUserId = 'user_' + randId(6);
const myRef = ref(db, `rooms/${roomId}/users/${myUserId}`);
let status = { mode: 'none', state: 'idle' };

// update() (không phải set) để không xoá avatar / goal đã lưu
function updateRoomStatus(mode, state) {
  status = { mode, state };
  update(myRef, { mode, state, updatedAt: Date.now() });
  window.dispatchEvent(new CustomEvent('sb:status', { detail: { mode, state } }));
}
const updateRoomAvatar = (config) => update(myRef, { avatar: config });

// Lần đầu kết nối VÀ mỗi lần mạng rớt rồi có lại: đăng ký onDisconnect + ghi lại sự hiện diện của mình
onValue(ref(db, '.info/connected'), (snap) => {
  if (!snap.val()) return;
  onDisconnect(myRef).remove();
  update(myRef, { ...status, updatedAt: Date.now(), avatar: avatarConfig });
  window.dispatchEvent(new Event('sb:online'));
});

// ===== TIMERS (tính theo đồng hồ hệ thống nên không bị lệch khi tab chạy nền) =====
function createStopwatch({ nudgeMinutes, onTick, onNudge, onStateChange }) {
  let state = 'idle', base = 0, startedAt = 0, timer = null, lastShown = -1;
  let nextNudge = nudgeMinutes * 60;
  const elapsed = () => Math.floor((base + (state === 'studying' ? Date.now() - startedAt : 0)) / 1000);
  const set = (s) => { state = s; onStateChange?.(s); };

  function tick() {
    const s = elapsed();
    if (s === lastShown) return;
    lastShown = s;
    onTick?.(s);
    if (s >= nextNudge) { onNudge?.(s); nextNudge = (Math.floor(s / (nudgeMinutes * 60)) + 1) * nudgeMinutes * 60; }
  }
  const run = () => { startedAt = Date.now(); timer = setInterval(tick, 250); };

  return {
    start() { if (state !== 'idle') return; base = 0; lastShown = -1; nextNudge = nudgeMinutes * 60; set('studying'); run(); },
    pause() { if (state !== 'studying') return; clearInterval(timer); base += Date.now() - startedAt; set('paused'); },
    resume() { if (state !== 'paused') return; set('studying'); run(); },
    reset() { clearInterval(timer); base = 0; lastShown = -1; nextNudge = nudgeMinutes * 60; set('idle'); },
    getState: () => state,
  };
}

function createPomodoro({ focusMinutes, breakMinutes, longBreakMinutes, repeatCount, nudgeMinutes = 25, onTick, onStateChange, onCycleChange, onNudge }) {
  let state = 'idle', before = null, cycle = 1, timer = null;
  let endAt = 0, remaining = 0, phaseTotal = 0, lastShown = -1;
  const nudgeSec = nudgeMinutes * 60;
  let nextNudge = nudgeSec;
  const msLeft = () => state === 'paused' ? remaining : Math.max(0, endAt - Date.now());
  const set = (s) => { state = s; onStateChange?.(s); };

  function run() {
    endAt = Date.now() + remaining;
    lastShown = Math.ceil(remaining / 1000);
    onTick?.(lastShown);
    timer = setInterval(tick, 250);
  }
  function startPhase(s, minutes) {
    set(s);
    phaseTotal = minutes * 60;
    remaining = phaseTotal * 1000;
    nextNudge = nudgeSec;
    run();
  }
  function tick() {
    const left = Math.ceil(msLeft() / 1000);
    if (left !== lastShown) { lastShown = left; onTick?.(left); }
    const done = phaseTotal - left;                       // số giây đã trôi qua trong phase này
    if (state === 'focusing' && done >= nextNudge) { onNudge?.(done); nextNudge = (Math.floor(done / nudgeSec) + 1) * nudgeSec; }
    if (msLeft() <= 0) { clearInterval(timer); advance(); }
  }
  function advance() {
    if (state === 'focusing') cycle < repeatCount ? startPhase('break', breakMinutes) : startPhase('longBreak', longBreakMinutes);
    else if (state === 'break') { onCycleChange?.(++cycle); startPhase('focusing', focusMinutes); }
    else if (state === 'longBreak') { cycle = 1; onCycleChange?.(cycle); set('idle'); }
  }

  return {
    start() { if (state !== 'idle') return; cycle = 1; onCycleChange?.(1); startPhase('focusing', focusMinutes); },
    pause() { if (state === 'idle' || state === 'paused') return; before = state; remaining = msLeft(); clearInterval(timer); set('paused'); },
    resume() { if (state !== 'paused') return; set(before); run(); },
    reset() { clearInterval(timer); remaining = 0; cycle = 1; onCycleChange?.(1); set('idle'); },
    getState: () => state,
  };
}
// ===== END TIMERS =====

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600), m = Math.floor((totalSeconds % 3600) / 60), s = totalSeconds % 60;
  return [h, m, s].map((n, i) => (i === 0 && n === 0 ? null : String(n).padStart(2, '0'))).filter(Boolean).join(':') || '00:00';
}

// ================= DOM CHUNG =================
const scene = $('scene'), overlay = $('ipadOverlay'), ipadWrapper = $('ipadWrapper');
const notifBadge = $('notifBadge'), ipadBubble = $('ipadBubble');
const autoSuggestToggle = $('autoSuggestToggle');
const pomodoroDisplay = $('pomodoroDisplay'), stopwatchDisplay = $('stopwatchDisplay');
const PHASE_LABELS = { focusing: 'Focus', break: 'Break', longBreak: 'Long Break', paused: 'Paused', idle: 'Ready' };
let pomodoro = null;

// ================= BUBBLE ĐỘNG VIÊN TRÊN IPAD =================
const BREAK_SUGGESTIONS = [
  "You've been at it for a while...maybe a quick break?",
  "Your brain called, it wants a snack break 🍪",
  "Stretch time? You've earned it.",
  "Long session! A 5-min breather could help.",
  "Eyes getting tired? Step away for a sec.👀",
];
const ENCOURAGEMENTS = [
  "You're doing great, keep going! 🔥",
  "Look at you go! Stay locked in.",
  "This is the focus we love to see.",
  "You got this, don't stop now!",
  "Big brain energy right now 🧠",
  "Future you is thanking you rn.",
];

let bubbleTimer;
function showRandomNudge() {
  const pool = autoSuggestToggle.checked && Math.random() < 0.5 ? BREAK_SUGGESTIONS : ENCOURAGEMENTS;
  ipadBubble.textContent = pool[Math.floor(Math.random() * pool.length)];
  ipadBubble.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => ipadBubble.classList.remove('show'), (10 + Math.random() * 5) * 1000);
}

// ================= MINI DISPLAY + BÀN TAY =================
function refreshMiniDisplay() {
  const pState = pomodoro?.getState(), sState = stopwatch.getState();
  let text = '00:00', phase = null;
  if (pState && pState !== 'idle') { text = pomodoroDisplay.textContent; phase = PHASE_LABELS[pState] ?? pState; }
  else if (sState === 'studying' || sState === 'paused') { text = stopwatchDisplay.textContent; phase = 'Flow'; }
  $('miniTimerDisplay').textContent = text;
  $('miniPhaseLabel').hidden = !phase;
  if (phase) $('miniPhaseLabel').textContent = phase;
}

function updateHandVisibility() {
  const active = stopwatch.getState() === 'studying' || pomodoro?.getState() === 'focusing';
  $('myHandOverlay').classList.toggle('show', active);
}

// ================= FLOW MODE =================
const stopwatch = createStopwatch({
  nudgeMinutes: 45,
  onTick: (sec) => { stopwatchDisplay.textContent = formatTime(sec); refreshMiniDisplay(); },
  onNudge: showRandomNudge,
  onStateChange: (state) => { refreshMiniDisplay(); updateRoomStatus('flow', state); updateHandVisibility(); },
});

$('btnStart').addEventListener('click', () => {
  const s = stopwatch.getState();
  if (s === 'idle') stopwatch.start(); else if (s === 'paused') stopwatch.resume();
});
$('btnStop').addEventListener('click', () => stopwatch.pause());
$('btnReset').addEventListener('click', () => { stopwatch.reset(); stopwatchDisplay.textContent = '00:00'; refreshMiniDisplay(); });

// ================= IPAD POPUP =================
ipadWrapper.addEventListener('click', () => {
  const i = ipadWrapper.getBoundingClientRect(), s = scene.getBoundingClientRect();
  $('ipadScreen').style.setProperty('--ipad-x', ((i.left + i.width / 2 - s.left) / s.width) * 100 + '%');
  $('ipadScreen').style.setProperty('--ipad-y', ((i.top + i.height / 2 - s.top) / s.height) * 100 + '%');
  overlay.classList.add('open');
  notifBadge.classList.remove('show');
});
$('btnClose').addEventListener('click', () => overlay.classList.remove('open'));
overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });

// ================= CHUYỂN TAB =================
const TAB_IDS = { flow: 'tabFlow', pomodoro: 'tabPomodoro', profile: 'tabProfile', chat: 'tabChat' };
const PANEL_IDS = { flow: 'panelFlow', pomodoro: 'panelPomodoro', profile: 'panelProfile', chat: 'panelChat', summary: 'panelSummary' };

function switchMode(mode) {
  for (const [k, id] of Object.entries(PANEL_IDS)) $(id).hidden = k !== mode;
  for (const [k, id] of Object.entries(TAB_IDS)) $(id).classList.toggle('active', k === mode);
  $('goalBar').hidden = !['flow', 'pomodoro'].includes(mode);
}
for (const [k, id] of Object.entries(TAB_IDS)) $(id).addEventListener('click', () => switchMode(k));

// ================= POMODORO MODE =================
const focusInput = $('focusMinutes'), breakInput = $('breakMinutes'), longBreakInput = $('longBreakMinutes'), repeatInput = $('repeatCount');
const pomodoroInputs = [focusInput, breakInput, longBreakInput, repeatInput];
const cycleText = (n) => `Cycle ${n} / ${Number(repeatInput.value)}`;

function syncIdleDisplay() {                          // đổi thời gian focus / số vòng khi chưa chạy -> hiển thị theo ngay
  if (pomodoro && pomodoro.getState() !== 'idle') return;
  pomodoroDisplay.textContent = formatTime(Number(focusInput.value) * 60);
  $('cycleLabel').textContent = cycleText(1);
}
focusInput.addEventListener('input', syncIdleDisplay);
repeatInput.addEventListener('input', syncIdleDisplay);

function setupPomodoro() {
  pomodoro = createPomodoro({
    focusMinutes: Number(focusInput.value),
    breakMinutes: Number(breakInput.value),
    longBreakMinutes: Number(longBreakInput.value),
    repeatCount: Number(repeatInput.value),
    onNudge: showRandomNudge,
    onTick: (sec) => { pomodoroDisplay.textContent = formatTime(sec); refreshMiniDisplay(); },
    onCycleChange: (n) => { $('cycleLabel').textContent = cycleText(n); },
    onStateChange: (state) => {
      $('phaseLabel').textContent = PHASE_LABELS[state] ?? state;
      pomodoroInputs.forEach((input) => { input.disabled = state !== 'idle'; });
      if (state === 'idle') pomodoroDisplay.textContent = formatTime(Number(focusInput.value) * 60);
      refreshMiniDisplay();
      updateRoomStatus('pomodoro', state);
      updateHandVisibility();
    },
  });
}

$('btnPomodoroStart').addEventListener('click', () => {
  const s = pomodoro?.getState() ?? 'idle';
  if (s === 'idle') { setupPomodoro(); pomodoro.start(); }
  else if (s === 'paused') pomodoro.resume();
});
$('btnPomodoroStop').addEventListener('click', () => pomodoro?.pause());
$('btnPomodoroReset').addEventListener('click', () => pomodoro?.reset());

// ================= AVATAR SYSTEM =================
// Mọi layer avatar nên export từ CÙNG một frame Figma 1000x1000 để chồng khít, không scale từng layer.
const A = (file) => 'assets/buddy/' + file.replace(/ /g, '%20');

const EXPRESSIONS = [1, 2, 3].map((n) => ({ key: `face${n}`, src: A(`face ${n}.svg`) }));
const HAIRSTYLES = [
  { key: 'hairNormal', front: A('hair front normal.svg'), back: A('hair back normal.svg') },
  { key: 'hairBoy',    front: A('hair front boy.svg'),    back: A('hair back boy.svg') },
  { key: 'hairGirl',   front: A('hair front girl.svg'),   back: A('hair back girl.svg') },
];
const OUTFITS = [
  { key: 'outfitHoodie', src: A('hoodie.svg') },
  { key: 'outfitShirt',  src: A('shirt.svg') },
];
const SKIN_URL = A('body.svg'), HOODIE_HAT_URL = A('hoodie hat.svg'), HAND_URL = A('my hand.svg');
const ARM_FILES = {
  outfitHoodie: { sleeve: A('arm hoodie sleeve.svg'), skin: A('arm hoodie skin.svg') },
  outfitShirt:  { sleeve: A('arm shirt sleeve.svg'),  skin: A('arm shirt skin.svg') },
};
const HAIR_COLORS = ['#1a1a1a', '#3d2b1f', '#6b4226', '#a8683a', '#c9922f', '#e8c88a', '#b5b5b5', '#c0392b', '#f4a6c1', '#6c9bd1'];
const OUTFIT_COLORS = ['#5a7d9a', '#c94f4f', '#4fa36a', '#e0b84f', '#2b2b2e'];
const SKIN_COLORS = ['#f4d0b0', '#e0b088', '#c98a5c', '#8a5a3a', '#5a3825'];

const idx = (v, len) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < len ? Number(v) : 0);
const pick = (v, list) => (list.includes(v) ? v : list[0]);
const normalizeAvatarConfig = (raw = {}) => ({
  hairIndex: idx(raw.hairIndex, HAIRSTYLES.length),
  outfitIndex: idx(raw.outfitIndex, OUTFITS.length),
  expressionIndex: idx(raw.expressionIndex, EXPRESSIONS.length),
  hairColor: pick(raw.hairColor, HAIR_COLORS),
  outfitColor: pick(raw.outfitColor, OUTFIT_COLORS),
  skinColor: pick(raw.skinColor, SKIN_COLORS),
  name: String(raw.name ?? '').trim().slice(0, 16),     // tên hiện trên đầu buddy
  motto: String(raw.motto ?? '').trim().slice(0, 50),   // câu động lực, hiện khi hover vào buddy
});

let avatarConfig;
try { avatarConfig = normalizeAvatarConfig(JSON.parse(localStorage.getItem('studyBuddyAvatar') || 'null') || {}); }
catch { avatarConfig = normalizeAvatarConfig(); }

// ---------- đổi màu SVG xuất từ Figma ----------
const hexToRgb = (hex) => {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  const n = parseInt(hex.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const rgbToHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const luminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function colorizeAvatarSVG(svg, target) {
  const html = svg.innerHTML;
  if (/currentColor/i.test(html)) { svg.style.color = target; return; }

  const fills = new Set();
  for (const m of html.matchAll(/fill\s*=\s*["'](#[0-9a-fA-F]{3,8})["']/gi)) {
    const v = m[1].toLowerCase();
    if (!['#fff', '#ffffff', '#000', '#000000'].includes(v)) fills.add(v);
  }
  if (!fills.size) return;

  // sắc sáng nhất -> đúng màu người dùng chọn; các sắc tối hơn giữ nguyên TỈ LỆ tối như bản gốc (da + bóng đổ)
  const shades = [...fills].map((hex) => ({ hex, lum: luminance(hexToRgb(hex)) })).sort((a, b) => b.lum - a.lum);
  const t = hexToRgb(target);
  let out = html;
  shades.forEach((c, i) => {
    const k = i === 0 ? 1 : c.lum / (shades[0].lum || 1);
    const rep = i === 0 ? target : rgbToHex({ r: t.r * k, g: t.g * k, b: t.b * k });
    out = out.replace(new RegExp(`fill="${c.hex}"`, 'gi'), `fill="${rep}"`);
  });
  svg.innerHTML = out;
}

// cache SVG: chọn tóc / màu không phải tải lại cả chục file mỗi lần
const svgCache = new Map();
function fetchSVG(url) {
  if (!svgCache.has(url)) {
    svgCache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Cannot load avatar asset: ${url}`);
      return r.text();
    }).catch((e) => { svgCache.delete(url); throw e; }));
  }
  return svgCache.get(url);
}

async function loadAvatarPart(el, url, color) {
  if (!el) return;
  el.innerHTML = '';
  if (!url) return;
  try {
    el.innerHTML = await fetchSVG(url);
    const svg = el.querySelector('svg');
    if (!svg) throw new Error(`Invalid SVG: ${url}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.display = 'block';
    svg.style.pointerEvents = 'none';
    if (color) colorizeAvatarSVG(svg, color);
  } catch (err) {
    console.warn('Avatar part failed:', err);
    el.innerHTML = '';
  }
}

const BODY_PARTS = ['hoodieHat', 'hairBack', 'skin', 'outfit', 'hairFront', 'expression']; // thứ tự = thứ tự DOM
const ARM_PARTS = ['armSleeve', 'armSkin'];

function createAvatarSlot(root) {
  if (!root) return null;
  const part = (p) => `<div class="buddy-part" data-part="${p}"></div>`;
  root.innerHTML = `<div class="avatar-canvas">
    <div class="avatar-body">${BODY_PARTS.map(part).join('')}</div>
    <div class="avatar-arms">${ARM_PARTS.map(part).join('')}</div>
  </div>`;
  return Object.fromEntries([...BODY_PARTS, ...ARM_PARTS].map((p) => [p, root.querySelector(`[data-part="${p}"]`)]));
}

async function renderAvatar(slot, config, withArms = false) {
  if (!slot) return;
  const c = normalizeAvatarConfig(config);
  const hair = HAIRSTYLES[c.hairIndex], outfit = OUTFITS[c.outfitIndex], face = EXPRESSIONS[c.expressionIndex];
  const arm = withArms ? ARM_FILES[outfit.key] : null;
  await Promise.all([
    loadAvatarPart(slot.hairBack, hair.back, c.hairColor),
    loadAvatarPart(slot.hoodieHat, outfit.key === 'outfitHoodie' ? HOODIE_HAT_URL : null, c.outfitColor),
    loadAvatarPart(slot.skin, SKIN_URL, c.skinColor),
    loadAvatarPart(slot.outfit, outfit.src, c.outfitColor),
    loadAvatarPart(slot.armSleeve, arm?.sleeve, c.outfitColor),
    loadAvatarPart(slot.armSkin, arm?.skin, c.skinColor),
    loadAvatarPart(slot.hairFront, hair.front, c.hairColor),
    loadAvatarPart(slot.expression, face.src, c.skinColor),
  ]);
}

// ---------- Profile: picker ----------
const previewSlot = () => createAvatarSlot($('avatarPreview'));
const renderAvatarPreview = () => renderAvatar(previewSlot(), avatarConfig);
const renderMyHand = () => loadAvatarPart($('myHandSlot'), HAND_URL, avatarConfig.skinColor);

function buildThumbRow(container, items, isColor, selected, onPick) {
  if (!container) return;
  container.innerHTML = '';
  items.forEach((item, i) => {
    const value = isColor ? item : i;
    const thumb = document.createElement('div');
    thumb.className = 'picker-thumb';
    if (isColor) {
      thumb.style.background = item;
      thumb.title = item;
    } else {
      fetchSVG(item.front || item.src).then((svg) => {
        thumb.innerHTML = svg;
        const el = thumb.querySelector('svg');
        el?.setAttribute('width', '100%');
        el?.setAttribute('height', '100%');
        el?.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }).catch(() => {});
    }
    if (value === selected) thumb.classList.add('selected');
    thumb.addEventListener('click', () => onPick(value));
    container.appendChild(thumb);
  });
}

const PICKERS = [   // [id, danh sách, là màu?, khoá trong avatarConfig]
  ['hairPicker', HAIRSTYLES, false, 'hairIndex'],
  ['facePicker', EXPRESSIONS, false, 'expressionIndex'],
  ['outfitPicker', OUTFITS, false, 'outfitIndex'],
  ['hairColorPicker', HAIR_COLORS, true, 'hairColor'],
  ['outfitColorPicker', OUTFIT_COLORS, true, 'outfitColor'],
  ['skinColorPicker', SKIN_COLORS, true, 'skinColor'],
];
function refreshPickers() {
  PICKERS.forEach(([id, items, isColor, key]) =>
    buildThumbRow($(id), items, isColor, avatarConfig[key], (v) => {
      avatarConfig[key] = v;
      renderAvatarPreview();
      refreshPickers();
    }));
}

$('btnSaveAvatar')?.addEventListener('click', () => {
  avatarConfig = normalizeAvatarConfig(avatarConfig);
  localStorage.setItem('studyBuddyAvatar', JSON.stringify(avatarConfig));
  updateRoomAvatar(avatarConfig);
  renderMyHand();                                    // tay đổi màu da theo avatar mới
});

// ---------- Profile: Hair / Face / Skin / Outfit ----------
const categoryTabs = document.querySelectorAll('.category-tab');
const categoryPanels = { hair: $('categoryHair'), face: $('categoryFace'), skin: $('categorySkin'), outfit: $('categoryOutfit'), name: $('categoryName') };

function switchCategory(category) {
  if (!(category in categoryPanels)) category = 'hair';
  Object.entries(categoryPanels).forEach(([key, panel]) => { if (panel) panel.hidden = key !== category; });
  categoryTabs.forEach((tab) => {
    const active = tab.dataset.category === category;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
}
categoryTabs.forEach((tab) => tab.addEventListener('click', () => switchCategory(tab.dataset.category)));
switchCategory('hair');

// ---------- Profile: tên + motto ----------
const nameInput = $('nameInput'), mottoInput = $('mottoInput');
nameInput.value = avatarConfig.name;
mottoInput.value = avatarConfig.motto;
nameInput.addEventListener('input', () => { avatarConfig.name = nameInput.value; });
mottoInput.addEventListener('input', () => { avatarConfig.motto = mottoInput.value; });

renderAvatarPreview();
refreshPickers();
renderMyHand();

// ================= AVATAR BẠN HỌC CÙNG (từ Firebase) =================
const buddySlot = createAvatarSlot($('buddySlot'));
const buddyAvatarEl = $('buddyAvatar'), buddyStatusBadge = $('buddyStatusBadge');
const buddyNameTag = $('buddyNameTag'), buddyMotto = $('buddyMotto');
function applyBuddyInfo(avatar) {                    // textContent: tên / motto là chữ người khác nhập, không bao giờ innerHTML
  const a = normalizeAvatarConfig(avatar || {});
  buddyNameTag.textContent = a.name;
  buddyMotto.textContent = a.motto;
}

const STATUS_LABELS = { studying: 'Studying', focusing: 'Focusing', break: 'On a break', longBreak: 'Long break', paused: 'Paused', idle: 'Idle', none: 'Idle' };
const ANIMATION_STATE = { studying: 'working', focusing: 'working', break: 'resting', longBreak: 'resting', paused: 'resting', idle: 'idle', none: 'idle' };

let lastBuddyAvatar = '';
onValue(ref(db, `rooms/${roomId}/users`), (snap) => {
  const other = Object.entries(snap.val() || {}).find(([id]) => id !== myUserId)?.[1];
  buddyAvatarEl.classList.toggle('show', !!other);
  $('buddyHand').classList.toggle('show', !!other && ANIMATION_STATE[other.state] === 'working'); // tay buddy chỉ hiện khi đang học
  if (!other) return;

  const json = JSON.stringify(other.avatar || null);
  if (other.avatar && json !== lastBuddyAvatar) {      // chỉ vẽ lại khi avatar thật sự đổi
    lastBuddyAvatar = json;
    renderAvatar(buddySlot, other.avatar, true);
    loadAvatarPart($('buddyHandSlot'), HAND_URL, normalizeAvatarConfig(other.avatar).skinColor);
    applyBuddyInfo(other.avatar);
  }
  buddyStatusBadge.textContent = STATUS_LABELS[other.state] ?? 'Idle';
  buddyStatusBadge.className = 'buddy-status-badge ' + (other.state || 'idle');
  buddyAvatarEl.dataset.anim = ANIMATION_STATE[other.state] ?? 'idle';
});

// ================= ĐÈN BÀN — click bật/tắt =================
$('lampWrapper').addEventListener('click', function () { this.classList.toggle('lit'); });

// ================= TUỲ BIẾN VỊ TRÍ ĐỒ VẬT TRÊN BÀN =================
const DECOR_KEY = 'studyBuddyDeskLayout';
const decorItems = document.querySelectorAll('.decor-item');
const loadLayout = () => { try { return JSON.parse(localStorage.getItem(DECOR_KEY) || '{}'); } catch { return {}; } };
const pct = (v, total) => (v / total) * 100 + '%';

const saved = loadLayout();
// Chỉnh 1 lần (v2): tay mình thấp xuống 2.5%, buddy to thêm 6% (giữ nguyên chỗ ngồi). Chỉ ảnh hưởng vị trí bạn ĐÃ lưu bằng Customize Desk.
if (!localStorage.getItem('sbLayoutV2')) {
  if (saved.myHand) saved.myHand.top += 2.5;
  const b = saved.buddy;
  if (b) {
    const k = 1.06, bottom = b.top + b.height, cx = b.left + b.width / 2;
    b.width *= k; b.height *= k; b.left = cx - b.width / 2; b.top = bottom - b.height;
  }
  localStorage.setItem(DECOR_KEY, JSON.stringify(saved));
  localStorage.setItem('sbLayoutV2', '1');
}
decorItems.forEach((item) => {
  const s = saved[item.dataset.itemId];
  if (!s) return;
  item.style.left = s.left + '%';
  item.style.top = s.top + '%';
  item.style.width = s.width + '%';
  item.style.height = s.height + '%';
});

let drag = null;
decorItems.forEach((item) => item.addEventListener('pointerdown', (e) => {
  if (!scene.classList.contains('edit-mode')) return;
  e.preventDefault();
  const r = item.getBoundingClientRect();
  drag = {
    item, sr: scene.getBoundingClientRect(), resize: e.target.classList.contains('resize-handle'),
    ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height, x0: e.clientX, y0: e.clientY,
  };
  if (drag.resize) e.stopPropagation();
}));

document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const { item, sr } = drag;
  if (drag.resize) {
    item.style.width = pct(Math.max(20, drag.w + e.clientX - drag.x0), sr.width);
    item.style.height = pct(Math.max(20, drag.h + e.clientY - drag.y0), sr.height);
  } else {
    item.style.left = pct(e.clientX - sr.left - drag.ox, sr.width);
    item.style.top = pct(e.clientY - sr.top - drag.oy, sr.height);
  }
});

document.addEventListener('pointerup', () => {
  if (!drag) return;
  const { item, sr } = drag;
  const r = item.getBoundingClientRect();            // đo lại cả 4 giá trị, kể cả khi chỉ kéo hoặc chỉ resize
  const layout = loadLayout();
  layout[item.dataset.itemId] = {
    left: ((r.left - sr.left) / sr.width) * 100, top: ((r.top - sr.top) / sr.height) * 100,
    width: (r.width / sr.width) * 100, height: (r.height / sr.height) * 100,
  };
  localStorage.setItem(DECOR_KEY, JSON.stringify(layout));
  drag = null;
});

$('btnToggleEditDesk').addEventListener('click', function () {
  scene.classList.toggle('edit-mode');
  this.classList.toggle('active');
  if (scene.classList.contains('edit-mode') && !lastBuddyAvatar) {   // chưa có buddy: hiện bản mẫu (avatar của mình) để kéo chỉnh
    renderAvatar(buddySlot, avatarConfig, true);
    applyBuddyInfo(avatarConfig);
    loadAvatarPart($('buddyHandSlot'), HAND_URL, avatarConfig.skinColor);
  }
});

export { db, roomId, myUserId, switchMode };