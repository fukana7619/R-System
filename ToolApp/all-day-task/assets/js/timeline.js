// ==========================================
// Routine Timeline
// assets/js/timeline.js
// 今日カード・未来30日表示
// ==========================================

import { getTimeline, markAsRead } from "./db.js";

import { formatDay, formatTime, getCountdown, hasStarted } from "./utils.js";

let todayContainer;
let futureContainer;
let openModal;

// ------------------------------------------
// 初期化
// ------------------------------------------

export function initTimeline(todayEl, futureEl, modalCallback) {
  todayContainer = todayEl;
  futureContainer = futureEl;
  openModal = modalCallback;
}

// ------------------------------------------
// 全体描画
// ------------------------------------------

export async function renderTimeline() {
  const timeline = await getTimeline();

  renderToday(timeline[0]);

  // 今日を飛ばす
  renderFuture(timeline.slice(1));
}

// ==========================================
// 今日カード
// ==========================================

function renderToday(day) {
  todayContainer.innerHTML = "";

  const wrapper = document.createElement("section");
  wrapper.className = "today-card";

  wrapper.innerHTML = `
        <div class="today-title">TODAY</div>
    `;

  // -----------------------
  // 次の予定
  // -----------------------

  const timedEvents = day.events.filter((e) => !e.allDay);
  const nextEvent = timedEvents[0] ?? null;

  if (nextEvent) {
    wrapper.appendChild(createNextCard(nextEvent));
  }

  // -----------------------
  // 終日予定
  // -----------------------

  const allDay = day.events.filter((e) => e.allDay);

  if (allDay.length) {
    const title = document.createElement("h3");
    title.className = "today-section-title";
    title.textContent = "終日予定";

    wrapper.appendChild(title);

    allDay.forEach((event) => {
      wrapper.appendChild(createCard(event, true));
    });
  }

  // -----------------------
  // 時間予定
  // -----------------------

  const timed = day.events.filter((e) => !e.allDay);

  if (timed.length) {
    const title = document.createElement("h3");
    title.className = "today-section-title";
    title.textContent = "時間予定";

    wrapper.appendChild(title);

    timed.forEach((event) => {
      wrapper.appendChild(createCard(event, true));
    });
  }

  // -----------------------
  // 空
  // -----------------------

  if (day.events.length === 0) {
    wrapper.appendChild(createEmpty());
  }

  todayContainer.appendChild(wrapper);
}

// ==========================================
// 明日以降
// ==========================================

function renderFuture(days) {
  futureContainer.innerHTML = "";

  days.forEach((day) => {
    const section = document.createElement("section");
    section.className = "day-block";

    const title = document.createElement("h2");
    title.className = "day-title";
    title.textContent = formatDay(day.date);

    section.appendChild(title);

    if (day.events.length === 0) {
      section.appendChild(createEmpty());
    } else {
      const allDay = day.events.filter((e) => e.allDay);

      const timed = day.events.filter((e) => !e.allDay);

      if (allDay.length) {
        const label = document.createElement("div");
        label.className = "section-label";
        label.textContent = "終日予定";

        section.appendChild(label);

        allDay.forEach((event) => {
          section.appendChild(createCard(event, false));
        });
      }

      if (timed.length) {
        const label = document.createElement("div");
        label.className = "section-label";
        label.textContent = "時間予定";

        section.appendChild(label);

        timed.forEach((event) => {
          section.appendChild(createCard(event, false));
        });
      }
    }

    futureContainer.appendChild(section);
  });
}

// ==========================================
// 次の予定カード
// ==========================================

function createNextCard(event) {
  const card = document.createElement("div");
  card.className = "next-card";

  const countdown = getCountdown(event.start);

  card.innerHTML = `
        <div class="time">${formatTime(event.start)}</div>

        <div class="title">${event.title}</div>

        <div class="countdown ${countdown.state}">
            ${countdown.text}
        </div>
    `;

  card.onclick = () => openModal(event);

  return card;
}

// ==========================================
// 通常カード
// ==========================================

function createCard(event, isToday) {
  const card = document.createElement("article");
  card.className = "card";

  const info = document.createElement("div");
  info.className = "card-info";

  // ----------------------
  // 終日
  // ----------------------

  if (event.allDay) {
    const badge = document.createElement("span");
    badge.className = "badge allday";
    badge.textContent = "終日予定";

    info.appendChild(badge);
  }

  // ----------------------
  // 時間
  // ----------------------
  else {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";

    const time = document.createElement("div");
    time.className = "time";
    time.textContent = formatTime(event.start);

    row.appendChild(time);

    const countdown = getCountdown(event.start);

    const badge = document.createElement("div");
    badge.className = `countdown ${countdown.state}`;
    badge.textContent = countdown.text;

    row.appendChild(badge);

    info.appendChild(row);
  }

  // ----------------------
  // タイトル
  // ----------------------

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = event.title;

  info.appendChild(title);

  // ----------------------
  // 詳細
  // ----------------------

  if (event.description) {
    const desc = document.createElement("div");
    desc.className = "description";
    desc.textContent = event.description;

    info.appendChild(desc);
  }

  card.appendChild(info);

  // ----------------------
  // 今日だけ既読ボタン
  // ----------------------

  if (isToday && !event.allDay && hasStarted(event.start)) {
    const readButton = document.createElement("button");
    readButton.className = "read-button";
    readButton.textContent = "既読";

    readButton.onclick = async (e) => {
      e.stopPropagation();

      await markAsRead(event.id, event.instanceDate);

      card.classList.add("removing");

      setTimeout(renderTimeline, 300);
    };

    card.appendChild(readButton);
  }

  // タスクならチェックボックスを左に付ける
  if (event.kind === "task") {
    const row = document.createElement("div");
    row.className = "task-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";

    checkbox.onclick = async (e) => {
      e.stopPropagation();

      await markAsRead(event.id, event.instanceDate);

      card.classList.add("removing");

      setTimeout(renderTimeline, 300);
    };

    row.appendChild(checkbox);
    row.appendChild(info);

    card.appendChild(row);
  } else {
    card.appendChild(info);
  }

  // ----------------------
  // 編集
  // ----------------------

  card.onclick = () => openModal(event);

  return card;
}

// ==========================================
// 空カード
// ==========================================

function createEmpty() {
  const empty = document.createElement("div");
  empty.className = "empty-day";

  empty.innerHTML = `
        📭<br><br>
        ここに表示するものはありません。
    `;

  return empty;
}
