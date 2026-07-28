// イージング関数 (現在値から目標値へヌルヌル近づける)
function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

let currentDisplayLevel = 0;
let targetLevel = 0;
let isAnimating = false;

async function initPresence() {
  if (!('getBattery' in navigator)) return;

  const battery = await navigator.getBattery();
  const percentEl = document.getElementById('percentage');
  const subInfoEl = document.getElementById('sub-info');

  // 初期値のセット
  targetLevel = battery.level * 100;
  currentDisplayLevel = targetLevel;
  percentEl.innerText = Math.round(currentDisplayLevel) + '%';

  // 数値をスムーズに動かすループアニメーション
  function animateNumber() {
    // 差分を埋めるように補間 (0.03 を小さくするとよりヌル〜っと遅く動く)
    currentDisplayLevel = lerp(currentDisplayLevel, targetLevel, 0.03);

    // 画面更新
    percentEl.innerText = Math.round(currentDisplayLevel) + '%';

    // まだ目標値とズレがあればアニメーション継続
    if (Math.abs(currentDisplayLevel - targetLevel) > 0.01) {
      requestAnimationFrame(animateNumber);
    } else {
      currentDisplayLevel = targetLevel;
      percentEl.innerText = Math.round(currentDisplayLevel) + '%';
      isAnimating = false;
    }
  }

  function startNumberAnimation() {
    if (!isAnimating) {
      isAnimating = true;
      requestAnimationFrame(animateNumber);
    }
  }

  function updateState() {
    // 目標の％を設定し、アニメーションを開始
    targetLevel = battery.level * 100;
    startNumberAnimation();

    // 充電中状態の切替 (CSS側で3秒かけて緩やかに変色)
    if (battery.charging) {
      document.body.classList.add('is-charging');
    } else {
      document.body.classList.remove('is-charging');
    }

    thinkAndWhisper();
  }

  // たまにそっと情報を出す（囁く）関数
  function thinkAndWhisper() {
    let message = '';

    if (battery.charging) {
      if (battery.chargingTime !== Infinity && battery.chargingTime > 0) {
        const mins = Math.round(battery.chargingTime / 60);
        message = `あと ${mins} 分ほどで満たされます`;
      }
    } else {
      if (battery.dischargingTime !== Infinity && battery.dischargingTime > 0) {
        const target = new Date(Date.now() + battery.dischargingTime * 1000);
        const h = String(target.getHours()).padStart(2, '0');
        const m = String(target.getMinutes()).padStart(2, '0');
        message = `${h}:${m} あたりまで持ちそうです`;
      }
    }

    if (message) {
      subInfoEl.innerText = message;
      subInfoEl.classList.add('visible');

      // 10秒かけて自然に消えていく
      setTimeout(() => {
        subInfoEl.classList.remove('visible');
      }, 10000);
    } else {
      subInfoEl.classList.remove('visible');
    }
  }

  // イベント検知
  battery.addEventListener('levelchange', updateState);
  battery.addEventListener('chargingchange', updateState);
  battery.addEventListener('chargingtimechange', updateState);
  battery.addEventListener('dischargingtimechange', updateState);

  updateState();

  // 定期的に状態を確認して囁きを更新
  setInterval(thinkAndWhisper, 60000);
}

initPresence();
