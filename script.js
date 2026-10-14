// ================= SKY THEO GIỜ MẶT TRỜI + THỜI TIẾT THẬT =================
const skyEl = document.getElementById('sky');
const fxEl  = document.getElementById('weatherFx');

const PERIODS = [
  { name: 'night',   start: 0,  end: 5,  top: '#0b1d3a', bottom: '#16274d' },
  { name: 'dawn',    start: 5,  end: 7,  top: '#8ec9f0', bottom: '#ffd9a8' },
  { name: 'morning', start: 7,  end: 11, top: '#8ec9f0', bottom: '#eaf6ff' },
  { name: 'noon',    start: 11, end: 16, top: '#5fb1ea', bottom: '#e8f7ff' },
  { name: 'sunset',  start: 16, end: 19, top: '#ff9a5a', bottom: '#ffd9a8' },
  { name: 'evening', start: 19, end: 21, top: '#3a4d7a', bottom: '#6a5a8c' },
  { name: 'night2',  start: 21, end: 24, top: '#0b1d3a', bottom: '#16274d' },
];
// Độ tối phòng theo giờ / theo thời tiết (lấy giá trị lớn hơn, không cộng dồn)
const TIME_DARKNESS = { night: 0.35, night2: 0.35, evening: 0.18, dawn: 0.08, sunset: 0.05, morning: 0, noon: 0 };
const WEATHER_DARKNESS = { clear: 0, cloudy: 0.06, fog: 0.1, rain: 0.15, snow: 0.05, storm: 0.28 };

let currentPeriodName = 'noon';
let currentWeatherType = 'clear';
const QS = new URLSearchParams(location.search);
// Test / quay video: thêm ?weather=rain (clear, cloudy, fog, rain, snow, storm) và/hoặc ?period=night (night, dawn, morning, noon, sunset, evening) vào link
const FORCE_WEATHER = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'].includes(QS.get('weather')) ? QS.get('weather') : null;
const FORCE_PERIOD = PERIODS.find(p => p.name === QS.get('period'))?.name || null;
let HAS_LOCATION = false;             // chỉ gọi API thời tiết khi biết vị trí thật của người dùng
let SUN = null;                       // { rise, set } tính bằng phút trong ngày. PHẢI khai báo trước updateSky()
let SKY_LAT = 0, SKY_LON = 0;

function updateAmbientDarkness() {
  const d = Math.max(TIME_DARKNESS[currentPeriodName] ?? 0, WEATHER_DARKNESS[currentWeatherType] ?? 0);
  document.documentElement.style.setProperty('--room-ambient-darkness', d);
}

const getPeriod = (hour) => PERIODS.find(p => hour >= p.start && hour < p.end) || PERIODS[0];
const toMin = (iso) => { const [h, m] = iso.slice(11, 16).split(':').map(Number); return h * 60 + m; };

function getPeriodNow() {
  if (FORCE_PERIOD) return PERIODS.find(p => p.name === FORCE_PERIOD);
  const d = new Date(), now = d.getHours() * 60 + d.getMinutes();
  if (!SUN) return getPeriod(d.getHours());          // chưa có giờ mặt trời -> dùng giờ cố định
  const { rise, set } = SUN;
  const name = now < rise - 60 ? 'night' : now < rise + 60 ? 'dawn' : now < rise + 240 ? 'morning'
             : now < set - 90 ? 'noon' : now < set + 30 ? 'sunset' : now < set + 120 ? 'evening' : 'night2';
  return PERIODS.find(p => p.name === name);
}

function updateSky() {
  const p = getPeriodNow();
  document.documentElement.style.setProperty('--sky-top', p.top);
  document.documentElement.style.setProperty('--sky-bottom', p.bottom);
  skyEl.dataset.period = currentPeriodName = p.name;
  updateAmbientDarkness();
}

function mapWeatherCode(c) {
  if (c <= 1) return 'clear';
  if (c <= 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if (c >= 95) return 'storm';
  return 'clear';
}

async function fetchWeather() {
  if (FORCE_WEATHER) return applyWeather(FORCE_WEATHER);
  if (!HAS_LOCATION) return;          // không biết vị trí: giữ trời quang + giờ cố định (không dùng toạ độ đoán)
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${SKY_LAT}&longitude=${SKY_LON}&current_weather=true&daily=sunrise,sunset&timezone=auto`;
    const { current_weather: cw, daily } = await (await fetch(url)).json();
    SUN = { rise: toMin(daily.sunrise[0]), set: toMin(daily.sunset[0]) };
    updateSky();
    applyWeather(mapWeatherCode(cw.weathercode));
  } catch (err) {
    console.warn('Không lấy được thời tiết, giữ nguyên trạng thái hiện tại', err);
  }
}

// ================= HIỆU ỨNG THỜI TIẾT =================
const CLOUD_SVG = `<svg viewBox="0 0 120 56" xmlns="http://www.w3.org/2000/svg"><g fill="#fff">
  <ellipse cx="60" cy="42" rx="56" ry="13"/><circle cx="34" cy="34" r="15"/>
  <circle cx="58" cy="24" r="21"/><circle cx="84" cy="33" r="16"/></g></svg>`;
const r = Math.random;

function spawn(cls, count, style, html = '') {
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    Object.assign(el.style, style(i));
    fxEl.appendChild(el);
  }
}

function applyWeather(type) {
  skyEl.dataset.weather = currentWeatherType = type;
  updateAmbientDarkness();
  fxEl.innerHTML = '';

  if (type === 'rain' || type === 'storm')
    spawn('drop', 35, () => ({ left: r() * 100 + '%', animationDelay: -r() * 1.2 + 's', animationDuration: 0.7 + r() * 0.5 + 's' }));
  if (type === 'snow')
    spawn('flake', 20, () => ({ left: r() * 100 + '%', animationDelay: r() * 3 + 's', animationDuration: 3 + r() * 2 + 's' }));
  if (type === 'cloudy')
    spawn('cloud', 4, (i) => ({
      top: 6 + i * 22 + r() * 6 + '%', width: 55 + r() * 35 + '%', opacity: (0.6 + r() * 0.3).toFixed(2),
      animationDuration: 40 + r() * 25 + 's', animationDelay: -r() * 60 + 's',
    }), CLOUD_SVG);
  if (type === 'fog')
    spawn('fog-band', 3, (i) => ({ top: 10 + i * 30 + '%', animationDelay: -i * 5 + 's' }));
}

// ================= KHỞI ĐỘNG =================
function initWeatherLocation() {
  applyWeather(FORCE_WEATHER || 'clear');                // luôn có trạng thái ban đầu (đèn tự bật + tiếng mưa dựa vào nó)
  if (FORCE_WEATHER || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => { SKY_LAT = pos.coords.latitude; SKY_LON = pos.coords.longitude; HAS_LOCATION = true; fetchWeather(); },
    () => {}                                             // từ chối vị trí: giữ trời quang, giờ cố định
  );
}
updateSky();
initWeatherLocation();
setInterval(updateSky, 60 * 1000);
setInterval(fetchWeather, 15 * 60 * 1000);