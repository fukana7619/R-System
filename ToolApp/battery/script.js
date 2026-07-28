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

  // 吹雪全体のフェード（透明度）管理変数
  let particleAlpha = 0; // 0 = 完全透明, 1 = 完全表示
  let targetParticleAlpha = 0;

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
      this.x = Math.random() * canvas.width;
      this.y = canvas.height + Math.random() * 20;
      this.size = Math.random() * 2.5 + 0.5;
      this.speedY = Math.random() * 1.5 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.8;
      this.baseOpacity = Math.random() * 0.7 + 0.3; // 個別の基本透明度
      this.fadeSpeed = Math.random() * 0.003 + 0.001;
    }
    update() {
      this.y -= this.speedY;
      this.x += this.speedX;
      // 上昇中に少しずつ消える
      this.baseOpacity -= this.fadeSpeed;
      
      if (this.y < -10 || this.baseOpacity <= 0) {
        this.reset();
      }
    }
    draw(globalAlpha) {
      // 個別の透明度 × 全体のフェード透明度
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

  // 初期粒子を生成
  for (let i = 0; i < 50; i++) {
    particles.push(new Particle());
  }

  // 初期値の取得
  targetLevel = battery.level * 100;
  currentDisplayLevel = targetLevel;
  displayTextEl.innerText = Math.round(currentDisplayLevel) + '%';

  // 1. メインアニメーション ＆ 描画ループ
  function loop() {
    // 数字のぬるっと変化
    currentDisplayLevel = lerp(currentDisplayLevel, targetLevel, 0.005);

    if (isPercentMode && !displayTextEl.classList.contains('morphing')) {
      displayTextEl.innerText = Math.round(currentDisplayLevel) + '%';
    }

    // 充電状態に応じて吹雪全体の目標透明度を設定
    targetParticleAlpha = battery.charging ? 1 : 0;

    // ✨ 吹雪全体のフェード処理（0.03 = ゆっくりじわ〜っと切替）
    particleAlpha = lerp(particleAlpha, targetParticleAlpha, 0.03);

    // キャンバスクリア＆吹雪の描画
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 完全透明でないときだけ描画計算を行う（軽量化）
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
  
  // --- 計測用の変数を更新 ---
  let isFirstChange = true; // 最初の端数を捨てるためのフラグ
  
  // 3. バッテリー変化の計測（修正版）
  function trackBatteryPace() {
    const now = Date.now();
    const currentLevel = battery.level * 100;
  
    if (lastRecordedLevel !== null && lastRecordedTime !== null) {
      const diffLevel = Math.abs(currentLevel - lastRecordedLevel);
      const diffTime = (now - lastRecordedTime) / 1000; // 秒
  
      if (diffLevel > 0) {
        // 最初の変化（端数のタイミング）は計算に使わず、計測スタートの基準線にするだけ！
        if (isFirstChange) {
          isFirstChange = false; 
        } else {
          // 2回目の変化（例: 4% -> 5%）で初めて「純粋な1%の所要時間」として採用！
          secondsPerPercent = diffTime / diffLevel;
        }
      }
    }
  
    lastRecordedLevel = currentLevel;
    lastRecordedTime = now;
  }
  
  // プラグ抜き差し時はフラグもリセット
  battery.addEventListener('chargingchange', () => {
    lastRecordedLevel = null;
    lastRecordedTime = null;
    secondsPerPercent = null;
    isFirstChange = true; // ✨ リセット！
    trackBatteryPace();
    updateInformation();
  });

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
