// ================= LOGIC GHÉP BUDDY (hàm thuần, không phụ thuộc Firebase) =================
// File này không import gì, nên chạy thử được bằng Node:  node matching.test.js
// Mô hình: mọi người đang tìm buddy nằm trong "sảnh chờ" lobby/{uid} = { room, t, tz, topic, near, claimedBy? }.
// Người vào sau (t lớn hơn) sẽ "nhận" người vào trước và chuyển sang phòng của họ -> không bao giờ có 2 người cùng nhận nhau.

export const FRESH_MS = 10 * 60 * 1000;      // bỏ qua mục cũ hơn 10 phút (phòng khi máy tắt đột ngột mà onDisconnect không chạy)
export const MAX_TZ_DIFF_MIN = 180;          // "múi giờ gần nhau" = chênh tối đa 3 giờ
export const TOPICS = ['any', 'exams', 'college', 'language', 'coding'];

const ROOM_RE = /^[\w-]{1,40}$/;             // cùng quy tắc với getRoomId() trong Timer.js

export function isValidEntry(e) {
  return !!e && typeof e === 'object'
    && typeof e.room === 'string' && ROOM_RE.test(e.room)
    && Number.isFinite(e.t) && Number.isFinite(e.tz)
    && TOPICS.includes(e.topic);
}

export const isFresh = (e, now = Date.now()) => now - e.t < FRESH_MS;

// thứ tự ưu tiên: ai vào sảnh trước thì đứng trước; bằng nhau thì so uid để luôn có kết quả giống nhau ở mọi máy
export function order(a, b) {
  if (a.t !== b.t) return a.t - b.t;
  return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
}

// hai người hợp nhau khi: cùng chủ đề (hoặc một bên chọn "any") và múi giờ đủ gần (nếu một trong hai muốn vậy)
export function compatible(a, b) {
  const topicOk = a.topic === b.topic || a.topic === 'any' || b.topic === 'any';
  const tzOk = !(a.near || b.near) || Math.abs(a.tz - b.tz) <= MAX_TZ_DIFF_MIN;
  return topicOk && tzOk;
}

// Trả về người nên NHẬN (đi vào phòng của họ), hoặc null nếu mình phải chờ người khác tới nhận mình.
export function pickToJoin(me, lobby, now = Date.now()) {
  const candidates = Object.entries(lobby || {})
    .map(([uid, e]) => ({ uid, ...e }))
    .filter((e) => e.uid !== me.uid && isValidEntry(e) && !e.claimedBy && isFresh(e, now) && compatible(me, e))
    .sort(order);
  const first = candidates[0];
  return first && order(first, me) < 0 ? first : null;
}