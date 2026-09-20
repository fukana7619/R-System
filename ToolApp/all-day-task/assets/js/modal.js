import { createEvent, saveEvent, deleteEvent as removeEvent } from "./db.js";

import { renderTimeline } from "./events.js";

let editingEvent = null;
let selectedKind = "event";
let selectedDays = [];

const modal = document.getElementById("modal");
const heading = document.getElementById("modalHeading");

const titleInput = document.getElementById("eventTitle");
const descriptionInput = document.getElementById("eventDescription");

const allDayCheck = document.getElementById("allDayCheck");
const startInput = document.getElementById("startDate");
const endInput = document.getElementById("endDate");

const repeatSelect = document.getElementById("repeatType");
const weeklySelector = document.getElementById("weeklySelector");

const saveButton = document.getElementById("saveEvent");
const deleteButton = document.getElementById("deleteEvent");

const kindEventButton = document.getElementById("kindEvent");
const kindTaskButton = document.getElementById("kindTask");

const weekdayButtons = [...weeklySelector.querySelectorAll("button")];

// --------------------------------------------
// 開く（追加）
// --------------------------------------------

export function openCreateModal() {
  editingEvent = null;

  heading.textContent = "予定を追加";

  deleteButton.classList.add("hidden");

  clearForm();

  modal.classList.remove("hidden");
}

// --------------------------------------------
// 開く（編集）
// --------------------------------------------

export function openModal(event) {
  editingEvent = event;

  heading.textContent = "予定を編集";

  deleteButton.classList.remove("hidden");

  fillForm(event);

  modal.classList.remove("hidden");
}

// --------------------------------------------
// 閉じる
// --------------------------------------------

export function closeModal() {
  modal.classList.add("hidden");
}

// --------------------------------------------
// フォーム初期化
// --------------------------------------------

function clearForm() {
  selectedKind = "event";
  selectedDays = [];

  setKindButtons();

  titleInput.value = "";
  descriptionInput.value = "";

  allDayCheck.checked = false;

  const now = new Date();

  const later = new Date(now.getTime() + 60 * 60 * 1000);

  startInput.value = formatDate(now);
  endInput.value = formatDate(later);

  repeatSelect.value = "once";

  updateWeeklySelector();
}

// --------------------------------------------
// 編集データ読み込み
// --------------------------------------------

function fillForm(event) {
  selectedKind = event.kind;
  selectedDays = [...event.repeat.days];

  setKindButtons();

  titleInput.value = event.title;
  descriptionInput.value = event.description;

  allDayCheck.checked = event.allDay;

  startInput.value = event.start.slice(0, 16);
  endInput.value = event.end.slice(0, 16);

  repeatSelect.value = event.repeat.type;

  updateWeeklySelector();
}

// --------------------------------------------
// 保存
// --------------------------------------------

saveButton.onclick = async () => {
  if (titleInput.value.trim() === "") {
    alert("表示名を入力してください。");
    return;
  }

  const data = editingEvent ? { ...editingEvent } : createEvent();

  data.kind = selectedKind;
  data.title = titleInput.value.trim();
  data.description = descriptionInput.value.trim();

  data.allDay = allDayCheck.checked;

  data.start = startInput.value;
  data.end = endInput.value;

  data.repeat = {
    type: repeatSelect.value,
    days: selectedDays,
  };

  await saveEvent(data);

  closeModal();
  renderTimeline();
};

// --------------------------------------------
// 削除
// --------------------------------------------

deleteButton.onclick = async () => {
  if (!editingEvent) return;

  const ok = confirm(`「${editingEvent.title}」を削除しますか？`);

  if (!ok) return;

  await removeEvent(editingEvent.id);

  closeModal();
  renderTimeline();
};

// --------------------------------------------
// 種類切替
// --------------------------------------------

kindEventButton.onclick = () => {
  selectedKind = "event";
  setKindButtons();
};

kindTaskButton.onclick = () => {
  selectedKind = "task";
  setKindButtons();
};

function setKindButtons() {
  kindEventButton.classList.toggle("active", selectedKind === "event");

  kindTaskButton.classList.toggle("active", selectedKind === "task");
}

// --------------------------------------------
// 繰り返し変更
// --------------------------------------------

repeatSelect.onchange = updateWeeklySelector;

function updateWeeklySelector() {
  weeklySelector.classList.toggle("hidden", repeatSelect.value !== "weekly");

  weekdayButtons.forEach((button) => {
    const day = Number(button.dataset.day);

    button.classList.toggle("active", selectedDays.includes(day));
  });
}

weekdayButtons.forEach((button) => {
  button.onclick = () => {
    const day = Number(button.dataset.day);

    if (selectedDays.includes(day)) {
      selectedDays = selectedDays.filter((d) => d !== day);
    } else {
      selectedDays.push(day);
    }

    updateWeeklySelector();
  };
});

// --------------------------------------------
// モーダル外クリック
// --------------------------------------------

modal.onclick = (e) => {
  if (e.target === modal) {
    closeModal();
  }
};

document.getElementById("closeModal").onclick = closeModal;

// --------------------------------------------
// 日付フォーマット
// --------------------------------------------

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return `${y}-${m}-${d}T${h}:${min}`;
}
