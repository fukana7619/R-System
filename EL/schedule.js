const gasUrl = "https://script.google.com/macros/s/AKfycbxYb_SOQDiw-k30HciJfRMQvIp66dhoddcJa7Rn7bipj_PTlS8K2UsHPJY3MhEiwMMAaA/exec";
const userId = localStorage.getItem('ra_user_id');
const password = localStorage.getItem('ra_user_password');

// 💡 予定保存用シート名（例: Aretasu7619_schedule）
const scheduleSheetName = `${userId}_schedule`;

if (!userId || !password) {
  location.href = `../RA/RA-Login.html`;
}

window.onload = function() {
  // 1〜31日のセレクトボックス初期化
  const daySelect = document.getElementById('sched-dayofmonth');
  for (let i = 1; i <= 31; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.innerText = `${i}日`;
    daySelect.appendChild(opt);
  }

  // 今日の日付をセット
  const today = new Date();
  document.getElementById('sched-date').value = today.toISOString().split('T')[0];

  loadSchedules();
};

function toggleScheduleFields() {
  const type = document.getElementById('sched-type').value;
  document.getElementById('field-date').style.display = (type === 'single' || type === 'yearly') ? 'block' : 'none';
  document.getElementById('field-dayofmonth').style.display = (type === 'monthly') ? 'block' : 'none';
  document.getElementById('field-dayofweek').style.display = (type === 'weekly') ? 'block' : 'none';
}

// 予定一覧の読み込み
async function loadSchedules() {
  showLoading();
  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'export', sheet: scheduleSheetName })
    });
    const csv = await res.text();
    const tbody = document.querySelector('#schedule-table tbody');
    tbody.innerHTML = '';

    if (csv.includes('Sheet not found') || !csv.trim()) {
      hideLoading();
      return;
    }

    const lines = csv.split('\n').filter(l => l.trim() !== '');
    lines.forEach((line, index) => {
      const row = line.split(',');
      if (row.length < 7) return;

      // row: [id, type, dateCondition, origin, income, expense, usage, content, lastExecuted]
      const [id, type, dateCond, origin, income, expense, usage, content] = row;

      let typeLabel = '';
      if (type === 'single') typeLabel = `単発 (${dateCond})`;
      if (type === 'monthly') typeLabel = `毎月 ${dateCond}日`;
      if (type === 'weekly') {
        const weeks = ['日', '月', '火', '水', '木', '金', '土'];
        typeLabel = `毎週 (${weeks[dateCond]}曜日)`;
      }
      if (type === 'yearly') typeLabel = `毎年 (${dateCond})`;

      const incNum = parseInt(income) || 0;
      const expNum = parseInt(expense) || 0;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size:0.8rem; font-weight:bold;">${typeLabel}</td>
        <td>${origin}</td>
        <td>
          ${incNum > 0 ? `<span class="income-text">+${incNum.toLocaleString()}</span>` : ''}
          ${expNum > 0 ? `<span class="expense-text">-${expNum.toLocaleString()}</span>` : ''}
        </td>
        <td>
          <div style="font-weight:600;">${usage}</div>
          <div style="font-size:0.75rem; color:#64748b;">${content}</div>
        </td>
        <td>
          <button class="action-btn delete-btn" onclick="deleteSchedule(${index})">削除</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

// 予定の追加
async function addSchedule() {
  const type = document.getElementById('sched-type').value;
  let dateCond = '';

  if (type === 'single' || type === 'yearly') dateCond = document.getElementById('sched-date').value;
  if (type === 'monthly') dateCond = document.getElementById('sched-dayofmonth').value;
  if (type === 'weekly') dateCond = document.getElementById('sched-dayofweek').value;

  const origin = document.getElementById('sched-origin').value.trim();
  const income = document.getElementById('sched-income').value || '0';
  const expense = document.getElementById('sched-expense').value || '0';
  const usage = document.getElementById('sched-usage').value.trim();
  const content = document.getElementById('sched-content').value.trim();

  if (!origin || !usage) {
    alert('決済手段と用途を入力してください。');
    return;
  }

  showLoading();
  const id = Date.now().toString(); // ユニークID
  const lastExecuted = ''; // 最後に実行された日付
  const csvRow = `${id},${type},${dateCond},${origin},${income},${expense},${usage},${content},${lastExecuted}`;

  try {
    await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: userId, password: password, cmd: 'enterline', option: 'last', sheet: scheduleSheetName, value1: csvRow })
    });
    
    // クリア
    document.getElementById('sched-origin').value = '';
    document.getElementById('sched-income').value = '';
    document.getElementById('sched-expense').value = '';
    document.getElementById('sched-usage').value = '';
    document.getElementById('sched-content').value = '';

    await loadSchedules();
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

// 予定の削除
async function deleteSchedule(index) {
  if (!confirm('この予定設定を削除しますか？')) return;
  showLoading();
  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'export', sheet: scheduleSheetName })
    });
    const csv = await res.text();
    let lines = csv.split('\n').filter(l => l.trim() !== '');
    
    lines.splice(index, 1); // 指定行削除
    
    await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'import', sheet: scheduleSheetName, value1: lines.join('\n') })
    });

    await loadSchedules();
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

function showLoading() { document.getElementById('loading-overlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loading-overlay').style.display = 'none'; }
