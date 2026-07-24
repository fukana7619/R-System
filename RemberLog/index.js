const gasUrl = "https://script.google.com/macros/s/AKfycbxowZsvBN-F13yUesQF5iFwAccdcfh_ByawUxWtwkeFrdyo9Yq9l6PZ3oXaZTz9pTHp/exec";

const userId = localStorage.getItem('ra_user_id');
const password = localStorage.getItem('ra_user_password');

if (!userId || !password) {
  const currentUrl = encodeURIComponent(window.location.href);
  location.href = `../RA/RA-Login.html?backurl=${currentUrl}`;
}

let currentIsbn = "";
let mokujiData = [];
let localProgress = {}; 

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
  loadLocalProgress();
  await initMokujiAndData();
};

function logout() {
  if (confirm('ログアウトしますか？')) {
    localStorage.removeItem('ra_user_id');
    localStorage.removeItem('ra_user_password');
    const currentUrl = encodeURIComponent(window.location.href);
    location.href = `../RA/RA-Login.html?backurl=${currentUrl}`;
  }
}

// LocalDBからユーザー進捗JSONを取得
function loadLocalProgress() {
  const saved = localStorage.getItem(`progress_${userId}`);
  if (saved) {
    try {
      localProgress = JSON.parse(saved);
    } catch(e) {
      localProgress = {};
    }
  }
}

// 目次(MOKUJI)の取得とセレクトボックス初期化
async function initMokujiAndData() {
  showLoading();
  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'export', sheet: 'MOKUJI' })
    });
    const csvText = await response.text();
    const lines = csvText.split('\n').filter(l => l.trim() !== '');

    const select = document.getElementById('dictionary-select');
    select.innerHTML = '';
    mokujiData = [];

    if (lines.length > 1) {
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        const isbn = row[0];
        const name = row[1] || isbn;
        const desc = row[4] || '';

        mokujiData.push({ isbn, name, desc });

        const opt = document.createElement('option');
        opt.value = isbn;
        opt.innerText = `${name} (ISBN: ${isbn})`;
        select.appendChild(opt);
      }
      currentIsbn = select.value;
    }

    if (currentIsbn) {
      await loadWordBookData(currentIsbn);
    }
  } catch (err) {
    console.error("MOKUJI取得エラー:", err);
  } finally {
    hideLoading();
  }
}

// 選択されたISBNの単語帳データをLocalDBまたはGASから読み込む
async function loadWordBookData(isbn) {
  showLoading();
  const cacheKey = `book_${isbn}`;
  let words = [];

  const localBook = localStorage.getItem(cacheKey);
  if (localBook) {
    words = JSON.parse(localBook);
  } else {
    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'export', sheet: isbn })
      });
      const csvText = await response.text();
      const lines = csvText.split('\n').filter(l => l.trim() !== '');

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        if (row.length >= 3) {
          words.push({ id: row[0], word: row[1], meaning: row[2], category: row[3] || '', memo: row[4] || '' });
        }
      }
      localStorage.setItem(cacheKey, JSON.stringify(words));
    } catch (e) {
      console.error("単語取得失敗:", e);
    }
  }

  updateDashboardUI(isbn, words);
  hideLoading();
}

async function onDictionaryChange() {
  currentIsbn = document.getElementById('dictionary-select').value;
  await loadWordBookData(currentIsbn);
}

// ダッシュボード・アナリティクス表示の更新
function updateDashboardUI(isbn, words) {
  const book = mokujiData.find(b => b.isbn === isbn);
  if (book) {
    document.getElementById('book-title').innerText = book.name;
    document.getElementById('book-description').innerText = book.desc || '説明なし';
  }

  // テーブル描画
  const tbody = document.querySelector('#word-preview-table tbody');
  tbody.innerHTML = '';
  words.forEach(w => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${w.word}</strong></td>
      <td>${w.meaning}</td>
      <td><span style="font-size:0.8rem; background:#f1f5f9; padding:2px 8px; border-radius:12px;">${w.category}</span></td>
    `;
    tbody.appendChild(tr);
  });

  // 進捗アナリティクス計算
  const progress = localProgress[isbn] || { learnedCount: 0, streak: 0 };
  const totalWords = words.length;
  const rate = totalWords > 0 ? Math.round((progress.learnedCount / totalWords) * 100) : 0;

  document.getElementById('total-learned-count').innerText = `${progress.learnedCount || 0}語`;
  document.getElementById('current-progress-rate').innerText = `${rate}%`;
  document.getElementById('streak-days').innerText = `${progress.streak || 0}日`;
}

// 最新データの完全同期（手動更新）
async function syncAllData() {
  localStorage.clear();
  await initMokujiAndData();
  alert("最新データを同期しました！");
}

// クイズ（学習画面）への遷移
function startQuiz() {
  if (!currentIsbn) return;
  location.href = `card.html?isbn=${currentIsbn}`;
}
