// ===================================
// 💾 LocalDB (localStorage) & データ管理
// ===================================
const STORAGE_KEY = 'homework_progress_tasks_v1';

// 初期状態のタスク配列
let tasks = loadTasks();

let currentPercent = 0;
let animationFrameId = null;

function loadTasks() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse tasks from localStorage', e);
    }
  }
  return []; // 初期状態は空配列
}

function saveTasksToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// ===================================
// 🔋 電池残量表示機能
// ===================================
function initBattery() {
  if ('getBattery' in navigator) {
    navigator.getBattery().then(battery => {
      function updateBatteryInfo() {
        const level = Math.floor(battery.level * 100);
        const isCharging = battery.charging ? '⚡' : '🔋';
        document.getElementById('batteryDisplay').innerText = `${isCharging} ${level}%`;
      }
      
      updateBatteryInfo();
      battery.addEventListener('levelchange', updateBatteryInfo);
      battery.addEventListener('chargingchange', updateBatteryInfo);
    });
  } else {
    document.getElementById('batteryDisplay').innerText = '🔋 --%';
  }
}
initBattery();

// ===================================
// ⏰ リアルタイム時計
// ===================================
function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const clockElement = document.getElementById('clockDisplay');
  if (clockElement) {
    clockElement.innerText = `${hours}:${minutes}:${seconds}`;
  }
}
setInterval(updateClock, 1000);
updateClock();

// ===================================
// 💤 放置検知
// ===================================
let idleTimer = null;
const IDLE_TIMEOUT = 5000;

function resetIdleTimer() {
  document.body.classList.remove('idle-mode');
  
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    document.body.classList.add('idle-mode');
  }, IDLE_TIMEOUT);
}

['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(eventType => {
  window.addEventListener(eventType, resetIdleTimer, true);
});
resetIdleTimer();

// ===================================
// 🧮 計算 & レンダリング
// ===================================
function floorToOneDecimal(num) {
  return (Math.floor(num * 10) / 10).toFixed(1);
}

function render() {
  const taskListEl = document.getElementById('taskList');
  taskListEl.innerHTML = '';

  let totalRequiredTime = 0;
  let totalCompletedTime = 0;

  tasks.forEach((task, index) => {
    // 時間の計算（各タスクの合計分 = ページ数 * 1pあたりの時間）
    const taskTotalTime = task.totalPages * task.pageTime;
    const taskCompletedTime = task.completedPages * task.pageTime;

    totalRequiredTime += taskTotalTime;
    totalCompletedTime += taskCompletedTime;

    // タスクカードの動的作成
    const card = document.createElement('div');
    card.className = 'task-card';
    card.innerHTML = `
      <div class="task-title">
        <span>${escapeHtml(task.name)}</span>
        <div>
          <span class="page-count">${task.completedPages} / ${task.totalPages} p</span>
          <button class="btn-edit" onclick="openTaskModal(${index})">⚙️</button>
        </div>
      </div>
      <div class="task-info">1pあたり ${task.pageTime}分 (計 ${taskTotalTime}分)</div>
      <div class="controls">
        <button class="btn-sub" onclick="updatePages(${index}, -1)">- 1p</button>
        <button class="btn-add" onclick="updatePages(${index}, 1)">+ 1p 完了</button>
      </div>
    `;
    taskListEl.appendChild(card);
  });

  // 全体進捗率の計算
  let targetPercent = 0;
  if (totalRequiredTime > 0) {
    targetPercent = (totalCompletedTime / totalRequiredTime) * 100;
  }
  const clampedTarget = Math.min(100, Math.max(0, targetPercent));

  // バーの伸長
  document.getElementById('progressBar').style.width = clampedTarget + '%';

  // 数値アニメーション
  animatePercentText(clampedTarget);
}

function animatePercentText(target) {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  function step() {
    const diff = target - currentPercent;
    
    if (Math.abs(diff) < 0.02) {
      currentPercent = target;
      document.getElementById('percentDisplay').innerText = floorToOneDecimal(currentPercent) + '%';
      animationFrameId = null;
    } else {
      currentPercent += diff * 0.03; 
      document.getElementById('percentDisplay').innerText = floorToOneDecimal(currentPercent) + '%';
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

// XSS防止用エスケープ関数
function escapeHtml(str) {
  return str.replace(/[&< me"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

// ===================================
// 📝 モーダル & タスク操作機能
// ===================================
function openTaskModal(index = null) {
  const modal = document.getElementById('taskModal');
  const title = document.getElementById('modalTitle');
  const btnDelete = document.getElementById('btnDeleteTask');

  if (index !== null) {
    // 編集モード
    const task = tasks[index];
    title.innerText = '課題の編集';
    document.getElementById('taskId').value = index;
    document.getElementById('taskName').value = task.name;
    document.getElementById('totalPages').value = task.totalPages;
    document.getElementById('pageTime').value = task.pageTime;
    btnDelete.style.display = 'block';
  } else {
    // 新規作成モード
    title.innerText = '課題の追加';
    document.getElementById('taskId').value = '';
    document.getElementById('taskForm').reset();
    btnDelete.style.display = 'none';
  }

  modal.classList.add('active');
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.remove('active');
}

function saveTask(e) {
  e.preventDefault();

  const taskId = document.getElementById('taskId').value;
  const name = document.getElementById('taskName').value.trim();
  const totalPages = parseInt(document.getElementById('totalPages').value, 10);
  const pageTime = parseInt(document.getElementById('pageTime').value, 10);

  if (!name || isNaN(totalPages) || isNaN(pageTime)) return;

  if (taskId !== '') {
    // 既存更新
    const idx = parseInt(taskId, 10);
    tasks[idx].name = name;
    tasks[idx].totalPages = totalPages;
    tasks[idx].pageTime = pageTime;
    // 完了ページ数が総ページ数を超えないよう補正
    if (tasks[idx].completedPages > totalPages) {
      tasks[idx].completedPages = totalPages;
    }
  } else {
    // 新規追加
    tasks.push({
      name: name,
      totalPages: totalPages,
      completedPages: 0,
      pageTime: pageTime
    });
  }

  saveTasksToStorage();
  closeTaskModal();
  render();
}

function deleteTask() {
  const taskId = document.getElementById('taskId').value;
  if (taskId === '') return;

  if (confirm('この課題を削除しますか？')) {
    const idx = parseInt(taskId, 10);
    tasks.splice(idx, 1);
    saveTasksToStorage();
    closeTaskModal();
    render();
  }
}

// 初期実行（0%からスタート）
document.getElementById('percentDisplay').innerText = '0.0%';
document.getElementById('progressBar').style.width = '0%';
render();
