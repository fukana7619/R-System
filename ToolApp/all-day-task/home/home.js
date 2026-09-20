import { initDB, seedDatabase } from "../assets/js/db.js";

import { initTimeline, renderTimeline } from "../assets/js/events.js";

import { openModal, openCreateModal } from "../assets/js/modal.js";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

// 時計
function updateClock() {
  const now = new Date();

  document.getElementById("todayDate").textContent =
    `${now.getMonth() + 1}月${now.getDate()}日（${WEEK[now.getDay()]}）`;

  document.getElementById("clock").textContent = now.toLocaleTimeString(
    "ja-JP",
    {
      hour12: false,
    },
  );
}

updateClock();
setInterval(updateClock, 1000);

// DB初期化
await initDB();
await seedDatabase();

// タイムライン
initTimeline(document.getElementById("timeline"), openModal);

await renderTimeline();

// 追加ボタン
addButton.onclick = () => {
  openCreateModal();
};
