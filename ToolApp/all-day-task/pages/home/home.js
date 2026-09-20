// ==========================================
// pages/home/home.js
// ==========================================

import { initDB, seedDatabase } from "../../assets/js/db.js";

import { startClock } from "../../assets/js/clock.js";

import { initTimeline, renderTimeline } from "../../assets/js/timeline.js";

import { openModal, openCreateModal } from "../../assets/js/modal.js";

// --------------------------
// 初期化
// --------------------------

await initDB();
await seedDatabase();

startClock();

initTimeline(
  document.getElementById("todayContainer"),
  document.getElementById("futureContainer"),
  openModal,
);

await renderTimeline();

// あと○分を更新
setInterval(renderTimeline, 1000);

// ＋ボタン
document.getElementById("addButton").onclick = openCreateModal;
