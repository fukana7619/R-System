const gasUrl = localStorage.getItem('gas_url');
const userId = localStorage.getItem('user_id');
const password = localStorage.getItem('user_password');

if (!gasUrl || !userId || !password) {
  location.href = 'user.html';
}

let cachedData = []; 
let chartInstance = null; // グラフの重複描画を防ぐための変数

// ==========================================
// 💡 ローディング画面の表示・非表示
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
// 1. 初期化処理（ページ読み込み時）
// ==========================================
window.onload = function() {
  const localCache = localStorage.getItem(`cache_${userId}`);
  
  if (localCache) {
    cachedData = JSON.parse(localCache);
    
    // 1. 検索条件（チェックボックス等）の選択肢をデータから自動生成
    buildFilterOptions();
    
    // 2. デフォルトで全データを検索・集計して表示
    applyFilters();
  } else {
    alert("データがありません。収支簿ページ（index.html）で「最新の状態に更新」を一度押してください。");
    location.href = 'index.html';
  }
};

// 期間指定のリセット
function clearDateFilter() {
  document.getElementById('filter-start-date').value = '';
  document.getElementById('filter-end-date').value = '';
}

// ==========================================
// 2. フィルター選択肢（チェックボックス）の自動生成
// ==========================================
function buildFilterOptions() {
  const origins = new Set();
  const usages = new Set();

  // 2行目（インデックス1）からデータをスキャンして重複のないリストを作る
  for (let i = 1; i < cachedData.length; i++) {
    const row = cachedData[i];
    if (row.length < 4) continue;
    if (row[1]) origins.add(row[1].trim());
    if (row[4]) usages.add(row[4].trim());
  }

  // 決済手段のチェックボックス生成
  const originContainer = document.getElementById('origin-checkboxes');
  originContainer.innerHTML = '';
  origins.forEach(name => {
    const label = document.createElement('label');
    label.className = 'checkbox-item'; // 💡 ここで新スタイルを適用！
    label.innerHTML = `<input type="checkbox" value="${name}" name="origin-check" checked> <span>${name}</span>`;
    originContainer.appendChild(label);
  });

  // 用途のチェックボックス生成
  const usageContainer = document.getElementById('usage-checkboxes');
  usageContainer.innerHTML = '';
  usages.forEach(name => {
    const label = document.createElement('label');
    label.className = 'checkbox-item'; // 💡 ここで新スタイルを適用！
    label.innerHTML = `<input type="checkbox" value="${name}" name="usage-check" checked> <span>${name}</span>`;
    usageContainer.appendChild(label);
  });
}

// ==========================================
// 3. 検索・絞り込み ＆ 統計・グラフの連動処理
// ==========================================
function applyFilters() {
  showLoading();

  // --- HTMLから検索条件を取得 ---
  const startDateStr = document.getElementById('filter-start-date').value;
  const endDateStr = document.getElementById('filter-end-date').value;
  const minAmount = parseInt(document.getElementById('filter-min-amount').value) || 0;

  // チェックされている決済手段・用途のリストを作る
  const checkedOrigins = Array.from(document.querySelectorAll('input[name="origin-check"]:checked')).map(el => el.value);
  const checkedUsages = Array.from(document.querySelectorAll('input[name="usage-check"]:checked')).map(el => el.value);

  // --- データ絞り込み＆集計の変数 ---
  const filteredRecords = [];
  let totalIncome = 0;
  let totalExpense = 0;

  // グラフ・統計用の月別集計コンテナ
  const monthlyData = {};
  let totalExpenseAllTime = 0;
  let thisMonthIncome = 0;
  let thisMonthExpense = 0;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  // --- ループ処理 ---
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

    // 1. 決済手段の絞り込み
    if (checkedOrigins.length > 0 && !checkedOrigins.includes(origin)) continue;

    // 2. 用途の絞り込み
    if (checkedUsages.length > 0 && !checkedUsages.includes(usage)) continue;

    // 3. 期間の絞り込み
    if (startDateStr && new Date(startDateStr) > rowDate) continue;
    if (endDateStr) {
      const endLimit = new Date(endDateStr);
      endLimit.setHours(23, 59, 59, 999); // 選択された日の最後まで含める
      if (rowDate > endLimit) continue;
    }

    // 4. 金額の絞り込み（収入か支出のどちらかがしきい値以上）
    if (income < minAmount && expense < minAmount) continue;

    // --- すべての条件をクリアしたデータのみ以下に進む ---
    
    // 一覧用
    filteredRecords.push({ date: dateStr, origin, income, expense, usage, content });
    totalIncome += income;
    totalExpense += expense;

    // 月別集計（グラフ用）
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { income: 0, expense: 0 };
    }
    monthlyData[monthKey].income += income;
    monthlyData[monthKey].expense += expense;

    // 全期間支出（月平均用）
    totalExpenseAllTime += expense;

    // 今月分の集計
    if (rowYear === currentYear && rowMonth === currentMonth) {
      thisMonthIncome += income;
      thisMonthExpense += expense;
    }
  }

  // --- 📝 1. 履歴テーブルの描画 ---
  // 日付の新しい順に並び替え
  filteredRecords.sort((a, b) => b.date.localeCompare(a.date));

  const tbody = document.querySelector('#history-table tbody');
  tbody.innerHTML = '';

  filteredRecords.forEach(row => {
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
  });

  // 件数と合計金額の更新
  document.getElementById('match-count').innerText = filteredRecords.length;
  document.getElementById('sum-income').innerText = `${totalIncome.toLocaleString()}円`;
  document.getElementById('sum-expense').innerText = `${totalExpense.toLocaleString()}円`;


  // --- 🧮 2. 統計情報（旧dashboard）の計算と表示 ---
  // 1. 今月の1日あたりの平均支出
  const dayAvg = Math.round(thisMonthExpense / currentDay);
  const dayAvgEl = document.getElementById('day-avg');
  if (dayAvgEl) dayAvgEl.innerText = `${dayAvg.toLocaleString()}円`;

  // 2. 1ヶ月あたりの平均支出
  const totalMonths = Object.keys(monthlyData).length || 1;
  const monthAvg = Math.round(totalExpenseAllTime / totalMonths);
  const monthAvgEl = document.getElementById('month-avg');
  if (monthAvgEl) monthAvgEl.innerText = `${monthAvg.toLocaleString()}円`;

  // 3. 今月の総計
  const mIncomeEl = document.getElementById('month-total-income');
  const mExpenseEl = document.getElementById('month-total-expense');
  if (mIncomeEl) mIncomeEl.innerText = `${thisMonthIncome.toLocaleString()}円`;
  if (mExpenseEl) mExpenseEl.innerText = `${thisMonthExpense.toLocaleString()}円`;


  // --- 📊 3. グラフ（旧dashboard）の描画 ---
  const chartCanvas = document.getElementById('monthlyChart');
  if (chartCanvas) {
    const sortedMonthKeys = Object.keys(monthlyData).sort();
    const labels = sortedMonthKeys.map(key => {
      const [y, m] = key.split('-');
      return `${parseInt(m)}月`;
    });
    const incomeDataset = sortedMonthKeys.map(key => monthlyData[key].income);
    const expenseDataset = sortedMonthKeys.map(key => monthlyData[key].expense);

    const ctx = chartCanvas.getContext('2d');
    
    // すでにグラフが存在していたら一度破棄する（Chart.jsの仕様上のバグ回避）
    if (chartInstance) {
      chartInstance.destroy();
    }

    // 新しくグラフを作成
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

  hideLoading();
}
