// ================= MÈO MASCOT =================
// Không import gì cả: nếu Firebase lỗi mạng thì mèo vẫn chạy.
// Nghe sự kiện "sb:status" do Timer.js phát ra: studying/focusing -> ngủ; còn lại -> thức.
(() => {
  const CAT_NAME = 'Pomo';                                   
  const cat = document.getElementById('catPet');
  const stage = document.getElementById('catStage');
  const bubble = document.getElementById('catBubble');
  const scene = document.querySelector('.scene');
  if (!cat || !stage || !bubble) return;

  const FOCUS = new Set(['studying', 'focusing']);
  const BREAK = new Set(['break', 'longBreak']);
  let state = 'idle', bubbleTimer = null, stretchTimer = null;

  const say = (text, ms = 2800) => {
    bubble.textContent = text;
    bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  window.addEventListener('sb:status', ({ detail }) => {
    const next = detail?.state || 'idle', prev = state;
    state = next;
    const asleep = FOCUS.has(next);
    cat.dataset.pose = asleep ? 'sleep' : 'awake';

    if (asleep && !FOCUS.has(prev) && prev !== 'paused') say(`Shh... ${CAT_NAME} is napping with you`);
    else if (BREAK.has(next) && FOCUS.has(prev)) {
      cat.classList.add('stretch');
      clearTimeout(stretchTimer);
      stretchTimer = setTimeout(() => cat.classList.remove('stretch'), 1700);
      say(`Break time! ${CAT_NAME} stretches 🐾`);
    }
  });

  // click vào mèo: tim + câu nói (không làm gì khi đang ở chế độ Customize Desk)
  stage.addEventListener('click', () => {
    if (scene && scene.classList.contains('edit-mode')) return;
    const heart = document.createElement('span');
    heart.className = 'cat-heart';
    heart.textContent = '💗';
    heart.style.setProperty('--hx', `${Math.round((Math.random() - 0.5) * 36)}px`);
    stage.append(heart);
    setTimeout(() => heart.remove(), 1300);

    say(FOCUS.has(state)
      ? pick(['zzz...', 'purr... purr...', `${CAT_NAME} is dreaming of fish 🐟`])
      : pick([`Meow! Ready to study?`, `${CAT_NAME} believes in you ✨`, 'Purrr...', 'Time for one more page?']), 2200);
  });
})();
