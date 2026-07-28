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
let secondsPerPercent = null; // 1%変化するのにかかった秒数

async function initPresence() {
  if (!('getBattery' in navigator)) {
    console.warn('Battery API is not supported in this browser.');
    return;
  }

  const battery = await navigator.getBattery();
  const displayTextEl = document.getElementById('display-text');

  // 初期値の取得
  targetLevel = battery.level * 100;
  currentDisplayLevel = targetLevel;
  displayTextEl.innerText = Math.round(currentDisplayLevel) + '%';

  // 1. 数値を超ゆっくり追いかけさせるアニメーションループ
  function loop() {
    currentDisplayLevel = lerp(currentDisplayLevel, targetLevel, 0.005);

    if (isPercentMode && !displayTextEl.classList.contains('morphing')) {
      displayTextEl.innerText = Math.round(currentDisplayLevel) + '%';
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 2. 文字を「溶かして」切り替える（モーフィング）関数
  function morphTo(newContent) {
    if (displayTextEl.innerText === newContent) return;

    displayTextEl.classList.add('morphing');

    setTimeout(() => {
      displayTextEl.innerText = newContent;
      displayTextEl.classList.remove('morphing');
    }, 4000);
  }

  // 3. バッテリー変化から「1%あたりの所要時間」を自前で計測する
  function trackBatteryPace() {
    const now = Date.now();
    const currentLevel = battery.level * 100;

    if (lastRecordedLevel !== null && lastRecordedTime !== null) {
      const diffLevel = Math.abs(currentLevel - lastRecordedLevel);
      const diffTime = (now - lastRecordedTime) / 1000; // 秒に変換

      // 実際に%が動いた時だけ計測（1%あたりの秒数を更新）
      if (diffLevel > 0) {
        secondsPerPercent = diffTime / diffLevel;
      }
    }

    lastRecordedLevel = currentLevel;
    lastRecordedTime = now;
  }

  // 4. 自前計算による残り時間テキストの生成
  function getCalculatedTimeText() {
    // まだ一度も1%の変化を観測できていない場合は空文字を返す
    if (!secondsPerPercent || lastRecordedLevel === null) return "";

    if (battery.charging) {
      // 満充電（100%）までの予測
      const remainingPercent = 100 - lastRecordedLevel;
      const totalSecondsLeft = remainingPercent * secondsPerPercent;
      const mins = Math.round(totalSecondsLeft / 60);
      return mins > 0 ? `あと ${mins}分` : "";
    } else {
      // 0%までの予測時刻
      const totalSecondsLeft = lastRecordedLevel * secondsPerPercent;
      const targetDate = new Date(Date.now() + totalSecondsLeft * 1000);
      const h = String(targetDate.getHours()).padStart(2, '0');
      const m = String(targetDate.getMinutes()).padStart(2, '0');
      return `${h}:${m} まで`;
    }
  }

  // 5. 表示内容の思考・切り替えロジック
  function updateInformation() {
    targetLevel = battery.level * 100;

    // 充電状態クラスの切り替え
    if (battery.charging) {
      document.body.classList.add('is-charging');
    } else {
      document.body.classList.remove('is-charging');
    }

    // 自前計測した時間情報を取得
    const timeText = getCalculatedTimeText();

    // 時間情報が計算できている時だけ交互に表示
    if (timeText) {
      isPercentMode = !isPercentMode;

      if (isPercentMode) {
        morphTo(Math.round(currentDisplayLevel) + '%');
      } else {
        morphTo(timeText);
      }
    } else {
      // まだ計測中の時は静かに%表示をキープ
      isPercentMode = true;
    }
  }

  // イベント検知
  battery.addEventListener('levelchange', () => { 
    targetLevel = battery.level * 100;
    trackBatteryPace(); // バッテリーが変わったら時間を計測！
  });

  // プラグ抜き差し時はペースが変わるので計測をリセット
  battery.addEventListener('chargingchange', () => {
    lastRecordedLevel = null;
    lastRecordedTime = null;
    secondsPerPercent = null;
    trackBatteryPace();
    updateInformation();
  });

  // 初期計測の開始
  trackBatteryPace();

  // 15秒ごとに表示サイクルを回す
  setInterval(updateInformation, 15000);
}

initPresence();
