// ================= EXTRAS: CHAT • GOAL • RECAP • AMBIENT =================
// HTML của tab Chat / goal / recap nằm sẵn trong index.html. File này chỉ lo logic.
import {
  ref, push, update, query, limitToLast, onChildAdded, onChildRemoved, onValue, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { db, roomId, myUserId, switchMode } from './Timer.js';

const $ = (id) => document.getElementById(id);
const myRef = ref(db, `rooms/${roomId}/users/${myUserId}`);
const chatRef = ref(db, `rooms/${roomId}/chat`);

const CHAT_OPEN = new Set(['idle', 'none', 'break', 'longBreak', 'paused']); // trạng thái được phép chat
const FOCUS = new Set(['studying', 'focusing']);
const MIN_SESSION_MS = 15 * 1000;                                            // phiên ngắn hơn 15 giây thì không hiện recap

const ipadOpen = () => $('ipadOverlay').classList.contains('open');
let myState = 'idle', buddyState = null, unread = 0, chatErr = '';
const canChat = () => CHAT_OPEN.has(myState);

// ---------- thông báo nhỏ trên iPad ----------
let bubbleTimer;
function notify(text) {
  $('chatDot').hidden = false;
  $('notifBadge').classList.add('show');
  $('ipadBubble').textContent = text;
  $('ipadBubble').classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => $('ipadBubble').classList.remove('show'), 8000);
}
function openChat() {
  switchMode('chat');
  unread = 0;
  renderChat();
  $('chatDot').hidden = true;
  $('notifBadge').classList.remove('show');
  $('chatLog').scrollTop = 1e9;
}
$('tabChat').addEventListener('click', openChat);

// ---------- khoá / mở chat theo trạng thái ----------
function renderChat() {
  const open = canChat();
  $('chatLocked').hidden = open;
  $('chatLocked').textContent = unread
    ? `🔒 Focus time. ${unread} message${unread > 1 ? 's' : ''} waiting for your break.`
    : '🔒 Focus time. Messages will wait for your break.';
  $('chatBody').hidden = !open;
  $('chatStatus').textContent = chatErr || (!buddyState ? 'Waiting for a buddy... share this page link to invite one.'
    : FOCUS.has(buddyState) ? 'Your buddy is focusing 🔥 They will read this on their break.'
    : ['break', 'longBreak'].includes(buddyState) ? 'Your buddy is on a break ☕'
    : 'Your buddy is here.');
}

// ---------- theo dõi phiên học (Timer.js gửi sự kiện "sb:status") ----------
let prevState = 'idle', focusSince = null, sessionMs = 0, cycles = 0, sessionMode = 'flow', recap = null;

window.addEventListener('sb:status', ({ detail: { mode, state } }) => {
  const wasOpen = canChat(), now = Date.now(), focusing = FOCUS.has(state);

  if (focusing && focusSince === null) {
    focusSince = now;
    sessionMode = mode;
    if (state === 'focusing' && prevState !== 'paused') cycles++;
  } else if (!focusing && focusSince !== null) {
    sessionMs += now - focusSince;
    focusSince = null;
  }
  prevState = myState = state;

  if (state === 'idle') {
    if (sessionMs >= MIN_SESSION_MS) finishSession();
    sessionMs = cycles = 0;
  }
  renderChat();
  if (!wasOpen && canChat() && unread) notify(`💬 ${unread} new message${unread > 1 ? 's' : ''} from your buddy`);
});

// ================= CHAT =================
const chatQ = query(chatRef, limitToLast(50));
const chatEls = new Map();
let loaded = false;

const chatFail = (what) => (err) => {                       // hiện lỗi thật ra màn hình thay vì im lặng
  console.error(`Chat ${what} failed:`, err);
  chatErr = `⚠ Chat ${what} failed (${err?.code || err?.message || 'unknown'}). Check your Firebase rules.`;
  renderChat();
};

onChildAdded(chatQ, (snap) => {
  const m = snap.val();
  if (typeof m?.text !== 'string') return;
  const el = document.createElement('div');
  el.className = 'chat-msg ' + (m.uid === myUserId ? 'me' : 'them');
  el.textContent = m.text;                                  // textContent: không bao giờ innerHTML với text người dùng
  chatEls.set(snap.key, el);
  $('chatLog').append(el);
  $('chatLog').scrollTop = 1e9;

  if (!loaded || m.uid === myUserId) return;               // lịch sử cũ hoặc tin của mình
  unread += canChat() && ipadOpen() && !$('panelChat').hidden ? 0 : 1;
  if (!canChat()) { renderChat(); return; }                 // đang focus: im lặng, báo sau
  if (!(ipadOpen() && !$('panelChat').hidden)) notify('💬 ' + m.text.slice(0, 60));
}, chatFail('read'));

// Firebase hiện tin ngay trên máy gửi, kể cả khi server từ chối. Bị từ chối thì gỡ tin "ảo" đó đi.
onChildRemoved(chatQ, (snap) => { chatEls.get(snap.key)?.remove(); chatEls.delete(snap.key); });
onValue(chatQ, () => { loaded = true; }, { onlyOnce: true });

let lastSent = 0;
function sendChat() {
  const text = $('chatInput').value.trim();
  if (!text || !canChat() || Date.now() - lastSent < 500) return;
  lastSent = Date.now();
  $('chatInput').value = '';
  push(chatRef, { uid: myUserId, text: text.slice(0, 200), ts: serverTimestamp() })
    .then(() => { chatErr = ''; renderChat(); })
    .catch(chatFail('send'));
}
$('chatSend').addEventListener('click', sendChat);
$('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// ================= GOAL =================
const goalInput = $('goalInput');
let goalTimer;
goalInput.value = localStorage.getItem('studyBuddyGoal') || '';

function pushGoal(done = false) {
  const g = goalInput.value.trim();
  localStorage.setItem('studyBuddyGoal', g);
  update(myRef, { goal: g || null, goalDone: g ? done : null });
}
goalInput.addEventListener('input', () => { clearTimeout(goalTimer); goalTimer = setTimeout(() => pushGoal(), 500); });
pushGoal();

// buddy: trạng thái + mục tiêu
onValue(ref(db, `rooms/${roomId}/users`), (snap) => {
  const other = Object.entries(snap.val() || {}).find(([id]) => id !== myUserId)?.[1];
  buddyState = other ? (other.state || 'idle') : null;
  renderChat();

  const text = other?.goal ? (other.goalDone ? '✅ ' : '🎯 ') + other.goal : '';
  $('buddyGoalLine').textContent = 'Buddy: ' + text;
  $('buddyGoalNote').textContent = text;
  $('buddyGoalLine').hidden = $('buddyGoalNote').hidden = !text;
  $('buddyGoalNote').classList.toggle('done', !!other?.goalDone);
});

// ================= RECAP CUỐI PHIÊN =================
const STATS_KEY = 'studyBuddyStats';
const getStats = () => { try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { days: {}, goalsDone: 0 }; } catch { return { days: {}, goalsDone: 0 }; } };
const saveStats = (s) => localStorage.setItem(STATS_KEY, JSON.stringify(s));
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
const fmt = (m) => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;

function streak(stats) {
  let n = 0;
  for (const d = new Date(); stats.days[dayKey(d)] > 0; d.setDate(d.getDate() - 1)) n++;
  return n;
}

function finishSession() {
  const stats = getStats(), key = dayKey();
  const minutes = Math.max(1, Math.round(sessionMs / 60000));
  stats.days[key] = (stats.days[key] || 0) + minutes;
  saveStats(stats);
  recap = { minutes, cycles, mode: sessionMode, goal: goalInput.value.trim(), today: stats.days[key], streak: streak(stats) };

  if (ipadOpen()) showRecap();
  else notify('🎉 Session done! Tap to see your recap');
}

function showRecap() {
  const x = recap;
  recap = null;
  if (!x) return;
  $('sumTime').textContent = fmt(x.minutes);
  $('sumDetail').textContent = (x.mode === 'pomodoro' ? `${x.cycles} focus round${x.cycles > 1 ? 's' : ''}` : 'Flow session') + `. Today: ${fmt(x.today)}.`;
  $('sumStreak').textContent = x.streak > 1 ? `🔥 ${x.streak}-day streak` : 'Come back tomorrow to start a streak.';
  $('sumGoal').hidden = !x.goal;
  $('sumGoalActions').hidden = false;
  $('sumGoalText').textContent = x.goal ? `Did you finish "${x.goal}"?` : '';
  switchMode('summary');
}
$('ipadWrapper').addEventListener('click', () => recap && showRecap());

$('sumDone').addEventListener('click', () => {
  const s = getStats();
  s.goalsDone = (s.goalsDone || 0) + 1;
  saveStats(s);
  pushGoal(true);                                           // buddy thấy mục tiêu được tick ✅
  $('sumGoalText').textContent = `Nice. ${s.goalsDone} goal${s.goalsDone > 1 ? 's' : ''} finished so far.`;
  $('sumGoalActions').hidden = true;
});
$('sumNotYet').addEventListener('click', () => {
  $('sumGoalText').textContent = 'Keep it for the next session.';
  $('sumGoalActions').hidden = true;
});
$('sumClose').addEventListener('click', () => switchMode('flow'));
$('sumChat').addEventListener('click', openChat);

// ================= AMBIENT: ĐÈN TỰ BẬT + TIẾNG MƯA =================
const skyEl = $('sky'), lamp = $('lampWrapper');
let lampManual = false;
lamp.addEventListener('click', () => { lampManual = true; });   // bạn tự bấm đèn thì ngừng tự động

function autoLamp() {
  if (lampManual) return;
  const { period, weather } = skyEl.dataset;
  lamp.classList.toggle('lit', ['night', 'night2', 'evening', 'dawn'].includes(period) || ['rain', 'storm', 'fog'].includes(weather));
}

// tiếng mưa tạo bằng Web Audio (không cần file âm thanh)
let actx, rainGain, soundOn = false;
const RAIN_LEVEL = { rain: 0.06, storm: 0.11 };

function ensureAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  const buf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
  buf.getChannelData(0).forEach((_, i, a) => { a[i] = Math.random() * 2 - 1; });
  const src = actx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 600;
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass';  lp.frequency.value = 7000;
  rainGain = actx.createGain(); rainGain.gain.value = 0;
  src.connect(hp).connect(lp).connect(rainGain).connect(actx.destination);
  src.start();
}

function updateRain() {
  if (!actx) return;
  const t = actx.currentTime, g = rainGain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(soundOn ? (RAIN_LEVEL[skyEl.dataset.weather] || 0) : 0, t + 1.5);
}

$('btnSound').addEventListener('click', function () {
  ensureAudio();                                            // phải bắt đầu từ một cú click (luật autoplay)
  actx.resume();
  soundOn = !soundOn;
  this.textContent = soundOn ? '🌧️ Rain sound: on' : '🔇 Rain sound: off';
  updateRain();
});

new MutationObserver(() => { autoLamp(); updateRain(); })
  .observe(skyEl, { attributes: true, attributeFilter: ['data-period', 'data-weather'] });
autoLamp();
renderChat();

// kết nối lại sau khi rớt mạng: ghi lại mục tiêu
window.addEventListener('sb:online', () => pushGoal());

// ================= COPY LINK MỜI BUDDY =================
// URL đã chứa ?room=..., ai mở link này sẽ vào đúng phòng của bạn.
$('btnCopyLink').addEventListener('click', async function () {
  const url = `${location.origin}${location.pathname}?room=${roomId}`;   // link sạch: chỉ giữ phòng, bỏ các tham số test
  try {
    await navigator.clipboard.writeText(url);
  } catch {                                    // trình duyệt chặn clipboard (vd mở bằng file://): dùng cách cũ
    const t = document.createElement('textarea');
    t.value = url;
    document.body.append(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  const old = this.textContent;
  this.textContent = '✅ Link copied!';
  this.classList.add('done');
  setTimeout(() => { this.textContent = old; this.classList.remove('done'); }, 1800);
});

// ================= ĐỒNG HỒ GIỜ THẬT TRÊN BÀN =================
// Lấy giờ của máy người dùng (new Date()), nên đúng múi giờ của họ. Định dạng 12h/24h theo thiết lập máy (locale).
function tickClock() {
  const now = new Date();
  const parts = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).split(/\s+/);   // ["7:59", "PM"] hoặc ["19:59"]
  const time = parts[0], period = parts[1] || '';
  if ($('clockTime').textContent !== time) $('clockTime').textContent = time;
  $('clockPeriod').textContent = period;
  $('clockDate').textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
tickClock();
setInterval(tickClock, 1000);   // kiểm tra mỗi giây để đổi phút đúng lúc, kể cả khi tab vừa bị treo rồi bật lại