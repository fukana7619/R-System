// 💡 おぼログ専用 GAS URL
const gasUrl = "https://script.google.com/macros/s/AKfycbxowZsvBN-F13yUesQF5iFwAccdcfh_ByawUxWtwkeFrdyo9Yq9l6PZ3oXaZTz9pTHp/exec";

// 💡 RA (R-System Account) からログイン情報を取得
const userId = localStorage.getItem('ra_user_id');
const password = localStorage.getItem('ra_user_password');

if (!userId || !password) {
  const currentUrl = encodeURIComponent(window.location.href);
  location.href = `../RA/RA-Login.html?backurl=${currentUrl}`;
}

let currentDictId = "default"; // 現在選択されている辞書ID
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

window.onload = async function() {
  document.getElementById('display-user').innerText = userId;
  
  // 目次（MOKUJI）の読み込み後に単語データを取得
  await fetchMokujiAndInit();
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

// MOKUJIから辞書一覧を取得してセレクトボックスを構築
async function fetchMokujiAndInit() {
  showLoading();
  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'export', sheet: 'MOKUJI' })
    });
    const csvText = await response.text();
    const lines = csvText.split('\n').filter(l => l.trim() !== '');
    
    const dictSelect = document.getElementById('dictionary-select');
    dictSelect.innerHTML = '';

    if (lines.length > 1) {
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        const dictId = row[0];
        const dictName = row[1] || dictId;
        const opt = document.createElement('option');
        opt.value = dictId;
        opt.innerText = dictName;
        dictSelect.appendChild(opt);
      }
      currentDictId = dictSelect.value;
    } else {
      // MOKUJIが空の場合はユーザーIDシートまたはデフォルトIDを適用
      const opt = document.createElement('option');
      opt.value = userId;
      opt.innerText = `${userId}の単語帳`;
      dictSelect.appendChild(opt);
      currentDictId = userId;
    }

    // キャッシュ確認と読み込み
    const localCache = localStorage.getItem(`cache_obolog_${currentDictId}`);
    if (localCache) {
      cachedData = JSON.parse(localCache);
      updateDashboardAndTable(true);
      await fetchDataAndCalculate(false, false);
    } else {
      await fetchDataAndCalculate(false, true);
    }
  } catch (err) {
    console.error("MOKUJI load failed:", err);
  } finally {
    hideLoading();
  }
}

async function changeDictionary() {
  currentDictId = document.getElementById('dictionary-select').value;
  await fetchDataAndCalculate(true, true);
}

// 辞書データ（辞書IDシート）の取得
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
      body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'export', sheet: currentDictId })
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
    localStorage.setItem(`cache_obolog_${currentDictId}`, JSON.stringify(cachedData));

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

function updateDashboardAndTable(shouldRebuildFilter = false) {
  const allRecords = [];

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

  const totalCount = allRecords.length;
  const learnedCount = allRecords.filter(r => r.status === '習得済み' || r.status === '覚えた').length;
  const rate = totalCount > 0 ? Math.round((learnedCount / totalCount) * 100) : 0;

  document.getElementById('total-count').innerText = `${totalCount}語`;
  document.getElementById('learned-rate').innerText = `${rate}%`;

  buildDynamicSelect('category', 3, allRecords);

  const tbody = document.querySelector('#history-table tbody');
  tbody.innerHTML = '';

  allRecords.forEach(row => {
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
    body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'import', sheet: currentDictId, value1: csvContent })
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
    localStorage.setItem(`cache_obolog_${currentDictId}`, JSON.stringify(cachedData));
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
      const csvRow = `,${word},${meaning},${category},${statusVal},${memo}`;
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ id: userId, password: password, cmd: 'enterline', option: 'last', sheet: currentDictId, value1: csvRow })
      });

      const result = await response.text();
      if (result.startsWith('OK')) {
        statusDiv.className = 'success'; statusDiv.innerText = '登録を完了しました。';
        const addedRow = result.substring(3).split(','); 
        cachedData.push(addedRow);
        localStorage.setItem(`cache_obolog_${currentDictId}`, JSON.stringify(cachedData));
        
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
      localStorage.setItem(`cache_obolog_${currentDictId}`, JSON.stringify(cachedData));
      
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
