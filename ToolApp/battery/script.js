// 非常に遅い補間計算 (0.005 = 超超ゆっくり目標値に近づく)
function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

let currentDisplayLevel = 0;
let targetLevel = 0;
let isPercentMode = true;

// --- 自前で計測するための変数 ---
let lastRecordedLevel = null;
let lastRecordedTime = null;
let secondsPerPercent = null;

async function initPresence() {
  if (!('getBattery' in navigator)) {
    console.warn('Battery API is not supported in this browser.');
    return;
  }

  const battery = await navigator.getBattery();
  const displayTextEl = document.getElementById('display-text');

  // --- ✨ 緑色の吹雪（パーティクル）演出用ロジック ---
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // 粒子（吹雪）クラス
  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width; // 画面の横幅どこからでも
      this.y = canvas.height + Math.random() * 20; // 画面の少し下から発生
      this.size = Math.random() * 2.5 + 0.5; // 小さな光の粒（0.5px〜3px）
      this.speedY = Math.random() * 1.5 + 0.5; // 上昇スピード
      this.speedX = (Math.random() - 0.5) * 0.8; // 左右へのわずかな揺れ（風）
      this.opacity = Math.random() * 0.7 + 0.3; // 透明度
      this.fadeSpeed = Math.random() * 0.003 + 0.001; // 徐々に消えるスピード
    }
    update() {
      this.y -= this.speedY;
      this.x += this.speedX;
      this.opacity -= this.fadeSpeed;
      // 画面上部に行くか消えたらリセット
      if (this.y < -10 || this.opacity <= 0) {
        this.reset();
      }
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      // ネオン感のある幻想的なエメラルドグリーン
      ctx.fillStyle = `rgba(50, 255, 180, ${this.opacity})`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(50, 255, 180, 0.8)";
      ctx.fill();
    }
  }

  // 初期粒子を少量作成 (50個くらいが風情があって綺麗です)
  for (let i = 0; i < 50; i++) {
    particles.push(new Particle());
  }

  // 初期値の取得
  targetLevel = battery.level * 100;
  currentDisplayLevel = targetLevel;
  displayTextEl.innerText = Math.round(currentDisplayLevel) + '%';

  // 1. 数値アニメーション ＆ パーティクル描画ループ
  function loop() {
    currentDisplayLevel = lerp(currentDisplayLevel, targetLevel, 0.005);

    if (isPercentMode && !displayTextEl.classList.contains('morphing')) {
      displayTextEl.innerText = Math.round(currentDisplayLevel) + '%';
    }

    // ✨ 充電中のみ吹雪を描画
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (battery.charging) {
      particles.forEach(p => {
        p.update();
        p.draw();
      });
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 2. モーフィング切り替え
  function morphTo(newContent) {
    if (displayTextEl.innerText === newContent) return;

    displayTextEl.classList.add('morphing');

    setTimeout(() => {
      displayTextEl.innerText = newContent;
      displayTextEl.classList.remove('morphing');
    }, 4000);
  }

  // 3. バッテリー変化の計測
  function trackBatteryPace() {
    const now = Date.now();
    const currentLevel = battery.level * 100;

    if (lastRecordedLevel !== null && lastRecordedTime !== null) {
      const diffLevel = Math.abs(currentLevel - lastRecordedLevel);
      const diffTime = (now - lastRecordedTime) / 1000;

      if (diffLevel > 0) {
        secondsPerPercent = diffTime / diffLevel;
      }
    }

    lastRecordedLevel = currentLevel;
    lastRecordedTime = now;
  }

  // 4. 計算した残り時間テキスト
  function getCalculatedTimeText() {
    if (!secondsPerPercent || lastRecordedLevel === null) return "";

    if (battery.charging) {
      const remainingPercent = 100 - lastRecordedLevel;
      const totalSecondsLeft = remainingPercent * secondsPerPercent;
      const mins = Math.round(totalSecondsLeft / 60);
      return mins > 0 ? `あと ${mins}分` : "";
    } else {
      const totalSecondsLeft = lastRecordedLevel * secondsPerPercent;
      const targetDate = new Date(Date.now() + totalSecondsLeft * 1000);
      const h = String(targetDate.getHours()).padStart(2, '0');
      const m = String(targetDate.getMinutes()).padStart(2, '0');
      return `${h}:${m} まで`;
    }
  }

  // 5. 表示内容の更新
  function updateInformation() {
    targetLevel = battery.level * 100;

    if (battery.charging) {
      document.body.classList.add('is-charging');
    } else {
      document.body.classList.remove('is-charging');
    }

    const timeText = getCalculatedTimeText();

    if (timeText) {
      isPercentMode = !isPercentMode;
      if (isPercentMode) {
        morphTo(Math.round(currentDisplayLevel) + '%');
      } else {
        morphTo(timeText);
      }
    } else {
      isPercentMode = true;
    }
  }

  // イベント検知
  battery.addEventListener('levelchange', () => { 
    targetLevel = battery.level * 100;
    trackBatteryPace();
  });

  battery.addEventListener('chargingchange', () => {
    lastRecordedLevel = null;
    lastRecordedTime = null;
    secondsPerPercent = null;
    trackBatteryPace();
    updateInformation();
  });

  trackBatteryPace();
  setInterval(updateInformation, 15000);
}

initPresence();
