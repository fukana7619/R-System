// ============================================
// Routine Timeline - IndexedDB Manager
// assets/js/db.js
// ============================================

const DB_NAME = "RoutineTimelineDB";
const DB_VERSION = 1;
const STORE_NAME = "events";

let db = null;

// --------------------------------------------
// DB 初期化
// --------------------------------------------

export async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
        });

        store.createIndex("start", "start");
        store.createIndex("kind", "kind");
        store.createIndex("repeatType", "repeat.type");
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
  });
}

// --------------------------------------------
// UUID
// --------------------------------------------

function createID() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// --------------------------------------------
// デフォルトイベント生成
// --------------------------------------------

export function createEvent(data = {}) {
  return {
    id: createID(),

    kind: "event", // event / task

    title: "",

    description: "",

    allDay: false,

    start: "",

    end: "",

    repeat: {
      type: "once", // once,daily,weekly,monthly
      days: [],
    },

    completed: false,

    notifyBefore: 10,

    createdAt: Date.now(),

    ...data,
  };
}

// --------------------------------------------
// 全取得
// --------------------------------------------

export async function getEvents() {
  await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --------------------------------------------
// ID取得
// --------------------------------------------

export async function getEvent(id) {
  await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --------------------------------------------
// 保存（追加・更新兼用）
// --------------------------------------------

export async function saveEvent(event) {
  await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.put(event);

    tx.oncomplete = () => resolve(event);
    tx.onerror = () => reject(tx.error);
  });
}

// --------------------------------------------
// 削除
// --------------------------------------------

export async function deleteEvent(id) {
  await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.delete(id);

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// --------------------------------------------
// タスク完了切替
// --------------------------------------------

export async function toggleCompleted(id) {
  const event = await getEvent(id);

  if (!event) return;

  event.completed = !event.completed;

  await saveEvent(event);
}

// --------------------------------------------
// 今日から指定日数分取得
// --------------------------------------------

export async function getTimeline(days = 7) {
  const all = await getEvents();

  const result = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const target = new Date(today);
    target.setDate(today.getDate() + i);

    const dateString = target.toISOString().slice(0, 10);

    const dailyEvents = buildEventsForDate(all, target);

    result.push({
      date: dateString,
      events: dailyEvents,
    });
  }

  return result;
}

// --------------------------------------------
// 繰り返し展開
// --------------------------------------------

function buildEventsForDate(events, targetDate) {
  const targetString = targetDate.toISOString().slice(0, 10);
  const weekday = targetDate.getDay();
  const day = targetDate.getDate();

  const list = [];

  events.forEach((event) => {
    const startDate = event.start.slice(0, 10);

    switch (event.repeat.type) {
      case "once":
        if (startDate === targetString) {
          list.push(copyToDate(event, targetDate));
        }

        break;

      case "daily":
        if (startDate <= targetString) {
          list.push(copyToDate(event, targetDate));
        }

        break;

      case "weekly":
        if (startDate <= targetString && event.repeat.days.includes(weekday)) {
          list.push(copyToDate(event, targetDate));
        }

        break;

      case "monthly":
        if (
          startDate <= targetString &&
          new Date(event.start).getDate() === day
        ) {
          list.push(copyToDate(event, targetDate));
        }

        break;
    }
  });

  return list.sort(sortEvents);
}

// --------------------------------------------
// 日付コピー
// --------------------------------------------

function copyToDate(event, targetDate) {
  const copy = structuredClone(event);

  if (!copy.allDay) {
    const start = new Date(copy.start);
    const end = new Date(copy.end);

    start.setFullYear(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
    );

    end.setFullYear(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
    );

    copy.start = start.toISOString();
    copy.end = end.toISOString();
  }

  return copy;
}

// --------------------------------------------
// 並び替え
// --------------------------------------------

function sortEvents(a, b) {
  if (a.completed !== b.completed) {
    return Number(a.completed) - Number(b.completed);
  }

  if (a.allDay !== b.allDay) {
    return a.allDay ? -1 : 1;
  }

  return new Date(a.start) - new Date(b.start);
}

// --------------------------------------------
// 完了タスクを翌周期でリセット
// --------------------------------------------

export async function resetRecurringTasks() {
  const events = await getEvents();
  const today = new Date();

  for (const event of events) {
    if (
      event.kind !== "task" ||
      !event.completed ||
      event.repeat.type === "once"
    )
      continue;

    const last = new Date(event.start);

    let shouldReset = false;

    switch (event.repeat.type) {
      case "daily":
        shouldReset = today.toDateString() !== last.toDateString();

        break;

      case "weekly":
        shouldReset =
          today.getDay() === last.getDay() &&
          today.toDateString() !== last.toDateString();

        break;

      case "monthly":
        shouldReset =
          today.getDate() === last.getDate() &&
          today.getMonth() !== last.getMonth();

        break;
    }

    if (shouldReset) {
      event.completed = false;

      await saveEvent(event);
    }
  }
}

// --------------------------------------------
// 初回データ投入
// --------------------------------------------

export async function seedDatabase() {
  const list = await getEvents();

  if (list.length > 0) return;

  const samples = [
    createEvent({
      kind: "task",
      title: "部屋掃除",
      description: "床・机・ゴミ箱",
      allDay: true,
      start: "2026-09-20T00:00",
      end: "2026-09-20T23:59",
      repeat: {
        type: "weekly",
        days: [0],
      },
    }),

    createEvent({
      kind: "event",
      title: "図書館",
      description: "返却・貸出",
      allDay: true,
      start: "2026-09-20T00:00",
      end: "2026-09-20T23:59",
      repeat: {
        type: "weekly",
        days: [0],
      },
    }),

    createEvent({
      kind: "task",
      title: "英語問題集",
      description: "Lesson5",
      start: "2026-09-20T20:00",
      end: "2026-09-20T21:30",
      repeat: {
        type: "weekly",
        days: [0],
      },
    }),

    createEvent({
      kind: "event",
      title: "動画編集",
      description: "YMM4・サムネイル",
      start: "2026-09-20T22:00",
      end: "2026-09-20T23:30",
      repeat: {
        type: "once",
        days: [],
      },
    }),
  ];

  for (const event of samples) {
    await saveEvent(event);
  }
}
