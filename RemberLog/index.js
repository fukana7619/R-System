// 💡 おぼログ専用 GAS URL（必要に応じて書き換えてください）
const gasUrl = "https://script.google.com/macros/s/YOUR_GAS_DEPLOYMENT_ID/exec";

// 💡 RA (R-System Account) からログイン情報を取得
const userId = localStorage.getItem('ra_user_id');
const password = localStorage.getItem('ra_user_password');

// 💡 認証チェック：未ログインの場合は ../RA/RA-Login.html へリダイレクト
if (!userId || !password) {
  const currentUrl = encodeURIComponent(window.location.href);
  location.href = `../RA/RA-Login.html?backurl=${currentUrl}`;
}

let cachedData = []; 
let editIndex = -1; 

function showLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

// 1. 初期化処理
window.onload = async function() {
  document.getElementById('display-user').innerText = userId;

  // キャッシュ確認
  const localCache = localStorage.getItem(`cache_obolog_${userId}`);
  if (localCache) {
    cachedData = JSON.parse(localCache);
    updateDashboardAndTable(true);
    await fetchDataAndCalculate(false, false); 
  } else {
    await fetchDataAndCalculate(false, true); 
  }
};

function logout() {
  if (confirm('ログアウトしますか？')) {
    localStorage.removeItem('ra_user_id');
    localStorage.removeItem('ra_user_password');
    const currentUrl = encodeURIComponent(window.location.href);
    location.href = `../RA/RA-Login.html?backurl=${currentUrl}`;
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

// 2. API（GAS）連携
async function fetchDataAndCalculate(showNotification = false, useSpinner = true) {
  const statusDiv = document.getElementById('status');
  
  if (showNotification) { 
    statusDiv.className = ''; 
    statusDiv.innerText = 'データを更新中...'; 
  }
  if (useSpinner) showLoading();

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'export', sheet: 'おぼログ' })
    });

    const csvText = await response.text();
    if (csvText.includes('Sheet not found')) {
      statusDiv.className = 'error';
      statusDiv.innerText = 'シートが存在しません。';
      hideLoading();
      return;
    }

    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    cachedData = lines.map(line => line.split(','));
    localStorage.setItem(`cache_obolog_${userId}`, JSON.stringify(cachedData));

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
  } finally {
    hideLoading();
  }
}

// 3. UI・フィルタ生成
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
    optionEl.innerText = opt; 
    select.appendChild(optionEl);
  });

  if (editIndex === -1 && (!currentValue || (currentValue === '__other__' && textInput.value === ''))) {
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

function buildCategoryFilter(allRecords) {
  const filterSelect = document.getElementById('category-filter');
  const currentValue = filterSelect.value;

  const categories = [];
  allRecords.forEach(r => {
    if (r.category && !categories.includes(r.category)) {
      categories.push(r.category);
    }
  });

  filterSelect.innerHTML = '<option value="__all__">✨ 全てのカテゴリ</option>';
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.innerText = `📂 ${c}`;
    filterSelect.appendChild(opt);
  });

  filterSelect.value = categories.includes(currentValue) ? currentValue : '__all__';
}

function updateDashboardAndTable(shouldRebuildFilter = false) {
  const allRecords = [];

  // 1行目はヘッダーなので index = 1 からループ
  for (let i = 1; i < cachedData.length; i++) {
    const row = cachedData[i];
    if (row.length < 3) continue;

    const dateStr = row[0];
    const word = row[1] || '';
    const meaning = row[2] || '';
    const category = row[3] || '未分類';
    const status = row[4] || '未習得';
    const memo = row[5] || '';

    if (!word) continue;

    allRecords.push({ originalIndex: i, date: dateStr, word, meaning, category, status, memo, rawRow: row });
  }

  if (shouldRebuildFilter) {
    buildCategoryFilter(allRecords);
  }

  const selectedCategory = document.getElementById('category-filter').value;
  const filteredRecords = allRecords.filter(r => selectedCategory === '__all__' || r.category === selectedCategory);

  // 集計計算
  const totalCount = filteredRecords.length;
  const learnedCount = filteredRecords.filter(r => r.status === '習得済み' || r.status === '覚えた').length;
  const rate = totalCount > 0 ? Math.round((learnedCount / totalCount) * 100) : 0;

  document.getElementById('total-count').innerText = `${totalCount}語`;
  document.getElementById('learned-rate').innerText = `${rate}%`;

  buildDynamicSelect('category', 3, allRecords);

  // テーブル描画
  const tbody = document.querySelector('#history-table tbody');
  tbody.innerHTML = '';

  filteredRecords.forEach(row => {
    const tr = document.createElement('tr');
    const isLearned = row.status === '習得済み' || row.status === '覚えた';
    const statusBadge = isLearned 
      ? '<span style="color:#10b981; font-weight:bold;">🟢 覚えた</span>' 
      : '<span style="color:#ef4444; font-weight:bold;">🔴 未習得</span>';

    tr.innerHTML = `
      <td>
        <div style="font-weight:bold; font-size:1rem; color:#1e293b;">${row.word}</div>
        <div style="font-size:0.75rem; color:#64748b;">${row.memo}</div>
      </td>
      <td style="color:#334155;">${row.meaning}</td>
      <td><span style="font-size:0.8rem; background:#f1f5f9; padding:2px 8px; border-radius:12px; color:#475569;">${row.category}</span></td>
      <td style="text-align: center;">${statusBadge}</td>
      <td style="text-align: center; white-space: nowrap;">
        <button class="action-btn edit-btn" onclick="startEdit(${row.originalIndex})">修正</button>
        <button class="action-btn delete-btn" onclick="deleteRecord(${row.originalIndex})">削除</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function getInputValue(prefix) {
  const select = document.getElementById(`${prefix}-select`);
  if (select.value === '__other__') {
    return document.getElementById(`${prefix}-text`).value.trim().replace(/,/g, '，');
  }
  return select.value;
}

// 4. 追加・編集・削除・同期処理
function startEdit(index) {
  editIndex = index;
  const row = cachedData[index];

  document.getElementById('word').value = row[1] || '';
  document.getElementById('meaning').value = row[2] || '';

  const categorySelect = document.getElementById('category-select');
  const categoryText = document.getElementById('category-text');
  if ([...categorySelect.options].some(o => o.value === row[3])) {
    categorySelect.value = row[3];
    categoryText.style.display = 'none';
  } else {
    categorySelect.value = '__other__';
    categoryText.style.display = 'block';
    categoryText.value = row[3] || '';
  }

  document.getElementById('status-select').value = row[4] || '未習得';
  document.getElementById('memo').value = row[5] || '';

  document.getElementById('form-title').innerText = '単語の修正';
  document.getElementById('submit-button').innerText = '変更を保存する';
  document.getElementById('cancel-button').style.display = 'block';
  document.getElementById('form-title').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  editIndex = -1;
  document.getElementById('word').value = '';
  document.getElementById('meaning').value = '';
  document.getElementById('memo').value = '';
  document.getElementById('category-select').value = ''; 
  document.getElementById('category-text').value = '';

  document.getElementById('form-title').innerText = '単語の登録';
  document.getElementById('submit-button').innerText = '登録する';
  document.getElementById('cancel-button').style.display = 'none';
  updateDashboardAndTable();
}

async function syncLocalDbToSpreadsheet() {
  const csvContent = cachedData.map(r => r.join(',')).join('\n');
  const response = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'import', sheet: 'おぼログ', value1: csvContent })
  });
  if (await response.text() !== 'OK') throw new Error('Sync failed');
}

async function deleteRecord(index) {
  if (!confirm(`この単語を削除しますか？`)) return;
  const statusDiv = document.getElementById('status');
  statusDiv.className = ''; statusDiv.innerText = '削除処理中...';
  showLoading(); 

  try {
    cachedData.splice(index, 1);
    await syncLocalDbToSpreadsheet();
    localStorage.setItem(`cache_obolog_${userId}`, JSON.stringify(cachedData));
    updateDashboardAndTable(true);
    statusDiv.className = 'success'; statusDiv.innerText = '削除が完了しました。';
    setTimeout(() => { statusDiv.innerText = ''; }, 2000);
  } catch (err) {
    console.error(err);
    statusDiv.className = 'error'; statusDiv.innerText = '削除に失敗しました。';
  } finally {
    editIndex = -1;
    hideLoading(); 
  }
}

async function addRecord() {
  const word = document.getElementById('word').value.trim().replace(/,/g, '，');
  const meaning = document.getElementById('meaning').value.trim().replace(/,/g, '，');
  const category = getInputValue('category');
  const statusVal = document.getElementById('status-select').value;
  const memo = document.getElementById('memo').value.trim().replace(/,/g, '，');
  const statusDiv = document.getElementById('status');

  if (!word || !meaning) {
    statusDiv.className = 'error'; statusDiv.innerText = '単語と意味を入力してください。';
    return;
  }

  statusDiv.className = '';
  statusDiv.innerText = editIndex === -1 ? 'データを登録中...' : 'データを修正中...';
  showLoading(); 

  try {
    if (editIndex === -1) {
      // 日付は空で送信し、GAS側で日本時間タイムスタンプ補完（1列目）
      const csvRow = `,${word},${meaning},${category},${statusVal},${memo}`;
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ id: userId, password: password, cmd: 'enterline', option: 'last', sheet: 'おぼログ', value1: csvRow })
      });

      const result = await response.text();
      if (result.startsWith('OK')) {
        statusDiv.className = 'success'; statusDiv.innerText = '登録を完了しました。';
        const addedRow = result.substring(3).split(','); 
        cachedData.push(addedRow);
        localStorage.setItem(`cache_obolog_${userId}`, JSON.stringify(cachedData));
        
        document.getElementById('word').value = '';
        document.getElementById('meaning').value = '';
        document.getElementById('memo').value = '';
        document.getElementById('category-select').value = '';
        document.getElementById('category-text').value = '';
        
        updateDashboardAndTable(true);
        setTimeout(() => { statusDiv.innerText = ''; }, 2000);
      } else {
        statusDiv.className = 'error'; statusDiv.innerText = `登録に失敗しました: ${result}`;
      }
    } else {
      const originalTime = cachedData[editIndex][0] || '';
      cachedData[editIndex] = [originalTime, word, meaning, category, statusVal, memo];
      await syncLocalDbToSpreadsheet();
      localStorage.setItem(`cache_obolog_${userId}`, JSON.stringify(cachedData));
      
      statusDiv.className = 'success'; statusDiv.innerText = '修正が完了しました。';
      cancelEdit();
      setTimeout(() => { statusDiv.innerText = ''; }, 2000);
    }
  } catch (err) {
    statusDiv.className = 'error'; statusDiv.innerText = '通信エラーが発生しました。';
    console.error(err);
  } finally {
    hideLoading(); 
  }
}
