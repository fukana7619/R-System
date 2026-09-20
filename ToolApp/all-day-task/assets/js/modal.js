// ==========================================
// Routine Timeline
// assets/js/modal.js
// 追加・編集モーダル
// ==========================================

import { createEvent, saveEvent, deleteEvent } from "./db.js";

import { renderTimeline } from "./timeline.js";

import { pushUndoAction } from "./history.js";

import { toDateTimeLocal } from "./utils.js";

// -------------------------------
// DOM
// -------------------------------

const modal = document.getElementById("modal");

const modalTitle = document.getElementById("modalTitle");

const titleInput = document.getElementById("eventTitle");
const descriptionInput = document.getElementById("eventDescription");

const startInput = document.getElementById("startDate");

const allDayCheck = document.getElementById("allDayCheck");

const kindEventButton = document.getElementById("kindEvent");
const kindTaskButton = document.getElementById("kindTask");

const repeatOnceButton = document.getElementById("repeatOnce");
const repeatLoopButton = document.getElementById("repeatLoop");

const repeatArea = document.getElementById("repeatArea");
const repeatDaysInput = document.getElementById("repeatDays");

const saveButton = document.getElementById("saveButton");
const deleteButton = document.getElementById("deleteButton");

const closeButton = document.getElementById("closeModal");

// -------------------------------
// 状態
// -------------------------------

let editingEvent = null;

let selectedKind = "event";
let repeatEnabled = false;

// ==========================================
// モーダルを開く（追加）
// ==========================================

export function openCreateModal() {
  editingEvent = null;

  modalTitle.textContent = "予定を追加";

  deleteButton.classList.add("hidden");

  resetForm();

  modal.classList.remove("hidden");
}

// ==========================================
// モーダルを開く（編集）
// ==========================================

export function openModal(event) {
  editingEvent = event;

  modalTitle.textContent = "予定を編集";

  deleteButton.classList.remove("hidden");

  fillForm(event);

  modal.classList.remove("hidden");
}

// ==========================================
// 閉じる
// ==========================================

export function closeModal() {
  modal.classList.add("hidden");
}

// ==========================================
// フォーム初期化
// ==========================================

function resetForm() {
  selectedKind = "event";
  repeatEnabled = false;

  titleInput.value = "";
  descriptionInput.value = "";

  allDayCheck.checked = false;

  const now = new Date();

  now.setMinutes(now.getMinutes() + 30);

  startInput.value = toDateTimeLocal(now);

  repeatDaysInput.value = 7;

  updateKindButtons();
  updateRepeatButtons();
}

// ==========================================
// 編集内容をフォームへ
// ==========================================

function fillForm(event) {
  selectedKind = event.kind;

  repeatEnabled = event.repeat.enabled;

  titleInput.value = event.title;
  descriptionInput.value = event.description;

  allDayCheck.checked = event.allDay;

  startInput.value = event.start.slice(0, 16);

  repeatDaysInput.value = event.repeat.intervalDays;

  updateKindButtons();
  updateRepeatButtons();
}

// ==========================================
// 保存
// ==========================================

saveButton.onclick = async () => {
  if (titleInput.value.trim() === "") {
    alert("表示名を入力してください。");

    return;
  }

  const event = editingEvent ? structuredClone(editingEvent) : createEvent();

  const before = editingEvent ? structuredClone(editingEvent) : null;

  event.kind = selectedKind;

  event.title = titleInput.value.trim();

  event.description = descriptionInput.value.trim();

  event.allDay = allDayCheck.checked;

  event.start = startInput.value;

  event.repeat = {
    enabled: repeatEnabled,

    intervalDays: Number(repeatDaysInput.value),

    startDate: startInput.value.slice(0, 10),
  };

  await saveEvent(event);

  pushUndoAction({
    type: "save",
    before,
    after: event,
  });

  closeModal();

  renderTimeline();
};

// ==========================================
// 削除
// ==========================================

deleteButton.onclick = async () => {
  if (!editingEvent) return;

  const ok = confirm(`「${editingEvent.title}」を削除しますか？`);

  if (!ok) return;

  const deletedEvent = structuredClone(editingEvent);

  await deleteEvent(editingEvent.id);

  pushUndoAction({
    type: "delete",
    event: deletedEvent,
  });

  closeModal();

  renderTimeline();
};

// ==========================================
// 種類切替
// ==========================================

kindEventButton.onclick = () => {
  selectedKind = "event";

  updateKindButtons();
};

kindTaskButton.onclick = () => {
  selectedKind = "task";

  updateKindButtons();
};

function updateKindButtons() {
  kindEventButton.classList.toggle("active", selectedKind === "event");

  kindTaskButton.classList.toggle("active", selectedKind === "task");
}

// ==========================================
// 単発・繰り返し切替
// ==========================================

repeatOnceButton.onclick = () => {
  repeatEnabled = false;

  updateRepeatButtons();
};

repeatLoopButton.onclick = () => {
  repeatEnabled = true;

  updateRepeatButtons();
};

function updateRepeatButtons() {
  repeatOnceButton.classList.toggle("active", !repeatEnabled);

  repeatLoopButton.classList.toggle("active", repeatEnabled);

  repeatArea.classList.toggle("hidden", !repeatEnabled);
}

// ==========================================
// 終日予定
// ==========================================

allDayCheck.onchange = () => {
  if (allDayCheck.checked) {
    const date = startInput.value.slice(0, 10);

    startInput.value = `${date}T00:00`;
  }
};

// ==========================================
// 閉じる処理
// ==========================================

closeButton.onclick = closeModal;

modal.onclick = (e) => {
  if (e.target === modal) {
    closeModal();
  }
};

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
  }
});
