import { deleteEvent, saveEvent, unread } from "./db.js";

const MAX_HISTORY = 10;
const undoStack = [];

export function pushUndoAction(action) {
  if (!action) return;

  undoStack.push(action);

  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }

  updateUndoButton();
}

export function canUndo() {
  return undoStack.length > 0;
}

export function updateUndoButton() {
  const button = document.getElementById("undoButton");

  if (!button) return;

  button.disabled = !canUndo();
  button.title = canUndo()
    ? "直前の操作を元に戻す"
    : "元に戻す履歴がありません";
}

export function initUndoButton() {
  const button = document.getElementById("undoButton");

  if (!button) return;

  button.onclick = async () => {
    const success = await undoLastAction();

    if (success) {
      const { renderTimeline } = await import("./timeline.js");
      await renderTimeline();
    }
  };

  updateUndoButton();
}

export async function undoLastAction() {
  const action = undoStack.pop();

  if (!action) {
    updateUndoButton();
    return false;
  }

  try {
    switch (action.type) {
      case "save": {
        if (action.before) {
          await saveEvent(action.before);
        } else if (action.after) {
          await deleteEvent(action.after.id);
        }
        break;
      }

      case "delete": {
        await saveEvent(action.event);
        break;
      }

      case "read": {
        await unread(action.eventId, action.date);
        break;
      }

      default:
        break;
    }

    updateUndoButton();
    return true;
  } catch (error) {
    console.error("元に戻すに失敗しました", error);
    updateUndoButton();
    return false;
  }
}
