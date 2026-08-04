// ===================================
// 💾 LocalDB & データ管理
// ===================================
const STORAGE_KEY_V1 = 'homework_progress_tasks_v1';
const STORAGE_KEY_V2 = 'homework_progress_tasks_v2';
const SETTINGS_KEY = 'homework_progress_settings_v2';

let tasks = loadTasks();
let settings = loadSettings();
let currentlyExpandedTaskIndex = null;
let closeExpandedTimeout = null;
let suppressHoverExpansionUntilPointerMove = false;
let lastPointerPosition = { x: 0, y: 0 };

initializeSections();

let currentPercent = 0;
let animationFrameId = null;

function loadTasks() {
  // まず V2 のデータを読み込む
  const savedV2 = localStorage.getItem(STORAGE_KEY_V2);
  if (savedV2) {
    try {
      return JSON.parse(savedV2).map(task => ({
        ...task,
        pinned: !!task.pinned,
        section: task.section || 'default',
        completedPages: Number.isFinite(task.completedPages) ? task.completedPages : 0,
        totalPages: Number.isFinite(task.totalPages) ? task.totalPages : 1,
        pageTime: Number.isFinite(task.pageTime) ? task.pageTime : 15
      }));
    } catch (e) {
      console.error('V2データの読み込みに失敗しました', e);
    }
  }

  // V2 がなくて V1 のデータがある場合は引き継ぐ（移行処理）
  const savedV1 = localStorage.getItem(STORAGE_KEY_V1);
  if (savedV1) {
    try {
      const oldTasks = JSON.parse(savedV1);
      
      // V1 データを V2 の形式に整える
      const migratedTasks = oldTasks.map(task => normalizeTask({
        ...task,
        pinned: false,
        section: 'default'
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

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTask(task) {
  return {
    name: typeof task.name === 'string' && task.name.trim() ? task.name.trim() : '無題のタスク',
    totalPages: normalizeNumber(task.totalPages, 1),
    completedPages: normalizeNumber(task.completedPages, 0),
    pageTime: normalizeNumber(task.pageTime, 15),
    unit: typeof task.unit === 'string' && task.unit ? task.unit : 'p',
    deadline: typeof task.deadline === 'string' ? task.deadline : '',
    pinned: !!task.pinned,
    section: typeof task.section === 'string' && task.section ? task.section : 'default',
    shareId: typeof task.shareId === 'string' && task.shareId ? task.shareId : ''
  };
}

const GAS_URL = 'https://script.google.com/macros/s/AKfycbyyqc7Ym7nq_wAr8B_TKxWkaiPHTFlN8lBChNVJfnhxIIOYwKmjnQWDX0ZHPMAjM2uacg/exec';

function saveTasksToStorage() {
  const normalizedTasks = tasks.map(normalizeTask);
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(normalizedTasks));
}

function loadSettings() {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          displayMode: typeof parsed.displayMode === 'string' ? parsed.displayMode : 'countdown',
          sortMode: typeof parsed.sortMode === 'string' ? parsed.sortMode : 'deadline',
          searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
          currentSection: typeof parsed.currentSection === 'string' ? parsed.currentSection : 'default',
          sections: Array.isArray(parsed.sections) ? parsed.sections.filter(s => typeof s === 'string') : ['default'],
          sharedIds: typeof parsed.sharedIds === 'object' && parsed.sharedIds !== null ? parsed.sharedIds : {}
        };
      }
    } catch (e) {
      console.error('設定の読み込みに失敗しました', e);
    }
  }
  return { displayMode: 'countdown', sortMode: 'deadline', searchQuery: '', currentSection: 'default', sections: ['default'], sharedIds: {} };
}

function saveSettingsToStorage() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function initializeSections() {
  const taskSections = Array.from(new Set(tasks.map(task => task.section || 'default')));
  settings.sections = Array.from(new Set([...(Array.isArray(settings.sections) ? settings.sections : []), ...taskSections]));
  if (!settings.currentSection || !settings.sections.includes(settings.currentSection)) {
    settings.currentSection = settings.sections[0] || 'default';
  }
  if (!settings.sections.includes('default')) {
    settings.sections.unshift('default');
  }
  settings.sharedIds = typeof settings.sharedIds === 'object' && settings.sharedIds !== null ? settings.sharedIds : {};
  saveSettingsToStorage();
}

function renderSectionOptions() {
  const sectionSelect = document.getElementById('sectionSelect');
  sectionSelect.innerHTML = '';
  settings.sections.forEach(section => {
    const option = document.createElement('option');
    option.value = section;
    option.textContent = section;
    sectionSelect.appendChild(option);
  });
  sectionSelect.value = settings.currentSection;
  updateShareInfoDisplay();
}

function getShareIdForSection(section) {
  if (typeof settings.sharedIds === 'object' && settings.sharedIds !== null && settings.sharedIds[section]) {
    return settings.sharedIds[section];
  }
  const task = tasks.find(task => task.section === section && task.shareId);
  return task ? task.shareId : '';
}

function setShareIdForSection(section, id) {
  if (typeof settings.sharedIds !== 'object' || settings.sharedIds === null) {
    settings.sharedIds = {};
  }
  settings.sharedIds[section] = id;
  saveSettingsToStorage();
}

function updateShareInfoDisplay() {
  const currentSection = settings.currentSection;
  const shareId = getShareIdForSection(currentSection);
  const shareInfoEl = document.getElementById('sectionShareInfo');
  if (!shareInfoEl) return;

  if (!shareId) {
    shareInfoEl.textContent = 'このタスクリストはまだ共有されていません。共有すると別端末から最新状態を取得できます。';
    return;
  }

  shareInfoEl.innerHTML = `共有ID: <strong>${escapeHtml(shareId)}</strong>`;
}

function toggleTaskListSettings() {
  const panel = document.getElementById('sectionSettings');
  const isVisible = panel.style.display === 'block';
  if (isVisible) {
    hideSectionSettings();
  } else {
    panel.style.display = 'block';
    hideSectionRenameForm();
    hideSectionMergeForm();
  }
}

function hideSectionSettings() {
  document.getElementById('sectionSettings').style.display = 'none';
  hideSectionRenameForm();
  hideSectionMergeForm();
}

function showRenameTaskListForm() {
  hideSectionMergeForm();
  const renameForm = document.getElementById('sectionRenameForm');
  const input = document.getElementById('sectionRenameInput');
  renameForm.style.display = 'flex';
  input.value = settings.currentSection;
  input.focus();
}

function hideSectionRenameForm() {
  document.getElementById('sectionRenameForm').style.display = 'none';
}

function renameTaskListFromInput() {
  const input = document.getElementById('sectionRenameInput');
  const trimmed = input.value.trim();
  if (!trimmed || settings.sections.includes(trimmed) || trimmed === settings.currentSection) {
    alert('有効な名前を入力するか、既存と異なる名前にしてください。');
    return;
  }
  renameTaskList(trimmed);
}

function renameTaskList(newName) {
  const current = settings.currentSection;
  const trimmed = typeof newName === 'string' ? newName.trim() : '';
  if (!trimmed || settings.sections.includes(trimmed) || trimmed === current) {
    alert('有効な名前を入力するか、既存と異なる名前にしてください。');
    return;
  }
  settings.sections = settings.sections.map(section => section === current ? trimmed : section);
  tasks = tasks.map(task => ({ ...task, section: task.section === current ? trimmed : task.section }));
  settings.currentSection = trimmed;
  saveSettingsToStorage();
  saveTasksToStorage();
  renderSectionOptions();
  render();
  hideSectionSettings();
}

function confirmDeleteTaskList() {
  const current = settings.currentSection;
  if (current === 'default') {
    alert('「default」リストは削除できません。');
    return;
  }
  if (!confirm(`タスクリスト「${current}」を削除しますか？ このリスト内のタスクもすべて削除されます。`)) {
    return;
  }
  deleteTaskList();
}

function deleteTaskList() {
  const current = settings.currentSection;
  settings.sections = settings.sections.filter(section => section !== current);
  tasks = tasks.filter(task => task.section !== current);
  settings.currentSection = settings.sections[0] || 'default';
  saveSettingsToStorage();
  saveTasksToStorage();
  renderSectionOptions();
  render();
  hideSectionSettings();
}

function generateLocalShareId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `share-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function shareTaskList() {
  const current = settings.currentSection;
  const sectionTasks = tasks.filter(task => task.section === current);
  let shareId = getShareIdForSection(current);

  const postData = () => {
    fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: shareId, data: { tasks: sectionTasks.map(normalizeTask) } })
    }).then(response => response.json())
      .then(result => {
        if (result && result.success) {
          if (result.id) {
            shareId = result.id;
            setShareIdForSection(current, shareId);
          }
          saveTasksToStorage();
          updateShareInfoDisplay();
          alert('共有に成功しました。');
        } else {
          alert('共有に失敗しました。');
        }
      }).catch(() => {
        alert('共有サーバーへの送信中にエラーが発生しました。');
      });
  };

  const fallbackToLocalShareId = () => {
    shareId = generateLocalShareId();
    setShareIdForSection(current, shareId);
    postData();
  };

  if (!shareId) {
    fetch(`${GAS_URL}?newId=true`)
      .then(response => response.json())
      .then(result => {
        if (result && result.id) {
          shareId = result.id;
          setShareIdForSection(current, shareId);
          postData();
        } else {
          fallbackToLocalShareId();
        }
      }).catch(() => {
        fallbackToLocalShareId();
      });
  } else {
    postData();
  }
}

function loadSharedTaskList() {
  const current = settings.currentSection;
  const shareId = getShareIdForSection(current);
  if (!shareId) {
    alert('このタスクリストはまだ共有されていません。まずは「共有する」を押してください。');
    return;
  }

  fetch(`${GAS_URL}?id=${encodeURIComponent(shareId)}`)
    .then(response => response.json())
    .then(result => {
      if (!result || !result.tasks) {
        alert('共有データが見つかりませんでした。');
        return;
      }
      const updatedTasks = Array.isArray(result.tasks) ? result.tasks.map(normalizeTask) : [];
      tasks = tasks.filter(task => task.section !== current).concat(updatedTasks.map(task => ({ ...task, section: current })));
      saveTasksToStorage();
      renderSectionOptions();
      render();
      alert('最新の共有データを読み込みました。');
    }).catch(() => {
      alert('共有サーバーからの読み込み中にエラーが発生しました。');
    });
}

function initializeSharedSections() {
  updateShareInfoDisplay();
}

function showMergeTaskListForm() {
  hideSectionRenameForm();
  const current = settings.currentSection;
  const targets = settings.sections.filter(section => section !== current);
  if (targets.length === 0) {
    alert('統合先となる他のタスクリストがありません。');
    return;
  }
  const select = document.getElementById('sectionMergeTarget');
  select.innerHTML = '';
  targets.forEach(section => {
    const opt = document.createElement('option');
    opt.value = section;
    opt.textContent = section;
    select.appendChild(opt);
  });
  document.getElementById('sectionMergeForm').style.display = 'flex';
}

function hideSectionMergeForm() {
  document.getElementById('sectionMergeForm').style.display = 'none';
}

function mergeTaskListFromSelect() {
  const current = settings.currentSection;
  const select = document.getElementById('sectionMergeTarget');
  const target = select.value;
  if (!target || target === current) {
    alert('有効な統合先を選択してください。');
    return;
  }
  tasks = tasks.map(task => task.section === current ? { ...task, section: target } : task);
  settings.sections = settings.sections.filter(section => section !== current);
  settings.currentSection = target;
  saveSettingsToStorage();
  saveTasksToStorage();
  renderSectionOptions();
  render();
  hideSectionSettings();
}

function changeSection(section) {
  settings.currentSection = section;
  saveSettingsToStorage();
  render();
}

function showSectionInput() {
  const form = document.getElementById('sectionAddForm');
  form.style.display = 'inline-flex';
  document.getElementById('newSectionName').value = '';
  document.getElementById('newSectionName').focus();
}

function hideSectionInput() {
  document.getElementById('sectionAddForm').style.display = 'none';
}

function createSection() {
  const input = document.getElementById('newSectionName');
  const trimmed = input.value.trim();
  if (!trimmed) return;
  if (settings.sections.includes(trimmed)) {
    alert('同じ名前のセクションは既に存在します。');
    return;
  }
  settings.sections.push(trimmed);
  settings.currentSection = trimmed;
  saveSettingsToStorage();
  renderSectionOptions();
  render();
  hideSectionInput();
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

document.addEventListener('mousemove', event => {
  lastPointerPosition.x = event.clientX;
  lastPointerPosition.y = event.clientY;
  suppressHoverExpansionUntilPointerMove = false;
}, true);

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
      .filter(t => t.section === settings.currentSection && t.deadline && t.completedPages < t.totalPages)
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
  const list = tasks.map((task, i) => ({ ...task, _originalIndex: i }));
  const filtered = list.filter(task => task.section === settings.currentSection && matchesSearch(task, settings.searchQuery));

  return filtered.sort((a, b) => {
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
  const listTasks = tasks.filter(task => task.section === settings.currentSection);
  const allTasksTotalTime = listTasks.reduce((sum, task) => sum + (task.totalPages * task.pageTime), 0);
  const allTasksCompletedTime = listTasks.reduce((sum, task) => sum + (task.completedPages * task.pageTime), 0);

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
    card.dataset.taskIndex = originalIndex;
    card.className = `task-card ${isUrgent ? 'urgent' : ''} ${task.pinned ? 'pinned' : ''} ${isCompleted ? 'completed' : ''} ${currentlyExpandedTaskIndex === originalIndex ? 'expanded' : ''}`;
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

    card.addEventListener('mouseenter', () => {
      if (suppressHoverExpansionUntilPointerMove && currentlyExpandedTaskIndex !== originalIndex) {
        return;
      }
      if (closeExpandedTimeout) {
        clearTimeout(closeExpandedTimeout);
        closeExpandedTimeout = null;
      }
      currentlyExpandedTaskIndex = originalIndex;
    });
    card.addEventListener('mouseleave', () => {
      if (closeExpandedTimeout) {
        clearTimeout(closeExpandedTimeout);
      }
      closeExpandedTimeout = setTimeout(() => {
        const element = document.elementFromPoint(lastPointerPosition.x, lastPointerPosition.y);
        const hoveredCard = element ? element.closest('.task-card') : null;
        if (hoveredCard && hoveredCard.dataset.taskIndex === String(originalIndex)) {
          return;
        }
        if (currentlyExpandedTaskIndex === originalIndex) {
          currentlyExpandedTaskIndex = null;
          render();
        }
      }, 50);
    });
  });

  // 進捗率
  const targetPercent = totalRequiredTime > 0 ? (totalCompletedTime / totalRequiredTime) * 100 : 0;
  const clampedTarget = Math.min(100, Math.max(0, targetPercent));

  document.getElementById('progressBar').style.width = clampedTarget + '%';
  animatePercentText(clampedTarget);
  document.getElementById('summaryDisplay').innerText = `タスクリスト「${settings.currentSection}」総作業時間: ${formatMinutes(allTasksTotalTime)} / 完了済み時間: ${formatMinutes(allTasksCompletedTime)}`;
  updateDisplay();
}

function formatMinutes(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
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
    currentlyExpandedTaskIndex = index;
    suppressHoverExpansionUntilPointerMove = true;
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
    tasks.push({ name, totalPages, completedPages: 0, unit, pageTime, deadline, pinned, section: settings.currentSection, shareId: '' });
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
  currentlyExpandedTaskIndex = index;
  suppressHoverExpansionUntilPointerMove = true;
  saveTasksToStorage();
  render();
}

// 初期化
document.getElementById('displayModeSelect').value = settings.displayMode;
document.getElementById('sortSelect').value = settings.sortMode;
document.getElementById('taskSearch').value = settings.searchQuery || '';
document.getElementById('percentDisplay').innerText = '0.0%';
document.getElementById('progressBar').style.width = '0%';
renderSectionOptions();
initializeSharedSections();
render();
