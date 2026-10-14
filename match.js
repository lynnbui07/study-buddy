// ================= FIND A BUDDY: GHÉP BẠN HỌC QUA "SẢNH CHỜ" FIREBASE =================
// Luồng:  bấm "Find a buddy" -> ghi mục của mình vào lobby/{uid} -> nghe cả sảnh.
//   - Có người vào TRƯỚC mình và hợp (chủ đề / múi giờ): khoá mục của mình, "nhận" họ bằng transaction, rồi sang phòng của họ.
//   - Chưa có ai: chờ trong phòng của mình. Người vào sau sẽ nhận mình và tự đi vào phòng này.
// Logic chọn người nằm trong matching.js (hàm thuần, có test).
import { ref, set, update, remove, onValue, onDisconnect, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { db, roomId, myUserId } from './Timer.js';
import { pickToJoin, isFresh } from './matching.js';

const $ = (id) => document.getElementById(id);
const lobbyRef = ref(db, 'lobby');
const myEntryRef = ref(db, `lobby/${myUserId}`);

let topic = 'any';
let searching = false, claiming = false;
let myEntry = null, stopLobby = null, stopRoom = null;

// ---------- giao diện ----------
const setStatus = (text) => { $('matchStatus').textContent = text; };
function render() {
  $('matchGo').hidden = searching;
  $('matchStop').hidden = !searching;
  $('matchChips').classList.toggle('disabled', searching);
  $('matchNear').disabled = searching;
  $('btnFindBuddy').classList.toggle('searching', searching);
  $('btnFindBuddy').textContent = searching ? '🔎 Looking...' : '🤝 Find a buddy';
}
const openModal = () => { $('matchOverlay').hidden = false; $('matchGo').focus(); };
const closeModal = () => { $('matchOverlay').hidden = true; $('btnFindBuddy').focus(); };

$('btnFindBuddy').addEventListener('click', openModal);
$('matchClose').addEventListener('click', closeModal);
$('matchOverlay').addEventListener('click', (e) => { if (e.target === $('matchOverlay')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('matchOverlay').hidden) closeModal(); });

$('matchChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip || searching) return;
  topic = chip.dataset.topic;
  document.querySelectorAll('#matchChips .chip').forEach((c) => c.classList.toggle('active', c === chip));
});

// ---------- bắt đầu / dừng ----------
async function start() {
  if (searching) return;
  myEntry = { room: roomId, t: Date.now(), tz: -new Date().getTimezoneOffset(), topic, near: $('matchNear').checked };
  searching = true; claiming = false;
  render();
  setStatus('Looking for a buddy... You can close this window and keep studying.');
  try {
    await set(myEntryRef, myEntry);
    onDisconnect(myEntryRef).remove();                     // đóng tab / rớt mạng thì tự rời sảnh
  } catch (err) {
    console.error('Match: cannot join lobby', err);
    searching = false; render();
    setStatus(`⚠ Could not start (${err?.code || err?.message || 'unknown'}). Check your Firebase rules.`);
    return;
  }
  stopLobby = onValue(lobbyRef, onLobby, (err) => console.error('Match: lobby read failed', err));
  stopRoom = onValue(ref(db, `rooms/${roomId}/users`), (snap) => {   // ai đó (kể cả qua link mời) đã vào phòng mình
    if (Object.keys(snap.val() || {}).some((id) => id !== myUserId)) finish('🎉 A buddy is here. Happy studying!');
  });
}

async function finish(message) {
  if (!searching) return;
  searching = false; claiming = false;
  stopLobby?.(); stopRoom?.(); stopLobby = stopRoom = null;
  try { await remove(myEntryRef); onDisconnect(myEntryRef).cancel(); } catch { /* không sao: mục sẽ hết hạn */ }
  render();
  setStatus(message);
}

// ---------- xử lý mỗi lần sảnh thay đổi ----------
function onLobby(snap) {
  if (!searching) return;
  const lobby = snap.val() || {};
  const mine = lobby[myUserId];

  if (!mine) {                                             // mục bị xoá (rớt mạng ngắn): ghi lại
    if (!claiming) set(myEntryRef, myEntry).then(() => onDisconnect(myEntryRef).remove()).catch(() => {});
    return;
  }
  if (mine.claimedBy && mine.claimedBy !== 'self') {       // có người đã nhận mình: họ đang đi vào phòng này
    finish('🎉 A buddy is joining your room...');
    return;
  }
  if (claiming) return;

  const target = pickToJoin({ uid: myUserId, ...myEntry }, lobby);
  if (target) claim(target);
}

async function claim(target) {
  claiming = true;
  try {
    // 1) khoá mục của mình, để không ai nhận mình trong lúc mình đi nhận người khác
    const lock = await runTransaction(myEntryRef, (cur) => (cur && !cur.claimedBy ? { ...cur, claimedBy: 'self' } : undefined));
    if (!lock.committed) { claiming = false; return; }     // có người nhận mình trước: mình là bên chờ

    // 2) nhận người kia
    const got = await runTransaction(ref(db, `lobby/${target.uid}`), (cur) =>
      cur && !cur.claimedBy && isFresh(cur) ? { ...cur, claimedBy: myUserId } : undefined);

    if (got.committed) {
      setStatus('🎉 Buddy found! Joining their room...');
      searching = false;
      stopLobby?.(); stopRoom?.();
      await remove(myEntryRef);
      location.href = `${location.origin}${location.pathname}?room=${encodeURIComponent(target.room)}`;
    } else {                                               // người kia vừa bị người khác nhận: mở khoá, thử lại ở lần sảnh đổi tiếp theo
      await update(myEntryRef, { claimedBy: null });
      claiming = false;
    }
  } catch (err) {
    console.error('Match: claim failed', err);
    claiming = false;
    setStatus(`⚠ Matching error (${err?.code || err?.message || 'unknown'}).`);
  }
}

$('matchGo').addEventListener('click', start);
$('matchStop').addEventListener('click', () => finish('Stopped looking. You can try again any time.'));
render();