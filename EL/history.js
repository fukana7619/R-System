const gasUrl = localStorage.getItem('gas_url');
const userId = localStorage.getItem('user_id');
const password = localStorage.getItem('user_password');

if (!gasUrl || !userId || !password) {
  location.href = 'user.html';
}

let cachedData = []; 
let chartInstance = null; 

// 📄 100件分割表示用の変数
let globalFilteredRecords = []; // 絞り込みを通過した全データを受け止める
let currentDisplayedCount = 0;   // 現在画面に表示されている件数
const PAGE_SIZE = 100;           // 1回あたりの表示件数

// ==========================================
// 💡 ローディング画面の制御
// ==========================================
function showLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ==========================================
// 📁 折りたたみの制御（開閉）
// ==========================================
function toggleSection(type, forceOpen = false) {
  const header = document.getElementById(`${type}-header`);
  const content = document.getElementById(`${type}-content`);
  if (!header || !content) return;

  if (forceOpen) {
    header.classList.add('open');
    content.classList.add('open');
  } else {
    header.classList.toggle('open');
    content.classList.toggle('open');
  }
}

// ==========================================
// 1. 初期化処理（ページ読み込み時）
// ==========================================
window.onload = function() {
  const localCache = localStorage.getItem(`cache_${userId}`);
  
  if (localCache) {
    cachedData = JSON.parse(localCache);
    buildFilterOptions();
    
    // 💡 初回ロード時は既定の「畳んだ状態」のままデータ計算だけ行う
    applyFilters(false);
  } else {
    alert("データがありません。収支簿ページ（index.html）で「最新の状態に更新」を一度押してください。");
    location.href = 'index.html';
  }
};

function clearDateFilter() {
  document.getElementById('filter-start-date').value = '';
  document.getElementById('filter-end-date').value = '';
}

// フィルター選択肢自動生成
function buildFilterOptions() {
  const origins = new Set();
  const usages = new Set();

  for (let i = 1; i < cachedData.length; i++) {
    const row = cachedData[i];
    if (row.length < 4) continue;
    if (row[1]) origins.add(row[1].trim());
    if (row[4]) usages.add(row[4].trim());
  }

  const originContainer = document.getElementById('origin-checkboxes');
  originContainer.innerHTML = '';
  origins.forEach(name => {
    const label = document.createElement('label');
    label.className = 'checkbox-item';
    label.innerHTML = `<input type="checkbox" value="${name}" name="origin-check" checked> <span>${name}</span>`;
    originContainer.appendChild(label);
  });

  const usageContainer = document.getElementById('usage-checkboxes');
  usageContainer.innerHTML = '';
  usages.forEach(name => {
    const label = document.createElement('label');
    label.className = 'checkbox-item';
    label.innerHTML = `<input type="checkbox" value="${name}" name="usage-check" checked> <span>${name}</span>`;
    usageContainer.appendChild(label);
  });
}

// ==========================================
// 3. 検索・絞り込みメインロジック
// ==========================================
function applyFilters(isUserClick = false) {
  // ユーザーがボタンを押した場合はローディングの円を回す
  if (isUserClick) {
    showLoading();
  }

  // 非同期（setTimeout）にして、確実にローディング円の描画をブラウザに挟み込む
  setTimeout(() => {
    const startDateStr = document.getElementById('filter-start-date').value;
    const endDateStr = document.getElementById('filter-end-date').value;
    const minAmount = parseInt(document.getElementById('filter-min-amount').value) || 0;

    const checkedOrigins = Array.from(document.querySelectorAll('input[name="origin-check"]:checked')).map(el => el.value);
    const checkedUsages = Array.from(document.querySelectorAll('input[name="usage-check"]:checked')).map(el => el.value);

    globalFilteredRecords = [];
    let totalIncome = 0;
    let totalExpense = 0;

    const monthlyData = {};
    let totalExpenseAllTime = 0;
    let thisMonthIncome = 0;
    let thisMonthExpense = 0;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    for (let i = 1; i < cachedData.length; i++) {
      const row = cachedData[i];
      if (row.length < 4) continue;

      const dateStr = row[0];
      const origin = row[1] || '';
      const income = parseInt(row[2]) || 0;
      const expense = parseInt(row[3]) || 0;
      const usage = row[4] || '';
      const content = row[5] || '';

      if (!dateStr) continue;

      const rowDate = new Date(dateStr);
      const rowYear = rowDate.getFullYear();
      const rowMonth = rowDate.getMonth() + 1;
      const monthKey = `${rowYear}-${String(rowMonth).padStart(2, '0')}`;

      if (checkedOrigins.length > 0 && !checkedOrigins.includes(origin)) continue;
      if (checkedUsages.length > 0 && !checkedUsages.includes(usage)) continue;

      if (startDateStr && new Date(startDateStr) > rowDate) continue;
      if (endDateStr) {
        const endLimit = new Date(endDateStr);
        endLimit.setHours(23, 59, 59, 999);
        if (rowDate > endLimit) continue;
      }

      if (income < minAmount && expense < minAmount) continue;

      globalFilteredRecords.push({ date: dateStr, origin, income, expense, usage, content });
      totalIncome += income;
      totalExpense += expense;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expense: 0 };
      }
      monthlyData[monthKey].income += income;
      monthlyData[monthKey].expense += expense;

      totalExpenseAllTime += expense;

      if (rowYear === currentYear && rowMonth === currentMonth) {
        thisMonthIncome += income;
        thisMonthExpense += expense;
      }
    }

    // 最新順に並び替え
    globalFilteredRecords.sort((a, b) => b.date.localeCompare(a.date));

    // 100件表示カウンターを初期化してテーブルをクリア
    currentDisplayedCount = 0;
    document.querySelector('#history-table tbody').innerHTML = '';

    // 最初の100件を描画
    loadMoreRecords();

    // ヘッダー情報の更新
    document.getElementById('match-count').innerText = globalFilteredRecords.length;
    document.getElementById('sum-income').innerText = `${totalIncome.toLocaleString()}円`;
    document.getElementById('sum-expense').innerText = `${totalExpense.toLocaleString()}円`;

    // 統計情報の計算
    const dayAvg = Math.round(thisMonthExpense / currentDay);
    if (document.getElementById('day-avg')) document.getElementById('day-avg').innerText = `${dayAvg.toLocaleString()}円`;

    const totalMonths = Object.keys(monthlyData).length || 1;
    const monthAvg = Math.round(totalExpenseAllTime / totalMonths);
    if (document.getElementById('month-avg')) document.getElementById('month-avg').innerText = `${monthAvg.toLocaleString()}円`;

    if (document.getElementById('month-total-income')) document.getElementById('month-total-income').innerText = `${thisMonthIncome.toLocaleString()}円`;
    if (document.getElementById('month-total-expense')) document.getElementById('month-total-expense').innerText = `${thisMonthExpense.toLocaleString()}円`;

    // 📊 グラフ描画
    renderChart(monthlyData);

    // 💡 ユーザーが能動的に「検索する」を押した場合、アコーディオンを自動展開！
    if (isUserClick) {
      toggleSection('graph', true);
      toggleSection('list', true);
      hideLoading(); // 処理が終わったら円を消す
    }
  }, 100); // 100ミリ秒の猶予でローディング表示を確定させる
}

// ==========================================
// 📄 安全に100件ずつデータを追加描画する関数
// ==========================================
function loadMoreRecords() {
  const tbody = document.querySelector('#history-table tbody');
  const nextLimit = Math.min(currentDisplayedCount + PAGE_SIZE, globalFilteredRecords.length);

  for (let i = currentDisplayedCount; i < nextLimit; i++) {
    const row = globalFilteredRecords[i];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size: 0.75rem; color: #64748b;">${row.date}</td>
      <td style="font-weight:bold; color:#475569;">${row.origin}</td>
      <td class="income-text">${row.income > 0 ? row.income.toLocaleString() : ''}</td>
      <td class="expense-text">${row.expense > 0 ? row.expense.toLocaleString() : ''}</td>
      <td>
        <div style="font-weight:600; color:var(--primary-color);">${row.usage}</div>
        <div style="font-size:0.75rem; color:#64748b;">${row.content}</div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  currentDisplayedCount = nextLimit;

  // まだ後ろに未表示データがあれば「追加ボタン」を出し、なければ隠す
  const btnContainer = document.getElementById('load-more-container');
  if (currentDisplayedCount < globalFilteredRecords.length) {
    btnContainer.style.display = 'block';
  } else {
    btnContainer.style.display = 'none';
  }
}

// グラフ描画サブ関数
function renderChart(monthlyData) {
  const chartCanvas = document.getElementById('monthlyChart');
  if (!chartCanvas) return;

  const sortedMonthKeys = Object.keys(monthlyData).sort();
  const labels = sortedMonthKeys.map(key => {
    const [y, m] = key.split('-');
    return `${parseInt(m)}月`;
  });
  const incomeDataset = sortedMonthKeys.map(key => monthlyData[key].income);
  const expenseDataset = sortedMonthKeys.map(key => monthlyData[key].expense);

  const ctx = chartCanvas.getContext('2d');
  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '収入',
          data: incomeDataset,
          backgroundColor: 'rgba(15, 118, 110, 0.7)',
          borderColor: '#0f766e',
          borderWidth: 1
        },
        {
          label: '支出',
          data: expenseDataset,
          backgroundColor: 'rgba(185, 28, 28, 0.7)',
          borderColor: '#b91c1c',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) { return value.toLocaleString() + '円'; }
          }
        }
      }
    }
  });
}
