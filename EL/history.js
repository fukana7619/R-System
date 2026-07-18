const userId = localStorage.getItem('user_id');
let allRecords = []; // すべてのデータをここにバラして入れる

window.onload = function() {
  // 1. キャッシュからデータを読み込む
  const localCache = localStorage.getItem(`cache_${userId}`);
  if (!localCache) {
    alert("データがありません。一度入力画面で同期を行ってください。");
    location.href = 'index.html';
    return;
  }

  const cachedData = JSON.parse(localCache);

  // 2. CSVデータを扱いやすい「オブジェクトのリスト」に変換する（スキャン処理）
  for (let i = 1; i < cachedData.length; i++) {
    const row = cachedData[i];
    if (row.length < 4) continue;

    allRecords.push({
      date: row[0] || '',
      dateOnly: (row[0] || '').split(' ')[0], // 時間を除いた「YYYY-MM-DD」
      origin: row[1] || '未分類',
      income: parseInt(row[2]) || 0,
      expense: parseInt(row[3]) || 0,
      usage: row[4] || '',
      content: row[5] || ''
    });
  }

  // 日付の降順（新しい順）に並び替えておく
  allRecords.sort((a, b) => b.date.localeCompare(a.date));

  // 3. 過去のデータから、存在する「決済手段」と「用途」の種類をリストアップしてチェックボックスを作る
  buildFilterCheckboxes();

  // 4. 最初は全範囲で1回表示する
  applyFilters();
};

// フィルタ用のチェックボックスを動的に生成する処理
function buildFilterCheckboxes() {
  const origins = new Set();
  const usages = new Set();

  allRecords.forEach(r => {
    if (r.origin.trim()) origins.add(r.origin);
    if (r.usage.trim()) usages.add(r.usage);
  });

  // 決済手段のチェックボックス作成
  const originContainer = document.getElementById('origin-checkboxes');
  origins.forEach(opt => {
    const label = document.createElement('label');
    label.style.display = 'block';
    label.style.marginBottom = '5px';
    label.style.cursor = 'pointer';
    label.innerHTML = `<input type="checkbox" value="${opt}" class="origin-cb" checked> ${opt}`;
    originContainer.appendChild(label);
  });

  // 用途のチェックボックス作成
  const usageContainer = document.getElementById('usage-checkboxes');
  usages.forEach(opt => {
    const label = document.createElement('label');
    label.style.display = 'block';
    label.style.marginBottom = '5px';
    label.style.cursor = 'pointer';
    label.innerHTML = `<input type="checkbox" value="${opt}" class="usage-cb" checked> ${opt}`;
    usageContainer.appendChild(label);
  });
}

// 全期間ボタンが押されたとき
function clearDateFilter() {
  document.getElementById('filter-start-date').value = '';
  document.getElementById('filter-end-date').value = '';
}

// 💡 ここがメインの条件分岐（フィルター）ロジック！
function applyFilters() {
  // 条件値の取得
  const startDate = document.getElementById('filter-start-date').value;
  const endDate = document.getElementById('filter-end-date').value;
  const minAmount = parseInt(document.getElementById('filter-min-amount').value) || 0;

  // チェックがついている値のリストを作る
  const checkedOrigins = Array.from(document.querySelectorAll('.origin-cb:checked')).map(cb => cb.value);
  const checkedUsages = Array.from(document.querySelectorAll('.usage-cb:checked')).map(cb => cb.value);

  const tbody = document.querySelector('#history-table tbody');
  tbody.innerHTML = ''; // テーブルを一旦空にする

  let matchCount = 0;
  let totalIncomeSum = 0;
  let totalExpenseSum = 0;

  // すべてのレコードを1つずつチェックするループ（TurboWarpの「〜回繰り返す」）
  allRecords.forEach(row => {
    
    // 条件1: 開始日付のチェック
    if (startDate && row.dateOnly < startDate) return; // 条件に合わなければスルー
    
    // 条件2: 終了日付のチェック
    if (endDate && row.dateOnly > endDate) return;

    // 条件3: 金額のチェック（収入か支出のどちらかがしきい値以上か）
    if (minAmount && row.income < minAmount && row.expense < minAmount) return;

    // 条件4: 決済手段の複数選択チェック
    if (!checkedOrigins.includes(row.origin)) return;

    // 条件5: 用途の複数選択チェック
    if (!checkedUsages.includes(row.usage)) return;

    // --- 🎉 すべての条件をクリアしたデータだけがここに到達する！ ---
    matchCount++;
    totalIncomeSum += row.income;
    totalExpenseSum += row.expense;

    // テーブルに1行追加（クローンを作る感覚）
    const tr = document.createElement('tr');
    const displayDate = row.date.replace(' ', '<br>');
    tr.innerHTML = `
      <td style="font-size: 0.75rem; color: #64748b;">${displayDate}</td>
      <td style="font-weight:bold; color:#475569;">${row.origin}</td>
      <td class="income-text">${row.income > 0 ? row.income.toLocaleString() + '円' : ''}</td>
      <td class="expense-text">${row.expense > 0 ? row.expense.toLocaleString() + '円' : ''}</td>
      <td>
        <div style="font-weight:600; color:var(--primary-color);">${row.usage}</div>
        <div style="font-size:0.75rem; color:#64748b;">${row.content}</div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // カウンターや合計金額の表示を更新する
  document.getElementById('match-count').innerText = matchCount;
  document.getElementById('sum-income').innerText = `${totalIncomeSum.toLocaleString()}円`;
  document.getElementById('sum-expense').innerText = `${totalExpenseSum.toLocaleString()}円`;
}
