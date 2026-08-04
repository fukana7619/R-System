// ===================================
// 💾 LocalDB & データ管理
// ===================================
const STORAGE_KEY_V1 = 'homework_progress_tasks_v1';
const STORAGE_KEY_V2 = 'homework_progress_tasks_v2';
const SETTINGS_KEY = 'homework_progress_settings_v2';

let tasks = loadTasks();
let settings = loadSettings();

let currentPercent = 0;
let animationFrameId = null;

function loadTasks() {
  // まず V2 のデータを読み込む
  const savedV2 = localStorage.getItem(STORAGE_KEY_V2);
  if (savedV2) {
    try {
      return JSON.parse(savedV2).map(task => ({
        ...task,
        pinned: !!task.pinned
      }));
    } catch (e) {}
  }

  // V2 がなくて V1 のデータがある場合は引き継ぐ（移行処理）
  const savedV1 = localStorage.getItem(STORAGE_KEY_V1);
  if (savedV1) {
    try {
      const oldTasks = JSON.parse(savedV1);
      
      // V1 データを V2 の形式に整える
      const migratedTasks = oldTasks.map(task => ({
        name: task.name || '無題のタスク',
        totalPages: task.totalPages || 1,
        completedPages: task.completedPages || 0,
        pageTime: task.pageTime || 15,
        unit: task.unit || 'p',
        deadline: task.deadline || '',
        pinned: false
      }));

      // V2のキーに保存し直す
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(migratedTasks));
      return migratedTasks;
    } catch (e) {
      console.error('V1データの移行に失敗しました', e);
    }
  }

  return [];
}

function saveTasksToStorage() {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(tasks)); // 👈 STORAGE_KEY_V2 に修正
}

function loadSettings() {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) {}
  }
  return { displayMode: 'countdown', sortMode: 'deadline', searchQuery: '' };
}

function saveSettingsToStorage() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ===================================
// 🔋 電池残量表示
// ===================================
function initBattery() {
  if ('getBattery' in navigator) {
    navigator.getBattery().then(battery => {
      function update() {
        const level = Math.floor(battery.level * 100);
        const isCharging = battery.charging ? '⚡' : '🔋';
        document.getElementById('batteryDisplay').innerText = `${isCharging} ${level}%`;
      }
      update();
      battery.addEventListener('levelchange', update);
      battery.addEventListener('chargingchange', update);
    });
  } else {
    document.getElementById('batteryDisplay').innerText = '🔋 --%';
  }
}
initBattery();

// ===================================
// ⏰ タイマー＆ディスプレイ制御
// ===================================
function updateDisplay() {
  const mainEl = document.getElementById('mainDisplay');
  const subEl = document.getElementById('subDisplay');
  const containerEl = document.getElementById('displayContainer');

  if (settings.displayMode === 'none') {
    containerEl.style.display = 'none';
    return;
  }
  containerEl.style.display = 'block';

  if (settings.displayMode === 'clock') {
    const now = new Date();
    mainEl.innerText = now.toTimeString().split(' ')[0];
    subEl.innerText = '現在時刻';
  } else if (settings.displayMode === 'countdown') {
    // 未完了で最も期限が近いタスクを検索
    const upcomingTasks = tasks
      .filter(t => t.deadline && t.completedPages < t.totalPages)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    if (upcomingTasks.length === 0) {
      mainEl.innerText = '--:--:--';
      subEl.innerText = '期限付きの未完了タスクはありません';
    } else {
      const target = upcomingTasks[0];
      const diff = new Date(target.deadline).getTime() - new Date().getTime(); // 👈 getTime() に修正
      
      if (isNaN(diff)) {
        mainEl.innerText = '--:--:--';
        subEl.innerText = '期限のフォーマットが不正です';
      } else if (diff <= 0) {
        mainEl.innerText = '期限超過！';
        subEl.innerText = `🎯 ${target.name}`;
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0');
        const mins = String(Math.floor((diff / (1000 * 60)) % 60)).padStart(2, '0');
        const secs = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');

        const dayText = days > 0 ? `${days}日 ` : '';
        mainEl.innerText = `${dayText}${hours}:${mins}:${secs}`;
        subEl.innerText = `🎯 残り時間: ${target.name}`;
      }
    }
  }
}
setInterval(updateDisplay, 1000);

function changeDisplayMode(mode) {
  settings.displayMode = mode;
  saveSettingsToStorage();
  updateDisplay();
}

function changeSortMode(mode) {
  settings.sortMode = mode;
  saveSettingsToStorage();
  render();
}

function updateSearchQuery(value) {
  settings.searchQuery = value;
  saveSettingsToStorage();
  render();
}

function clearSearch() {
  document.getElementById('taskSearch').value = '';
  updateSearchQuery('');
}

function matchesSearch(task, query) {
  if (!query) return true;
  return task.name.toLowerCase().includes(query.toLowerCase());
}

// ===================================
// 💤 放置検知
// ===================================
let idleTimer = null;
function resetIdleTimer() {
  document.body.classList.remove('idle-mode');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    document.body.classList.add('idle-mode');
  }, 5000);
}
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, resetIdleTimer, true);
});
resetIdleTimer();

// ===================================
// 🧮 ソート & レンダリング
// ===================================
function getSortedTasks() {
  const list = tasks.filter(task => matchesSearch(task, settings.searchQuery));
  list.forEach((t, i) => t._originalIndex = i); // 元のインデックスを保持

  return list.sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return b.pinned - a.pinned;
    }
    if (settings.sortMode === 'added') {
      return a._originalIndex - b._originalIndex;
    }
    if (settings.sortMode === 'name') {
      return a.name.localeCompare(b.name, 'ja');
    }
    if (settings.sortMode === 'progressAsc') {
      return (a.completedPages / a.totalPages) - (b.completedPages / b.totalPages);
    }
    if (settings.sortMode === 'progressDesc') {
      return (b.completedPages / b.totalPages) - (a.completedPages / a.totalPages);
    }
    // デフォルト: 期限順 (未設定は最後尾)
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
}

function render() {
  const taskListEl = document.getElementById('taskList');
  taskListEl.innerHTML = '';

  let totalRequiredTime = 0;
  let totalCompletedTime = 0;

  const sortedTasks = getSortedTasks();

  sortedTasks.forEach((task) => {
    const originalIndex = task._originalIndex;
    const taskTotalTime = task.totalPages * task.pageTime;
    const taskCompletedTime = task.completedPages * task.pageTime;

    totalRequiredTime += taskTotalTime;
    totalCompletedTime += taskCompletedTime;

    // 期限表示のフォーマット
    let deadlineText = '期限なし';
    let isUrgent = false;

    if (task.deadline) {
      const d = new Date(task.deadline);
      deadlineText = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      
      // 24時間以内ならハイライト用フラグ
      const hoursLeft = (d - new Date()) / (1000 * 60 * 60);
      if (hoursLeft > 0 && hoursLeft <= 24 && task.completedPages < task.totalPages) {
        isUrgent = true;
      }
    }

    const isCompleted = task.completedPages >= task.totalPages;
    const card = document.createElement('div');
    card.className = `task-card ${isUrgent ? 'urgent' : ''} ${task.pinned ? 'pinned' : ''} ${isCompleted ? 'completed' : ''}`;
    card.innerHTML = `
      <div class="task-title">
        <span>${escapeHtml(task.name)}</span>
        <div>
          <span class="page-count">${task.completedPages} / ${task.totalPages} ${task.unit || 'p'}</span>
          <button class="btn-pin" onclick="togglePin(${originalIndex})">${task.pinned ? '📌' : '📍'}</button>
          <button class="btn-edit" onclick="openTaskModal(${originalIndex})">⚙️</button>
        </div>
      </div>
      <div class="task-info">
        1${task.unit || 'p'}/ ${task.pageTime}分 (計${taskTotalTime}分) | ⏰ 期限: ${deadlineText}
      </div>
      <div class="controls">
        <button class="btn-sub" onclick="updatePages(${originalIndex}, -1)">- 1${task.unit || 'p'}</button>
        <button class="btn-add" onclick="updatePages(${originalIndex}, 1)">+ 1${task.unit || 'p'} 完了</button>
      </div>
    `;
    taskListEl.appendChild(card);
  });

  // 進捗率
  const targetPercent = totalRequiredTime > 0 ? (totalCompletedTime / totalRequiredTime) * 100 : 0;
  const clampedTarget = Math.min(100, Math.max(0, targetPercent));

  document.getElementById('progressBar').style.width = clampedTarget + '%';
  animatePercentText(clampedTarget);
  updateDisplay();
}

function animatePercentText(target) {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  function step() {
    const diff = target - currentPercent;
    if (Math.abs(diff) < 0.02) {
      currentPercent = target;
      document.getElementById('percentDisplay').innerText = (Math.floor(currentPercent * 10) / 10).toFixed(1) + '%';
      animationFrameId = null;
    } else {
      currentPercent += diff * 0.1; 
      document.getElementById('percentDisplay').innerText = (Math.floor(currentPercent * 10) / 10).toFixed(1) + '%';
      animationFrameId = requestAnimationFrame(step);
    }
  }
  step();
}

function updatePages(index, delta) {
  const task = tasks[index];
  if (!task) return;

  const newPages = task.completedPages + delta;
  if (newPages >= 0 && newPages <= task.totalPages) {
    task.completedPages = newPages;
    saveTasksToStorage();
    render();
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

// ===================================
// 📝 モーダル操作
// ===================================
function openTaskModal(index = null) {
  const modal = document.getElementById('taskModal');
  const title = document.getElementById('modalTitle');
  const btnDelete = document.getElementById('btnDeleteTask');

  if (index !== null) {
    const task = tasks[index];
    title.innerText = 'タスクの編集';
    document.getElementById('taskId').value = index;
    document.getElementById('taskName').value = task.name;
    document.getElementById('totalPages').value = task.totalPages;
    document.getElementById('unitName').value = task.unit || 'p';
    document.getElementById('pageTime').value = task.pageTime;
    document.getElementById('taskPinned').checked = !!task.pinned;
    
    if (task.deadline) {
      const [date, time] = task.deadline.split('T');
      document.getElementById('deadlineDate').value = date || '';
      document.getElementById('deadlineTime').value = time || '';
    } else {
      document.getElementById('deadlineDate').value = '';
      document.getElementById('deadlineTime').value = '';
    }
    btnDelete.style.display = 'block';
  } else {
    title.innerText = 'タスクの追加';
    document.getElementById('taskId').value = '';
    document.getElementById('taskForm').reset();
    document.getElementById('unitName').value = 'p';
    document.getElementById('taskPinned').checked = false;
    btnDelete.style.display = 'none';
  }

  modal.classList.add('active');
}

function closeTaskModal() {
  const modal = document.getElementById('taskModal');
  modal.classList.remove('active');
}

function saveTask(e) {
  e.preventDefault();

  const taskId = document.getElementById('taskId').value;
  const name = document.getElementById('taskName').value.trim();
  const rawPages = document.getElementById('totalPages').value;
  const totalPages = rawPages === '' ? 1 : parseInt(rawPages, 10);
  const unit = document.getElementById('unitName').value || 'p';
  const pageTime = parseInt(document.getElementById('pageTime').value, 10);
  
  const dateVal = document.getElementById('deadlineDate').value;
  const timeVal = document.getElementById('deadlineTime').value || '23:59';
  const deadline = dateVal ? `${dateVal}T${timeVal}` : '';
  const pinned = document.getElementById('taskPinned').checked;

  if (!name || isNaN(totalPages) || isNaN(pageTime)) return;

  if (taskId !== '') {
    const idx = parseInt(taskId, 10);
    tasks[idx] = { ...tasks[idx], name, totalPages, unit, pageTime, deadline, pinned };
    if (tasks[idx].completedPages > totalPages) tasks[idx].completedPages = totalPages;
  } else {
    tasks.push({ name, totalPages, completedPages: 0, unit, pageTime, deadline, pinned });
  }

  saveTasksToStorage();
  closeTaskModal();
  render();
}

function deleteTask() {
  const taskId = document.getElementById('taskId').value;
  if (taskId === '') return;

  if (confirm('このタスクを削除しますか？')) {
    tasks.splice(parseInt(taskId, 10), 1);
    saveTasksToStorage();
    closeTaskModal();
    render();
  }
}

function togglePin(index) {
  const task = tasks[index];
  if (!task) return;
  task.pinned = !task.pinned;
  saveTasksToStorage();
  render();
}

// 初期化
document.getElementById('displayModeSelect').value = settings.displayMode;
document.getElementById('sortSelect').value = settings.sortMode;
document.getElementById('taskSearch').value = settings.searchQuery || '';
document.getElementById('percentDisplay').innerText = '0.0%';
document.getElementById('progressBar').style.width = '0%';
render();
