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

// ユーザー進捗JSONの読み込み
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

// 目次(MOKUJI)から全コース（単語帳）を取得
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

    mokujiData = [];
    if (lines.length > 1) {
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        const isbn = row[0];
        const name = row[1] || isbn;
        const desc = row[4] || '';

        mokujiData.push({ isbn, name, desc });
      }
    }

    // 最後に選択していたコース、または先頭のコースをセット
    const savedIsbn = localStorage.getItem(`selected_isbn_${userId}`);
    if (savedIsbn && mokujiData.some(b => b.isbn === savedIsbn)) {
      currentIsbn = savedIsbn;
    } else if (mokujiData.length > 0) {
      currentIsbn = mokujiData[0].isbn;
    }

    if (currentIsbn) {
      await selectCourse(currentIsbn);
    }
  } catch (err) {
    console.error("MOKUJI取得エラー:", err);
  } finally {
    hideLoading();
  }
}

// コースの選択＆データ読込
async function selectCourse(isbn) {
  currentIsbn = isbn;
  localStorage.setItem(`selected_isbn_${userId}`, isbn);
  closeCourseModal();
  await loadWordBookData(isbn);
}

// 単語帳データのロード (LocalDBキャッシュ優先)
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
      console.error("単語データ読み込み失敗:", e);
    }
  }

  updateDashboardUI(isbn, words);
  hideLoading();
}

// UI描画の更新
function updateDashboardUI(isbn, words) {
  const book = mokujiData.find(b => b.isbn === isbn);
  if (book) {
    document.getElementById('current-course-title').innerText = book.name;
    document.getElementById('book-title').innerText = book.name;
    document.getElementById('book-description').innerText = book.desc || '説明なし';
  }

  // プレビューテーブル描画
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

  // 進捗度計算
  const progress = localProgress[isbn] || { learnedCount: 0, streak: 0 };
  const totalWords = words.length;
  const rate = totalWords > 0 ? Math.round((progress.learnedCount / totalWords) * 100) : 0;

  document.getElementById('total-learned-count').innerText = `${progress.learnedCount || 0}語`;
  document.getElementById('current-progress-rate').innerText = `${rate}%`;
  document.getElementById('streak-days').innerText = `${progress.streak || 0}日`;
}

// モーダル表示ロジック（Duolingo風コース一覧リスト生成）
function openCourseModal() {
  const container = document.getElementById('course-list');
  container.innerHTML = '';

  mokujiData.forEach(book => {
    const progress = localProgress[book.isbn] || { learnedCount: 0 };
    const card = document.createElement('div');
    card.style.cssText = `
      border: 2px solid ${book.isbn === currentIsbn ? '#3b82f6' : '#e2e8f0'};
      background: ${book.isbn === currentIsbn ? '#eff6ff' : '#fff'};
      border-radius: 10px;
      padding: 12px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: border-color 0.2s;
    `;
    card.onclick = () => selectCourse(book.isbn);

    card.innerHTML = `
      <div>
        <div style="font-weight: bold; color: #1e293b;">📖 ${book.name}</div>
        <div style="font-size: 0.75rem; color: #64748b;">ISBN: ${book.isbn}</div>
      </div>
      <div style="text-align: right;">
        <span style="font-weight: bold; color: #3b82f6;">${progress.learnedCount || 0}語クリア</span>
      </div>
    `;
    container.appendChild(card);
  });

  document.getElementById('course-modal').style.display = 'flex';
}

function closeCourseModal() {
  document.getElementById('course-modal').style.display = 'none';
}

async function syncAllData() {
  localStorage.clear();
  await initMokujiAndData();
  alert("最新データを同期しました！");
}

function startQuiz() {
  if (!currentIsbn) {
    alert("コースを選択してください");
    return;
  }
  location.href = `card.html?isbn=${currentIsbn}`;
}
