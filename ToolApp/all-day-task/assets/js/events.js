// ===========================================
// assets/js/events.js
// タイムライン描画・カード生成
// ===========================================

import { getTimeline, toggleCompleted } from "./db.js";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

let timelineElement = null;
let openModal = null;

// ------------------------------------------
// 初期化
// ------------------------------------------

export function initTimeline(element, modalCallback) {
  timelineElement = element;
  openModal = modalCallback;
}

// ------------------------------------------
// 再描画
// ------------------------------------------

export async function renderTimeline() {
  const timeline = await getTimeline(7);

  timelineElement.innerHTML = "";

  timeline.forEach((day) => {
    const section = document.createElement("section");
    section.className = "day-block";

    const title = document.createElement("h2");
    title.className = "day-title";

    const date = new Date(day.date);

    title.textContent = `${date.getMonth() + 1}月${date.getDate()}日（${WEEK[date.getDay()]}）`;

    section.appendChild(title);

    //--------------------------------------
    // 終日予定
    //--------------------------------------

    const allday = day.events.filter((e) => e.allDay && !e.completed);

    if (allday.length) {
      section.appendChild(createLabel("終日予定"));

      allday.forEach((event) => {
        section.appendChild(createCard(event));
      });
    }

    //--------------------------------------
    // 時間予定・タスク
    //--------------------------------------

    const timed = day.events.filter((e) => !e.allDay && !e.completed);

    if (timed.length) {
      section.appendChild(createLabel("時間予定"));

      timed.forEach((event) => {
        section.appendChild(createCard(event));
      });
    }

    //--------------------------------------
    // 完了済み
    //--------------------------------------

    const completed = day.events.filter((e) => e.completed);

    if (completed.length) {
      section.appendChild(createCompletedSection(completed));
    }

    timelineElement.appendChild(section);
  });
}

// ------------------------------------------
// ラベル
// ------------------------------------------

function createLabel(text) {
  const label = document.createElement("div");
  label.className = "section-label";
  label.textContent = text;

  return label;
}

// ------------------------------------------
// カード生成
// ------------------------------------------

function createCard(event) {
  const card = document.createElement("article");
  card.className = "card";

  //--------------------------------------
  // タスクなら左チェックボックス
  //--------------------------------------

  if (event.kind === "task") {
    card.classList.add("task-card");

    const row = document.createElement("div");
    row.className = "task-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";

    checkbox.checked = event.completed;

    checkbox.addEventListener("click", async (e) => {
      e.stopPropagation();

      await toggleCompleted(event.id);

      collapseCard(card);
    });

    row.appendChild(checkbox);

    const info = createInfo(event);

    row.appendChild(info);

    card.appendChild(row);
  }

  //--------------------------------------
  // 予定
  //--------------------------------------
  else {
    card.appendChild(createInfo(event));
  }

  //--------------------------------------
  // 詳細クリック
  //--------------------------------------

  card.addEventListener("click", () => {
    openModal(event);
  });

  return card;
}

// ------------------------------------------
// 情報部分
// ------------------------------------------

function createInfo(event) {
  const box = document.createElement("div");
  box.className = "card-info";

  if (event.allDay) {
    const badge = document.createElement("span");
    badge.className = "badge allday";
    badge.textContent = "終日予定";

    box.appendChild(badge);
  } else {
    const time = document.createElement("div");
    time.className = "time";

    time.textContent = `${format(event.start)}〜${format(event.end)}`;

    box.appendChild(time);
  }

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = event.title;

  const description = document.createElement("div");
  description.className = "description";
  description.textContent = event.description;

  box.appendChild(title);
  box.appendChild(description);

  return box;
}

// ------------------------------------------
// 完了済みエリア
// ------------------------------------------

function createCompletedSection(events) {
  const wrapper = document.createElement("div");
  wrapper.className = "completed-wrapper";

  const button = document.createElement("button");
  button.className = "completed-button";

  button.textContent = `完了済み ▼ (${events.length})`;

  const content = document.createElement("div");
  content.className = "completed-list hidden";

  events.forEach((event) => {
    const row = document.createElement("div");
    row.className = "completed-item";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = true;

    check.addEventListener("click", async () => {
      await toggleCompleted(event.id);

      renderTimeline();
    });

    const title = document.createElement("span");
    title.textContent = event.title;

    row.append(check, title);

    content.appendChild(row);
  });

  button.onclick = () => {
    content.classList.toggle("hidden");

    button.textContent = content.classList.contains("hidden")
      ? `完了済み ▼ (${events.length})`
      : `完了済み ▲ (${events.length})`;
  };

  wrapper.append(button, content);

  return wrapper;
}

// ------------------------------------------
// カードを畳む
// ------------------------------------------

function collapseCard(card) {
  card.classList.add("collapsing");

  setTimeout(() => {
    renderTimeline();
  }, 300);
}

// ------------------------------------------
// 時刻表示
// ------------------------------------------

function format(date) {
  return new Date(date).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
