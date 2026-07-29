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

// 呼吸パラメータ（CSS変数と対応）。JS側でも同じ値を持ち、不規則な呼吸の計算に使う
const MOOD_BREATH = {
  critical: { speed: 3.2, minScale: 0.93, maxScale: 1.06, minOpacity: 0.45, maxOpacity: 0.75 },
  normal:   { speed: 10,  minScale: 0.85, maxScale: 1.15, minOpacity: 0.4,  maxOpacity: 0.8  },
  content:  { speed: 14,  minScale: 0.9,  maxScale: 1.25, minOpacity: 0.45, maxOpacity: 0.85 }
};

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
    const isFirstMood = currentMood === null;
    currentMood = nextMood;
    document.body.setAttribute('data-mood', currentMood);
    // 初回の判定は「気づき」ではなくただの初期化なのでスキップ
    if (!isFirstMood) {
      triggerNotice();
    }
  }
}

// --- 気づき演出（状態変化時にハッと反応する）用 ---
// initPresence内で実体が設定される。それまでの呼び出しは無視。
let triggerNotice = function () {};

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
  const glowEl = document.querySelector('.core-glow');

  // --- 不規則な呼吸のための状態 ---
  // 単一のsin波ではなく、周期の違う複数の波を重ねて「うなり」を作り、
  // さらに微小なランダムノイズを足すことで機械的な規則正しさを崩す。
  const breathStartTime = performance.now();
  // ゆらぎ用のノイズ（毎フレーム小さく動かす、慣性つきランダムウォーク）
  let breathNoise = 0;
  let breathNoiseVelocity = 0;

  // --- 気づき演出（状態が変わった瞬間、ハッと反応する） ---
  triggerNotice = function () {
    if (!displayTextEl || !glowEl) return;
    displayTextEl.classList.remove('noticing');
    glowEl.classList.remove('noticing');
    // リフローを挟んでアニメーションを再トリガーできるようにする
    void displayTextEl.offsetWidth;
    displayTextEl.classList.add('noticing');
    glowEl.classList.add('noticing');
    setTimeout(() => {
      displayTextEl.classList.remove('noticing');
      glowEl.classList.remove('noticing');
    }, 1500);
  };

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

    // --- 不規則な呼吸（グローのscale/opacityを直接計算） ---
    // 気づき演出（noticing）の最中はCSS側のワンショットアニメーションに主導権を譲る
    if (glowEl && !glowEl.classList.contains('noticing')) {
      const breath = MOOD_BREATH[currentMood] || MOOD_BREATH.normal;
      const elapsed = (performance.now() - breathStartTime) / 1000;

      // 主周期 + わずかにズレた副周期を重ねて「うなり」を作る（完全な単振動を崩す）
      const mainPhase = (elapsed / breath.speed) * Math.PI * 2;
      const subPhase = (elapsed / (breath.speed * 0.63)) * Math.PI * 2;
      let wave = Math.sin(mainPhase) * 0.82 + Math.sin(subPhase) * 0.18;
      wave = Math.max(-1, Math.min(1, wave)); // -1〜1に収める

      // 慣性つきランダムウォークで微小なノイズを加える（生き物の呼吸の揺れ）
      breathNoiseVelocity += (Math.random() - 0.5) * 0.006;
      breathNoiseVelocity *= 0.96; // 減衰
      breathNoise += breathNoiseVelocity;
      breathNoise = Math.max(-0.06, Math.min(0.06, breathNoise));

      const t = (wave + 1) / 2 + breathNoise; // 0〜1程度に正規化（ノイズ分は多少はみ出す）
      const clampedT = Math.max(0, Math.min(1, t));

      const scale = breath.minScale + (breath.maxScale - breath.minScale) * clampedT;
      const opacity = breath.minOpacity + (breath.maxOpacity - breath.minOpacity) * clampedT;

      glowEl.style.transform = `scale(${scale.toFixed(4)})`;
      glowEl.style.opacity = opacity.toFixed(4);
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
    // 充電器の抜き差しはmoodが変わらないこともあるが、それ自体が「気づき」の瞬間
    triggerNotice();
  });

  trackBatteryPace();

  // ✨ 切り替え間隔を15秒から「30秒」に延長してゆったりに！
  setInterval(updateInformation, 30000);
}

initPresence();
