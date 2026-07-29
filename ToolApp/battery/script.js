// 非常に遅い補間計算 (0.005 = 超超ゆっくり目標値に近づく)
function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

let currentDisplayLevel = 0;
let targetLevel = 0;
let isPercentMode = true;

// --- 残量帯（気分）の判定 ---
// ヒステリシス付き：境界付近の細かい行き来でパタパタ切り替わらないようにする
let currentMood = null; // 'critical' | 'normal' | 'content'

function decideMood(level, prevMood) {
  // 境界にちょっとした「のりしろ」を持たせる
  if (prevMood === 'critical') {
    return level < 18 ? 'critical' : (level < 82 ? 'normal' : 'content');
  }
  if (prevMood === 'content') {
    return level > 78 ? 'content' : (level > 12 ? 'normal' : 'critical');
  }
  // normal、または初回判定
  if (level < 12) return 'critical';
  if (level > 82) return 'content';
  return 'normal';
}

function applyMood(level) {
  const nextMood = decideMood(level, currentMood);
  if (nextMood !== currentMood) {
    currentMood = nextMood;
    document.body.setAttribute('data-mood', currentMood);
  }
}

// --- 自前で計測するための変数 ---
let lastRecordedLevel = null;
let lastRecordedTime = null;
let secondsPerPercent = null;
let isFirstChange = true; // 最初の端数を捨てるためのフラグ

// --- リアルタイムカウントダウン用 ---
let estimatedTargetTimestamp = null; // ゴール（満充電または0%）の予定時刻(ミリ秒)

async function initPresence() {
  if (!('getBattery' in navigator)) {
    console.warn('Battery API is not supported in this browser.');
    return;
  }

  const battery = await navigator.getBattery();
  const displayTextEl = document.getElementById('display-text');

  // --- 緑色の吹雪（パーティクル）演出用 ---
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let particleAlpha = 0;
  let targetParticleAlpha = 0;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = canvas.height + Math.random() * 20;
      this.size = Math.random() * 2.5 + 0.5;
      this.speedY = Math.random() * 1.5 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.8;
      this.baseOpacity = Math.random() * 0.7 + 0.3;
      this.fadeSpeed = Math.random() * 0.003 + 0.001;
    }
    update() {
      this.y -= this.speedY;
      this.x += this.speedX;
      this.baseOpacity -= this.fadeSpeed;
      if (this.y < -10 || this.baseOpacity <= 0) {
        this.reset();
      }
    }
    draw(globalAlpha) {
      const finalOpacity = Math.max(0, this.baseOpacity * globalAlpha);
      if (finalOpacity <= 0) return;

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(50, 255, 180, ${finalOpacity})`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `rgba(50, 255, 180, ${finalOpacity * 0.8})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < 50; i++) {
    particles.push(new Particle());
  }

  // 初期値の取得
  targetLevel = battery.level * 100;
  currentDisplayLevel = targetLevel;
  displayTextEl.innerText = Math.round(currentDisplayLevel) + '%';
  applyMood(targetLevel);

  // 1. 描画 ＆ リアルタイム更新ループ（毎フレーム実行）
  function loop() {
    // 数字のぬるっと変化
    currentDisplayLevel = lerp(currentDisplayLevel, targetLevel, 0.005);

    // %モード表示中でモーフィング中でない場合
    if (isPercentMode && !displayTextEl.classList.contains('morphing')) {
      displayTextEl.innerText = Math.round(currentDisplayLevel) + '%';
    } 
    // 時間表示モード中でモーフィング中でない場合 ➔ リアルタイムに「残り秒数」をカウントダウン！
    else if (!isPercentMode && !displayTextEl.classList.contains('morphing')) {
      const liveTimeText = getCalculatedTimeText();
      if (liveTimeText) {
        displayTextEl.innerText = liveTimeText;
      }
    }

    // 吹雪のフェード処理
    targetParticleAlpha = battery.charging ? 1 : 0;
    particleAlpha = lerp(particleAlpha, targetParticleAlpha, 0.03);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (particleAlpha > 0.001) {
      particles.forEach(p => {
        p.update();
        p.draw(particleAlpha);
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

  // 3. バッテリー変化の計測（端数カットの正確ロジック）
  function trackBatteryPace() {
    const now = Date.now();
    const currentLevel = battery.level * 100;

    if (lastRecordedLevel !== null && lastRecordedTime !== null) {
      const diffLevel = Math.abs(currentLevel - lastRecordedLevel);
      const diffTime = (now - lastRecordedTime) / 1000;

      if (diffLevel > 0) {
        if (isFirstChange) {
          isFirstChange = false; // 最初の1回（端数）は捨てる
        } else {
          // 純粋な1%分の秒数を確定
          secondsPerPercent = diffTime / diffLevel;
        }
      }
    }

    lastRecordedLevel = currentLevel;
    lastRecordedTime = now;

    // ゴール時刻（タイムスタンプ）を再計算
    if (secondsPerPercent !== null) {
      if (battery.charging) {
        const remainingPercent = 100 - currentLevel;
        estimatedTargetTimestamp = now + (remainingPercent * secondsPerPercent * 1000);
      } else {
        const remainingPercent = currentLevel;
        estimatedTargetTimestamp = now + (remainingPercent * secondsPerPercent * 1000);
      }
    }
  }

  // 4. リアルタイムに残時間を「分・秒」で動的に計算する関数
  function getCalculatedTimeText() {
    if (!estimatedTargetTimestamp) return "";

    const now = Date.now();
    const diffMs = estimatedTargetTimestamp - now;

    if (diffMs <= 0) return "";

    const totalSeconds = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    if (battery.charging) {
      // 例: あと 12分34秒
      return `あと ${mins}分${String(secs).padStart(2, '0')}秒`;
    } else {
      // バッテリー消費時は目標時刻（例: 18:45 まで）
      const targetDate = new Date(estimatedTargetTimestamp);
      const h = String(targetDate.getHours()).padStart(2, '0');
      const m = String(targetDate.getMinutes()).padStart(2, '0');
      return `${h}:${m} まで`;
    }
  }

  // 5. 表示内容の思考・切り替えロジック
  function updateInformation() {
    targetLevel = battery.level * 100;
    applyMood(targetLevel);

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
    applyMood(targetLevel);
    trackBatteryPace();
  });

  battery.addEventListener('chargingchange', () => {
    lastRecordedLevel = null;
    lastRecordedTime = null;
    secondsPerPercent = null;
    estimatedTargetTimestamp = null;
    isFirstChange = true;
    trackBatteryPace();
    updateInformation();
  });

  trackBatteryPace();

  // ✨ 切り替え間隔を15秒から「30秒」に延長してゆったりに！
  setInterval(updateInformation, 30000);
}

initPresence();
