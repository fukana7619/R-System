// 非常に遅い補間計算 (0.005 = 超超ゆっくり目標値に近づく)
function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

let currentDisplayLevel = 0;
let targetLevel = 0;
let isPercentMode = true; // 現在「%」表示か「時間」表示か
let currentMessage = "";

async function initPresence() {
  if (!('getBattery' in navigator)) return;

  const battery = await navigator.getBattery();
  const displayTextEl = document.getElementById('display-text');

  // 初期値の取得
  targetLevel = battery.level * 100;
  currentDisplayLevel = targetLevel;

  // 1. 数値を超ゆっくり追いかけさせるアニメーションループ
  function loop() {
    // 非常に小さな割合でヌル〜〜ッと目標に近づく
    currentDisplayLevel = lerp(currentDisplayLevel, targetLevel, 0.005);

    // %モード表示中で、かつ文字が遷移中でない場合のみ数字を書き換える
    if (isPercentMode && !displayTextEl.classList.contains('morphing')) {
      displayTextEl.innerText = Math.round(currentDisplayLevel) + '%';
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 2. 文字を「溶かして」切り替える（モーフィング）関数
  function morphTo(newContent) {
    if (displayTextEl.innerText === newContent) return;

    // 一度ボカして消す
    displayTextEl.classList.add('morphing');

    // ぼけて消えたタイミング（4秒後）でテキストを差し替えて再浮上させる
    setTimeout(() => {
      displayTextEl.innerText = newContent;
      displayTextEl.classList.remove('morphing');
    }, 4000);
  }

  // 3. 表示内容の思考・切り替えロジック
  function updateInformation() {
    targetLevel = battery.level * 100;

    // 充電状態クラスの切り替え（CSS側で10秒かけて背景が変わる）
    if (battery.charging) {
      document.body.classList.add('is-charging');
    } else {
      document.body.classList.remove('is-charging');
    }

    // 表示する時間情報を生成
    let timeText = "";
    if (battery.charging && battery.chargingTime !== Infinity && battery.chargingTime > 0) {
      const mins = Math.round(battery.chargingTime / 60);
      timeText = `あと ${mins}分`;
    } else if (!battery.charging && battery.dischargingTime !== Infinity && battery.dischargingTime > 0) {
      const target = new Date(Date.now() + battery.dischargingTime * 1000);
      const h = String(target.getHours()).padStart(2, '0');
      const m = String(target.getMinutes()).padStart(2, '0');
      timeText = `${h}:${m} まで`;
    }

    // 時間情報が存在する場合、たまに%と時間を交互にモーフィング表示する
    if (timeText) {
      // モードを交互に切り替える
      isPercentMode = !isPercentMode;

      if (isPercentMode) {
        morphTo(Math.round(currentDisplayLevel) + '%');
      } else {
        morphTo(timeText);
      }
    } else {
      // 時間情報が取れないときは静かに%のみ表示
      isPercentMode = true;
      morphTo(Math.round(currentDisplayLevel) + '%');
    }
  }

  // イベント検知
  battery.addEventListener('levelchange', () => { targetLevel = battery.level * 100; });
  battery.addEventListener('chargingchange', updateInformation);
  battery.addEventListener('chargingtimechange', updateInformation);
  battery.addEventListener('dischargingtimechange', updateInformation);

  // 初期表示
  displayTextEl.innerText = Math.round(currentDisplayLevel) + '%';

  // 15秒ごとに「いつの間にか情報が切り替わっている」サイクルを回す
  setInterval(updateInformation, 15000);
}

initPresence();
