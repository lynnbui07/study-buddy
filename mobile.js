// ================= ĐIỆN THOẠI / TABLET / BÀN PHÍM =================
// Không import gì cả. Làm 6 việc nhỏ:
//  1) theo dõi visualViewport (vùng nhìn thấy thật, co lại khi bàn phím ảo mở) -> cửa sổ iPad không bị bàn phím che
//  2) đánh dấu body.popup-open để ẩn các nút nổi khi cửa sổ iPad mở toàn màn hình
//  3) bàn phím vật lý: Esc đóng cửa sổ, Tab tới iPad / đèn / mèo và bấm Enter hoặc Space; Enter trong ô nhập thì thu bàn phím
//  4) tap vào buddy để xem motto (không có hover trên cảm ứng)
//  5) gợi ý xoay ngang trên điện thoại dọc
//  6) ô nhập được cuộn vào giữa màn hình khi bàn phím mở; body.typing để CSS thu gọn giao diện khi gõ
(() => {
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const store = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* bỏ qua */ } } };

  // 1) visualViewport
  const vv = window.visualViewport;
  function syncViewport() {
    root.style.setProperty('--vv-h', `${vv ? vv.height : window.innerHeight}px`);
    root.style.setProperty('--vv-top', `${vv ? vv.offsetTop : 0}px`);
  }
  syncViewport();
  vv?.addEventListener('resize', syncViewport);
  vv?.addEventListener('scroll', syncViewport);
  window.addEventListener('resize', syncViewport);

  // 2) popup mở -> body.popup-open
  const overlay = $('ipadOverlay');
  if (overlay) {
    const sync = () => document.body.classList.toggle('popup-open', overlay.classList.contains('open'));
    new MutationObserver(sync).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  // 3) bàn phím vật lý
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay?.classList.contains('open')) $('btnClose')?.click();
    if (e.key === 'Enter' && e.target.matches?.('.goal-bar input, .profile-input')) e.target.blur();   // thu bàn phím ảo
  });
  const makeKeyboardClickable = (el, label) => {
    if (!el) return;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });
  };
  makeKeyboardClickable($('ipadWrapper'), 'Open the timer tablet');
  makeKeyboardClickable($('lampWrapper'), 'Toggle the desk lamp');
  makeKeyboardClickable($('catStage'), 'Pet the cat');

  // 4) tap vào buddy -> hiện motto vài giây
  const zone = $('buddyHoverZone'), motto = $('buddyMotto');
  let mottoTimer;
  zone?.addEventListener('click', () => {
    motto.classList.add('tap-show');
    clearTimeout(mottoTimer);
    mottoTimer = setTimeout(() => motto.classList.remove('tap-show'), 3500);
  });

  // 5) gợi ý xoay ngang (CSS chỉ hiện ở điện thoại dọc)
  if (!store.get('sbRotateHintDismissed')) {
    const hint = document.createElement('div');
    hint.className = 'rotate-hint';
    hint.innerHTML = '<span>↻ Rotate your phone for a bigger room</span><button type="button" aria-label="Dismiss">×</button>';
    hint.querySelector('button').addEventListener('click', () => { hint.remove(); store.set('sbRotateHintDismissed', '1'); });
    document.body.append(hint);
  }

  // 6) ô nhập luôn nằm trong tầm nhìn khi bàn phím ảo mở
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!document.activeElement?.matches?.('input, textarea')) {
        document.body.classList.remove('typing');
        // trình duyệt có thể tự cuộn khung phòng khi ô nhập được focus -> trả về vị trí gốc
        document.querySelector('.scene')?.scrollTo(0, 0);
        window.scrollTo(0, 0);
      }
    }, 60);
  });
})();
