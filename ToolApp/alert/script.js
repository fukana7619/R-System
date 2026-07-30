let mode = 'timer';
let timerId = null;
let remainingTime = 0; 
let elapsedTime = 0;   
let alarmTargetTime = null; 

// 音声ファイル
const alertSound = new Audio('alert.wav');

const display = document.getElementById('display');
const inputTimerGroup = document.getElementById('inputTimerGroup');
const inputAlarmGroup = document.getElementById('inputAlarmGroup');
const alarmStatus = document.getElementById('alarmStatus');
const controlsArea = document.getElementById('controlsArea');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

const modeTimerBtn = document.getElementById('modeTimerBtn');
const modeSwBtn = document.getElementById('modeSwBtn');
const modeAlarmBtn = document.getElementById('modeAlarmBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function getJSTDate() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (9 * 3600000));
}

function updateDisplay() {
  if (mode === 'timer') {
    display.textContent = formatTime(remainingTime);
  } else if (mode === 'stopwatch') {
    display.textContent = formatTime(elapsedTime);
  } else if (mode === 'alarm') {
    const jstNow = getJSTDate();
    const hh = String(jstNow.getHours()).padStart(2, '0');
    const mm = String(jstNow.getMinutes()).padStart(2, '0');
    const ss = String(jstNow.getSeconds()).padStart(2, '0');
    display.textContent = `${hh}:${mm}:${ss}`;
  }
}

function triggerAlarmAction() {
  stopTimer();
  display.classList.add('time-up');
  alertSound.currentTime = 0;
  alertSound.play().catch(e => console.log('音声の再生がブロックされました:', e));
}

function clearAlarmState() {
  display.classList.remove('time-up');
  alertSound.pause();
  alertSound.currentTime = 0;
}

// === 全画面中のボタン表示制御 ===
function updateFullscreenUI() {
  if (!document.fullscreenElement) {
    // 全画面じゃない時は制限を解除
    startBtn.classList.remove('fs-hide-btn');
    stopBtn.classList.remove('fs-hide-btn');
    return;
  }

  // タイマーモードの場合
  if (mode === 'timer') {
    stopBtn.classList.add('fs-hide-btn'); // 全画面のタイマーではストップボタンは出さない
    if (timerId === null) {
      startBtn.classList.remove('fs-hide-btn'); // 止まっている時はスタートボタンを出す
    } else {
      startBtn.classList.add('fs-hide-btn'); // 押したら（動いていたら）消す
    }
  } 
  // ストップウォッチモードの場合
  else if (mode === 'stopwatch') {
    startBtn.classList.remove('fs-hide-btn');
    stopBtn.classList.remove('fs-hide-btn');
  } 
  // アラームモードの場合
  else if (mode === 'alarm') {
    startBtn.classList.add('fs-hide-btn');
    stopBtn.classList.add('fs-hide-btn');
  }
}

// === マウス動作でフェードアウト制御 ===
let fsTimeout = null;

function handleFsActivity() {
  if (!document.fullscreenElement) return;
  
  // マウスが動いたら表示
  controlsArea.classList.remove('fade-out');
  clearTimeout(fsTimeout);
  
  // 3秒後にフェードアウト
  fsTimeout = setTimeout(() => {
    if (document.fullscreenElement) {
      controlsArea.classList.add('fade-out');
    }
  }, 3000);
}

// マウス移動・タッチで反応させる
document.addEventListener('mousemove', handleFsActivity);
document.addEventListener('touchstart', handleFsActivity);

// 全画面状態が変わった時にUIを更新
document.addEventListener('fullscreenchange', () => {
  updateFullscreenUI();
  handleFsActivity(); // フェードアウトのタイマーもリセット
});

document.getElementById('setTimerBtn').addEventListener('click', () => {
  const min = parseInt(document.getElementById('inputMin').value) || 0;
  const sec = parseInt(document.getElementById('inputSec').value) || 0;
  remainingTime = min * 60 + sec;
  updateDisplay();
  clearAlarmState();
});

document.getElementById('setAlarmBtn').addEventListener('click', () => {
  const timeVal = document.getElementById('alarmTimeInput').value;
  if (!timeVal) return;
  const [targetH, targetM, targetS] = timeVal.split(':').map(Number);
  const jstNow = getJSTDate();
  const target = new Date(jstNow);
  target.setHours(targetH, targetM, targetS || 0, 0);
  if (target <= jstNow) {
    target.setDate(target.getDate() + 1);
  }
  alarmTargetTime = target;
  alarmStatus.textContent = `セット完了: ${String(targetH).padStart(2,'0')}:${String(targetM).padStart(2,'0')} (JST)`;
  clearAlarmState();
});

// スタート
startBtn.addEventListener('click', () => {
  if (timerId !== null) return;
  clearAlarmState();

  timerId = setInterval(() => {
    if (mode === 'timer') {
      if (remainingTime > 0) {
        remainingTime--;
        updateDisplay();
      } else {
        triggerAlarmAction();
      }
    } else if (mode === 'stopwatch') {
      elapsedTime++;
      updateDisplay();
    } else if (mode === 'alarm') {
      updateDisplay();
      if (alarmTargetTime) {
        const jstNow = getJSTDate();
        if (jstNow >= alarmTargetTime) {
          triggerAlarmAction();
          alarmTargetTime = null;
          alarmStatus.textContent = '';
        }
      }
    }
  }, 1000);

  updateFullscreenUI(); // 押した直後にボタン状態を更新
});

// ストップ
function stopTimer() {
  clearInterval(timerId);
  timerId = null;
  updateFullscreenUI(); // 止めた直後にボタン状態を更新
}

stopBtn.addEventListener('click', () => {
  stopTimer();
  clearAlarmState();
});

// リセット
document.getElementById('resetBtn').addEventListener('click', () => {
  stopTimer();
  clearAlarmState();
  remainingTime = 0;
  elapsedTime = 0;
  alarmTargetTime = null;
  alarmStatus.textContent = '';
  updateDisplay();
});

// モード切り替え
function switchMode(newMode) {
  stopTimer();
  clearAlarmState();
  mode = newMode;

  [modeTimerBtn, modeSwBtn, modeAlarmBtn].forEach(btn => btn.classList.remove('active'));
  inputTimerGroup.style.display = 'none';
  inputAlarmGroup.style.display = 'none';

  if (mode === 'timer') {
    modeTimerBtn.classList.add('active');
    inputTimerGroup.style.display = 'block';
  } else if (mode === 'stopwatch') {
    modeSwBtn.classList.add('active');
  } else if (mode === 'alarm') {
    modeAlarmBtn.classList.add('active');
    inputAlarmGroup.style.display = 'block';
    startBtn.click();
  }
  updateDisplay();
  updateFullscreenUI(); // モードが変わった時にボタン状態を更新
}

modeTimerBtn.addEventListener('click', () => switchMode('timer'));
modeSwBtn.addEventListener('click', () => switchMode('stopwatch'));
modeAlarmBtn.addEventListener('click', () => switchMode('alarm'));

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  }
});

// タイマー実行中に全画面を終わらせる手段として
display.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
});

// 初期化
updateDisplay();
updateFullscreenUI();