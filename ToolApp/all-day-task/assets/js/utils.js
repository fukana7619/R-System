// ==========================================
// Routine Timeline
// assets/js/utils.js
// 日付・時間ユーティリティ
// ==========================================

export const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

// ----------------------------
// 今日の日付文字列
// 2026-09-20
// ----------------------------

export function getTodayString() {
  const now = new Date();

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

// ----------------------------
// 今日の日付オブジェクト
// ----------------------------

export function getToday() {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return today;
}

// ----------------------------
// YYYY-MM-DDTHH:mm
// datetime-local用
// ----------------------------

export function toDateTimeLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return `${y}-${m}-${d}T${h}:${min}`;
}

// ----------------------------
// HH:mm
// ----------------------------

export function formatTime(dateString) {
  const date = new Date(dateString);

  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ----------------------------
// 9月20日（日）
// ----------------------------

export function formatDay(dateString) {
  const date = new Date(dateString);

  return `${date.getMonth() + 1}月${date.getDate()}日（${WEEK[date.getDay()]}）`;
}

// ----------------------------
// 今日かどうか
// ----------------------------

export function isToday(dateString) {
  return dateString.slice(0, 10) === getTodayString();
}

// ----------------------------
// 今日から30日分生成
// ----------------------------

export function createNext30Days() {
  const today = getToday();

  const days = [];

  for (let i = 0; i < 31; i++) {
    const d = new Date(today);

    d.setDate(today.getDate() + i);

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    days.push(`${y}-${m}-${day}`);
  }

  return days;
}

// ----------------------------
// 日数差
// ----------------------------

export function diffDays(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);

  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);

  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

// ----------------------------
// ○日ごとの繰り返しか判定
// ----------------------------

export function shouldRepeat(event, dateString) {
  if (!event.repeat.enabled) {
    return event.start.slice(0, 10) === dateString;
  }

  const passed = diffDays(event.repeat.startDate, dateString);

  return passed >= 0 && passed % event.repeat.intervalDays === 0;
}

// 今日より前で、最後に発生した日付
export function getPreviousOccurrenceDate(event, dateString) {
  const startDate = event.repeat.enabled
    ? event.repeat.startDate
    : event.start.slice(0, 10);

  const passed = diffDays(startDate, dateString);

  if (passed <= 0) return null;

  if (!event.repeat.enabled) return startDate;

  const intervalDays = Number(event.repeat.intervalDays);
  if (!intervalDays) return null;

  const occurrence = new Date(`${startDate}T00:00`);
  occurrence.setDate(
    occurrence.getDate() +
      Math.floor((passed - 1) / intervalDays) * intervalDays,
  );

  const y = occurrence.getFullYear();
  const m = String(occurrence.getMonth() + 1).padStart(2, "0");
  const d = String(occurrence.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

// ----------------------------
// あと○分
// ----------------------------

export function getCountdown(dateString) {
  const now = new Date();
  const target = new Date(dateString);

  const diffMs = target - now;

  if (diffMs <= 0) {
    return {
      state: "started",
      text: "開始しました",
    };
  }

  const minutes = Math.ceil(diffMs / 60000);

  if (minutes < 60) {
    return {
      state: minutes <= 5 ? "danger" : "warning",
      text: `あと${minutes}分`,
    };
  }

  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;

  return {
    state: "normal",
    text: remain === 0 ? `あと${hours}時間` : `あと${hours}時間${remain}分`,
  };
}

// ----------------------------
// 開始したか
// ----------------------------

export function hasStarted(dateString) {
  return new Date(dateString) <= new Date();
}

// ----------------------------
// 開始日時で並び替え
// ----------------------------

export function sortByTime(events) {
  return [...events].sort((a, b) => {
    if (a.allDay !== b.allDay) {
      return a.allDay ? -1 : 1;
    }

    return new Date(a.start) - new Date(b.start);
  });
}
