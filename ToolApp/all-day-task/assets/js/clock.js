// ==========================================
// assets/js/clock.js
// 時計・リアルタイム更新
// ==========================================

import { WEEK } from "./utils.js";

let timer = null;

export function startClock() {
  updateClock();

  timer = setInterval(updateClock, 1000);
}

export function stopClock() {
  clearInterval(timer);
}

// ----------------------------------
// 時計表示
// ----------------------------------

function updateClock() {
  const now = new Date();

  const title = `${now.getMonth() + 1}月${now.getDate()}日（${WEEK[now.getDay()]}）`;

  document.getElementById("todayDate").textContent = title;

  document.getElementById("clock").textContent = now.toLocaleTimeString(
    "ja-JP",
    {
      hour12: false,
    },
  );
}

// ----------------------------------
// 「あと○分」を毎秒更新
// ----------------------------------

export function startCountdownUpdater(render) {
  setInterval(() => {
    render();
  }, 1000);
}
