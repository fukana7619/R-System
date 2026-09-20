// ============================================
// Routine Timeline Database v1.0
// assets/js/db.js
// ============================================

import { createNext30Days, shouldRepeat, sortByTime } from "./utils.js";

const DB_NAME = "RoutineTimeline";
const DB_VERSION = 2;

let db = null;

// ストア名
const EVENTS = "events";
const INSTANCES = "instances";

// ============================================
// DB初期化
// ============================================

export async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      db = event.target.result;

      // 予定本体
      if (!db.objectStoreNames.contains(EVENTS)) {
        const store = db.createObjectStore(EVENTS, {
          keyPath: "id",
        });

        store.createIndex("start", "start");
      }

      // 既読状態
      if (!db.objectStoreNames.contains(INSTANCES)) {
        const store = db.createObjectStore(INSTANCES, {
          keyPath: "id",
        });

        store.createIndex("eventId", "eventId");
        store.createIndex("date", "date");
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
  });
}

// ============================================
// UUID
// ============================================

function uuid() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ============================================
// イベント雛形
// ============================================

export function createEvent(data = {}) {
  return {
    id: uuid(),

    kind: "event", // event / task

    title: "",

    description: "",

    allDay: false,

    start: "", // 開始日時のみ

    repeat: {
      enabled: false,
      intervalDays: 7,
      startDate: "",
    },

    createdAt: Date.now(),

    ...data,
  };
}

// ============================================
// CRUD
// ============================================

export async function saveEvent(event) {
  await initDB();

  return transaction(EVENTS, "readwrite", (store) => {
    store.put(event);
  });
}

export async function deleteEvent(id) {
  await initDB();

  return transaction(EVENTS, "readwrite", (store) => {
    store.delete(id);
  });
}

export async function getEvents() {
  await initDB();

  return new Promise((resolve) => {
    const tx = db.transaction(EVENTS);

    tx.objectStore(EVENTS).getAll().onsuccess = (e) => resolve(e.target.result);
  });
}

export async function getEvent(id) {
  await initDB();

  return new Promise((resolve) => {
    const tx = db.transaction(EVENTS);

    tx.objectStore(EVENTS).get(id).onsuccess = (e) => resolve(e.target.result);
  });
}

// ============================================
// 既読管理
// ============================================

function instanceID(eventId, date) {
  return `${eventId}_${date}`;
}

export async function markAsRead(eventId, date) {
  await initDB();

  return transaction(INSTANCES, "readwrite", (store) => {
    store.put({
      id: instanceID(eventId, date),
      eventId,
      date,
      read: true,
    });
  });
}

export async function unread(eventId, date) {
  await initDB();

  return transaction(INSTANCES, "readwrite", (store) => {
    store.delete(instanceID(eventId, date));
  });
}

export async function isRead(eventId, date) {
  await initDB();

  return new Promise((resolve) => {
    const tx = db.transaction(INSTANCES);

    tx.objectStore(INSTANCES).get(instanceID(eventId, date)).onsuccess = (
      e,
    ) => {
      resolve(Boolean(e.target.result));
    };
  });
}

// ============================================
// 今日〜30日生成
// ============================================

export async function getTimeline() {
  const events = await getEvents();

  const days = createNext30Days();

  const timeline = [];

  for (const date of days) {
    const dayEvents = [];

    for (const event of events) {
      if (!shouldRepeat(event, date)) continue;

      const read = await isRead(event.id, date);

      if (read) continue;

      const copy = structuredClone(event);

      copy.instanceDate = date;

      if (!copy.allDay) {
        const time = copy.start.slice(11, 16);

        copy.start = `${date}T${time}`;
      }

      dayEvents.push(copy);
    }

    timeline.push({
      date,
      events: sortByTime(dayEvents),
    });
  }

  return timeline;
}

// ============================================
// 初回データ
// ============================================

export async function seedDatabase() {
  const list = await getEvents();

  if (list.length) return;

  const sample = [
    createEvent({
      kind: "task",

      title: "部屋掃除",

      description: "床・机・ゴミ箱",

      allDay: true,

      start: "2026-09-20T00:00",

      repeat: {
        enabled: true,
        intervalDays: 7,
        startDate: "2026-09-20",
      },
    }),

    createEvent({
      kind: "event",

      title: "図書館",

      description: "返却・貸出",

      allDay: true,

      start: "2026-09-20T00:00",

      repeat: {
        enabled: true,
        intervalDays: 14,
        startDate: "2026-09-20",
      },
    }),

    createEvent({
      kind: "task",

      title: "国語開始",

      description: "問題集 Lesson5",

      start: "2026-09-20T16:00",

      repeat: {
        enabled: false,
      },
    }),

    createEvent({
      kind: "task",

      title: "動画編集",

      description: "YMM4 サムネイル",

      start: "2026-09-20T20:00",

      repeat: {
        enabled: true,
        intervalDays: 7,
        startDate: "2026-09-20",
      },
    }),
  ];

  for (const event of sample) {
    await saveEvent(event);
  }
}

// ============================================
// 共通トランザクション
// ============================================

function transaction(storeName, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);

    callback(tx.objectStore(storeName));

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
