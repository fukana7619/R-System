const gasUrl = localStorage.getItem('gas_url');
const userId = localStorage.getItem('user_id');
const password = localStorage.getItem('user_password');

if (!gasUrl || !userId || !password) {
  location.href = 'user.html';
}

let cachedData = []; 
let editIndex = -1; 

// ==========================================
// 1. ライフサイクル & 初期化処理
// ==========================================
window.onload = function() {
  document.getElementById('display-user').innerText = userId;
  
  const today = new Date();
  document.getElementById('date').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // 1. まずはキャッシュから「一瞬で」画面を組み立てる（表示速度0秒）
  const localCache = localStorage.getItem(`cache_${userId}`);
  if (localCache) {
    cachedData = JSON.parse(localCache);
    updateDashboardAndTable(true);
  }

  // 2. バックグラウンド（裏側）でデータを最新の状態に更新しにいく
  fetchDataAndCalculate(false); 
};

function logout() {
  if (confirm('ログアウトしますか？')) {
    localStorage.clear();
    location.href = 'user.html';
  }
}

function toggleInput(prefix) {
  const select = document.getElementById(`${prefix}-select`);
  const textInput = document.getElementById(`${prefix}-text`);
  if (select.value === '__other__') {
    textInput.style.display = 'block';
    textInput.focus();
  } else {
    textInput.style.display = 'none';
    textInput.value = '';
  }
}

// ウィンドウサイズが変更されたら、自動で履歴の表示件数を再計算して描画し直す
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    updateDashboardAndTable(false);
  }, 100); // 頻繁な再描画を防ぐデバウンス処理
});

// ==========================================
// 2. API（GAS）連携処理
// ==========================================
async function fetchVersion() {
  const versionTag = document.getElementById('version-tag');
  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'export', sheet: 'info' })
    });
    const csvText = await response.text();
    if (csvText.includes('Sheet not found') || csvText.trim() === '') return;
    
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length > 0) {
      const firstRow = lines[0].split(',');
      if (firstRow[0] === 'バージョン' && firstRow[1]) {
        versionTag.innerText = `Ver ${firstRow[1].trim()}`;
        versionTag.style.display = 'inline-block';
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function fetchDataAndCalculate(showNotification = false) {
  const statusDiv = document.getElementById('status');
  
  if (showNotification) { 
    statusDiv.className = ''; 
    statusDiv.innerText = 'データを更新中...'; 
  }

  try {
    await fetchVersion();
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'export', sheet: userId })
    });

    const csvText = await response.text();
    if (csvText.includes('Sheet not found')) {
      statusDiv.className = 'error';
      statusDiv.innerText = 'シートが存在しません。ユーザー名のシートを作成してください。';
      return;
    }

    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    cachedData = lines.map(line => line.split(','));
    localStorage.setItem(`cache_${userId}`, JSON.stringify(cachedData));

    // 最新データで画面を再描画
    updateDashboardAndTable(true);

    if (showNotification) {
      statusDiv.className = 'success';
      statusDiv.innerText = '最新の状態に更新しました。';
      setTimeout(() => { statusDiv.innerText = ''; }, 2000);
    }
  } catch (err) {
    console.error(err);
    if (showNotification) {
      statusDiv.className = 'error';
      statusDiv.innerText = 'データの更新に失敗しました。';
    }
  }
}

// ==========================================
// 3. UI（プルダウン・ダッシュボード）生成処理
// ==========================================
function buildDynamicSelect(prefix, columnIndex, allRecords) {
  const select = document.getElementById(`${prefix}-select`);
  const textInput = document.getElementById(`${prefix}-text`);
  const currentValue = select.value;

  const counts = {};
  allRecords.forEach(r => {
    const val = r.rawRow[columnIndex];
    if (val && val.trim() !== '') {
      counts[val] = (counts[val] || 0) + 1;
    }
  });

  const sortedOptions = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  select.innerHTML = '<option value="__other__">その他（自由入力）</option>';
  sortedOptions.forEach(opt => {
    const optionEl = document.createElement('option');
    optionEl.value = opt;
    optionEl.innerText = `${opt} (${counts[opt]}回)`;
    select.appendChild(optionEl);
  });

  if (editIndex === -1 && (!currentValue || currentValue === '__other__' && textInput.value === '')) {
    if (sortedOptions.length > 0) {
      select.value = sortedOptions[0];
      textInput.style.display = 'none';
      textInput.value = '';
    } else {
      select.value = '__other__';
      textInput.style.display = 'block';
    }
  } else if (currentValue && currentValue !== '__other__') {
    if (sortedOptions.includes(currentValue)) {
      select.value = currentValue;
      textInput.style.display = 'none';
    } else {
      select.value = '__other__';
      textInput.style.display = 'block';
      textInput.value = currentValue;
    }
  } else {
    textInput.style.display = 'block';
  }
}

function buildWalletFilter(allRecords) {
  const filterSelect = document.getElementById('wallet-filter');
  const currentValue = filterSelect.value;

  const uniqueWallets = [];
  for (let i = allRecords.length - 1; i >= 0; i--) {
    const wallet = allRecords[i].origin;
    if (wallet && wallet.trim() !== '' && !uniqueWallets.includes(wallet)) {
      uniqueWallets.push(wallet);
    }
  }

  filterSelect.innerHTML = '<option value="__all__">✨ 全体（全財産）</option>';
  uniqueWallets.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w;
    opt.innerText = `👛 ${w}`;
    filterSelect.appendChild(opt);
  });

  if (uniqueWallets.includes(currentValue)) {
    filterSelect.value = currentValue;
  } else {
    filterSelect.value = '__all__';
  }
}

function updateDashboardAndTable(shouldRebuildFilter = false) {
  let totalIncome = 0, totalExpense = 0, thisMonthIncome = 0, thisMonthExpense = 0;
  const now = new Date(), currentYear = now.getFullYear(), currentMonth = now.getMonth() + 1; 

  const allRecords = [];

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

    allRecords.push({ originalIndex: i, date: dateStr, origin, income, expense, usage, content, rawRow: row });
  }

  if (shouldRebuildFilter) {
    buildWalletFilter(allRecords);
  }

  const selectedWallet = document.getElementById('wallet-filter').value;

  if (selectedWallet === '__all__') {
    document.getElementById('balance-title').innerText = '現在の残高';
    document.getElementById('monthly-title').innerText = '今月の収支合計';
  } else {
    document.getElementById('balance-title').innerText = `「${selectedWallet}」の残高`;
    document.getElementById('monthly-title').innerText = `「${selectedWallet}」の今月収支`;
  }

  const filteredRecords = [];

  allRecords.forEach(row => {
    if (selectedWallet === '__all__' || row.origin === selectedWallet) {
      totalIncome += row.income;
      totalExpense += row.expense;

      const rowDate = new Date(row.date);
      if (rowDate.getFullYear() === currentYear && (rowDate.getMonth() + 1) === currentMonth) {
        thisMonthIncome += row.income;
        thisMonthExpense += row.expense;
      }

      filteredRecords.push(row);
    }
  });

  document.getElementById('current-balance').innerText = `${(totalIncome - totalExpense).toLocaleString()}円`;
  const net = thisMonthIncome - thisMonthExpense;
  document.getElementById('monthly-expense').innerText = `${net > 0 ? '+' : ''}${net.toLocaleString()}円`;

  buildDynamicSelect('origin', 1, allRecords);
  buildDynamicSelect('usage', 4, allRecords);
  buildDynamicSelect('content', 5, allRecords);

  const tbody = document.querySelector('#history-table tbody');
  tbody.innerHTML = '';

  filteredRecords.sort((a, b) => b.date.localeCompare(a.date));

// ==========================================
  // 💡 表示件数の動的自動計算ロジック（修正版）
  // ==========================================
  let displayLimit = 5; // 縦並び（スマホ）の時は5件固定

  // 画面幅が900px以上（横並びPCモード）のときのみ動的計算を行う
  if (window.innerWidth > 900) {
    const leftCol = document.querySelector('.left-col');
    const tableContainer = document.querySelector('.table-container');
    const rightCard = document.querySelector('.right-col .card');

    if (leftCol && tableContainer && rightCard) {
      // 1. 左側カード全体の底辺Y座標
      const leftBottom = leftCol.getBoundingClientRect().bottom;
      
      // 2. 右側テーブルコンテナの上辺Y座標
      const containerTop = tableContainer.getBoundingClientRect().top;

      // 3. 右側カードの下側余白（padding-bottom + borderなど）を考慮
      // getComputedStyleを使って正確なpaddingを取得
      const rightCardStyle = window.getComputedStyle(rightCard);
      const paddingBottom = parseFloat(rightCardStyle.paddingBottom) || 20;

      // 履歴テーブル本体（thead+tbody）が使える純粋な最大高さを計算
      const availableHeight = (leftBottom - containerTop) - paddingBottom;

      // テーブルのヘッダー（thead）の実際の高さ: 約45px
      // 「過去の合算」行（.summary-row）の実際の高さ: 約45px
      // 合計で約90pxをあらかじめキープ
      const reservedHeight = 90; 
      const remainingHeight = availableHeight - reservedHeight;

      // データ行の1行あたりの実際の高さ（日付の改行や用途/内容の2行表示を考慮すると約54px）
      const rowHeight = 54; 

      if (remainingHeight > 0) {
        // 入る最大件数を計算（最低3件保証）
        displayLimit = Math.max(3, Math.floor(remainingHeight / rowHeight));
      }
    }
  }

  const latestRecords = filteredRecords.slice(0, displayLimit);
  const olderRecords = filteredRecords.slice(displayLimit);

  latestRecords.forEach(row => {
    const tr = document.createElement('tr');
    const displayDate = row.date.replace(' ', '<br>');
    
    tr.innerHTML = `
      <td style="font-size: 0.75rem; line-height: 1.2; color: #64748b;">${displayDate}</td>
      <td style="font-weight:bold; color:#475569;">${row.origin}</td>
      <td class="income-text">${row.income > 0 ? row.income.toLocaleString() : ''}</td>
      <td class="expense-text">${row.expense > 0 ? row.expense.toLocaleString() : ''}</td>
      <td>
        <div style="font-weight:600; color:var(--primary-color);">${row.usage}</div>
        <div style="font-size:0.75rem; color:#64748b;">${row.content}</div>
      </td>
      <td style="text-align: center; white-space: nowrap;">
        <button class="action-btn edit-btn" onclick="startEdit(${row.originalIndex})">修正</button>
        <button class="action-btn delete-btn" onclick="deleteRecord(${row.originalIndex})">削除</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (olderRecords.length > 0) {
    let olderIncomeSum = 0, olderExpenseSum = 0;
    olderRecords.forEach(row => { olderIncomeSum += row.income; olderExpenseSum += row.expense; });

    const tr = document.createElement('tr');
    tr.className = 'summary-row';
    tr.innerHTML = `
      <td>-</td><td>-</td>
      <td class="income-text">${olderIncomeSum > 0 ? olderIncomeSum.toLocaleString() : ''}</td>
      <td class="expense-text">${olderExpenseSum > 0 ? olderExpenseSum.toLocaleString() : ''}</td>
      <td>過去データの合算</td><td></td>
    `;
    tbody.appendChild(tr);
  }
}

function getInputValue(prefix) {
  const select = document.getElementById(`${prefix}-select`);
  if (select.value === '__other__') {
    return document.getElementById(`${prefix}-text`).value.trim().replace(/,/g, '，');
  }
  return select.value;
}

// ==========================================
// 4. データ作成・編集・削除処理
// ==========================================
function startEdit(index) {
  editIndex = index;
  const row = cachedData[index];

  document.getElementById('date').value = row[0].split(' ')[0];
  
  const originSelect = document.getElementById('origin-select');
  const originText = document.getElementById('origin-text');
  if ([...originSelect.options].some(o => o.value === row[1])) {
    originSelect.value = row[1];
    originText.style.display = 'none';
  } else {
    originSelect.value = '__other__';
    originText.style.display = 'block';
    originText.value = row[1] || '';
  }

  document.getElementById('income').value = row[2] || '';
  document.getElementById('expense').value = row[3] || '';

  const usageSelect = document.getElementById('usage-select');
  const usageText = document.getElementById('usage-text');
  if ([...usageSelect.options].some(o => o.value === row[4])) {
    usageSelect.value = row[4];
    usageText.style.display = 'none';
  } else {
    usageSelect.value = '__other__';
    usageText.style.display = 'block';
    usageText.value = row[4] || '';
  }

  const contentSelect = document.getElementById('content-select');
  const contentText = document.getElementById('content-text');
  if ([...contentSelect.options].some(o => o.value === row[5])) {
    contentSelect.value = row[5];
    contentText.style.display = 'none';
  } else {
    contentSelect.value = '__other__';
    contentText.style.display = 'block';
    contentText.value = row[5] || '';
  }

  document.getElementById('form-title').innerText = '収支の修正';
  document.getElementById('submit-button').innerText = '変更を保存する';
  document.getElementById('cancel-button').style.display = 'block';
  document.getElementById('form-title').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  editIndex = -1;
  document.getElementById('income').value = '';
  document.getElementById('expense').value = '';
  
  ['origin', 'usage', 'content'].forEach(p => {
    document.getElementById(`${p}-select`).value = ''; 
    document.getElementById(`${p}-text`).value = '';
  });

  document.getElementById('form-title').innerText = '収支の入力';
  document.getElementById('submit-button').innerText = '記録する';
  document.getElementById('cancel-button').style.display = 'none';
  updateDashboardAndTable();
}

async function syncLocalDbToSpreadsheet() {
  const csvContent = cachedData.map(r => r.join(',')).join('\n');
  const response = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'import', sheet: userId, value1: csvContent })
  });
  if (await response.text() !== 'OK') throw new Error('Sync failed');
}

async function deleteRecord(index) {
  if (!confirm(`この記録を本当に削除しますか？`)) return;
  const statusDiv = document.getElementById('status');
  statusDiv.className = ''; statusDiv.innerText = '削除処理中...';

  try {
    cachedData.splice(index, 1);
    await syncLocalDbToSpreadsheet();
    localStorage.setItem(`cache_${userId}`, JSON.stringify(cachedData));
    updateDashboardAndTable(true);
    statusDiv.className = 'success'; statusDiv.innerText = '削除が完了しました。';
    setTimeout(() => { statusDiv.innerText = ''; }, 2000);
  } catch (err) {
    console.error(err);
    statusDiv.className = 'error'; statusDiv.innerText = '削除に失敗しました。';
  }
}

async function addRecord() {
  const dateInput = document.getElementById('date').value;
  const origin = getInputValue('origin');
  const income = parseInt(document.getElementById('income').value) || 0;
  const expense = parseInt(document.getElementById('expense').value) || 0;
  const usage = getInputValue('usage');
  const content = getInputValue('content');
  const statusDiv = document.getElementById('status');

  if (!dateInput || (!origin && !usage)) {
    statusDiv.className = 'error'; statusDiv.innerText = '日付、決済手段、用途を入力してください。';
    return;
  }

  statusDiv.className = '';
  statusDiv.innerText = editIndex === -1 ? 'データを記録中...' : 'データを修正中...';

  try {
    if (editIndex === -1) {
      const csvRow = `${dateInput},${origin},${income},${expense},${usage},${content}`;
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ id: userId, password: password, cmd: 'enterline', option: 'last', sheet: userId, value1: csvRow })
      });

      const result = await response.text();
      if (result.startsWith('OK')) {
        statusDiv.className = 'success'; statusDiv.innerText = '記録を完了しました。';
        const addedRow = result.substring(3).split(','); 
        cachedData.push(addedRow);
        localStorage.setItem(`cache_${userId}`, JSON.stringify(cachedData));
        
        document.getElementById('income').value = '';
        document.getElementById('expense').value = '';
        ['origin', 'usage', 'content'].forEach(p => {
          document.getElementById(`${p}-select`).value = '';
          document.getElementById(`${p}-text`).value = '';
        });
        
        updateDashboardAndTable(true);
        setTimeout(() => { statusDiv.innerText = ''; }, 2000);
      } else {
        statusDiv.className = 'error'; statusDiv.innerText = `記録に失敗しました: ${result}`;
      }
    } else {
      const originalTime = cachedData[editIndex][0].split(' ')[1] || '12:00:00';
      cachedData[editIndex] = [`${dateInput} ${originalTime}`, origin, String(income), String(expense), usage, content];
      await syncLocalDbToSpreadsheet();
      localStorage.setItem(`cache_${userId}`, JSON.stringify(cachedData));
      
      statusDiv.className = 'success'; statusDiv.innerText = '修正が完了しました。';
      cancelEdit();
      setTimeout(() => { statusDiv.innerText = ''; }, 2000);
    }
  } catch (err) {
    statusDiv.className = 'error'; statusDiv.innerText = '通信エラーが発生しました。';
    console.error(err);
  }
}
