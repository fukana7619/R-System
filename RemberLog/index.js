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

// GASからCSVデータを取得する共通関数
async function fetchCsvFromGas(sheetName) {
  const response = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'export', sheet: sheetName })
  });
  
  if (!response.ok) {
    throw new Error(`通信エラー (${response.status})`);
  }
  
  const text = await response.text();
  if (text.startsWith("Authentication failed") || text.startsWith("Error")) {
    throw new Error(text);
  }
  
  return text.split('\n').filter(l => l.trim() !== '');
}

// 目次(MOKUJI)の取得
async function initMokujiAndData() {
  showLoading();
  try {
    const lines = await fetchCsvFromGas('MOKUJI');

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
    alert(`データ取得に失敗しました: ${err.message}`);
  } finally {
    hideLoading();
  }
}

async function selectCourse(isbn) {
  currentIsbn = isbn;
  localStorage.setItem(`selected_isbn_${userId}`, isbn);
  closeCourseModal();
  await loadWordBookData(isbn);
}

// 単語帳データのロード (安全化 & エラー通知)
async function loadWordBookData(isbn) {
  showLoading();
  const cacheKey = `book_${isbn}`;
  let words = [];

  const localBook = localStorage.getItem(cacheKey);
  if (localBook) {
    words = JSON.parse(localBook);
  } else {
    try {
      const lines = await fetchCsvFromGas(isbn);

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        if (row.length >= 3) {
          words.push({ id: row[0], word: row[1], meaning: row[2], category: row[3] || '', memo: row[4] || '' });
        }
      }
      localStorage.setItem(cacheKey, JSON.stringify(words));
    } catch (e) {
      console.error("単語データ読み込み失敗:", e);
      alert(`単語データの読み込みに失敗しました: ${e.message}`);
    }
  }

  updateDashboardUI(isbn, words);
  hideLoading();
}

// UI描画の更新（XSS対策・textContentベースに改善）
function updateDashboardUI(isbn, words) {
  const book = mokujiData.find(b => b.isbn === isbn);
  if (book) {
    document.getElementById('current-course-title').innerText = book.name;
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  
  const courseProgress = localProgress[isbn] || { learnedCount: 0, streak: 0, wordLogs: {} };
  const wordLogs = courseProgress.wordLogs || {};

  const recentWords = [];
  words.forEach(w => {
    const log = wordLogs[w.id];
    if (log && log.lastLearned) {
      const learnedDate = new Date(log.lastLearned);
      if (learnedDate >= sevenDaysAgo) {
        recentWords.push({
          ...w,
          lastLearned: log.lastLearned,
          isCorrect: log.isCorrect
        });
      }
    }
  });

  recentWords.sort((a, b) => new Date(b.lastLearned) - new Date(a.lastLearned));

  const tbody = document.querySelector('#recent-words-table tbody');
  tbody.innerHTML = '';

  if (recentWords.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="4" style="text-align: center; color: #94a3b8; padding: 24px;">
        直近7日間の学習データがありません。<br>「学習をはじめる」からクイズに挑戦してみましょう！
      </td>
    `;
    tbody.appendChild(tr);
  } else {
    recentWords.forEach(w => {
      const tr = document.createElement('tr');
      
      const tdWord = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = w.word;
      tdWord.appendChild(strong);

      const tdMeaning = document.createElement('td');
      tdMeaning.style.color = '#475569';
      tdMeaning.textContent = w.meaning;

      const tdDate = document.createElement('td');
      tdDate.style.cssText = 'text-align: center; font-size:0.8rem; color:#64748b;';
      tdDate.textContent = w.lastLearned.split('T')[0] || w.lastLearned.split(' ')[0];

      const tdStatus = document.createElement('td');
      tdStatus.style.textAlign = 'center';
      tdStatus.innerHTML = w.isCorrect 
        ? '<span style="color:#10b981; font-weight:bold;">⭕ クリア</span>' 
        : '<span style="color:#ef4444; font-weight:bold;">❌ 要復習</span>';

      tr.appendChild(tdWord);
      tr.appendChild(tdMeaning);
      tr.appendChild(tdDate);
      tr.appendChild(tdStatus);
      tbody.appendChild(tr);
    });
  }

  const totalWords = words.length;
  const rate = totalWords > 0 ? Math.round((courseProgress.learnedCount / totalWords) * 100) : 0;

  document.getElementById('total-learned-count').innerText = `${courseProgress.learnedCount || 0}語`;
  document.getElementById('current-progress-rate').innerText = `${rate}%`;
  document.getElementById('streak-days').innerText = `${courseProgress.streak || 0}日`;
}

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

    const leftDiv = document.createElement('div');
    const titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'font-weight: bold; color: #1e293b;';
    titleDiv.textContent = `📖 ${book.name}`;
    
    const isbnDiv = document.createElement('div');
    isbnDiv.style.cssText = 'font-size: 0.75rem; color: #64748b;';
    isbnDiv.textContent = `ISBN: ${book.isbn}`;
    
    leftDiv.appendChild(titleDiv);
    leftDiv.appendChild(isbnDiv);

    const rightDiv = document.createElement('div');
    rightDiv.style.textAlign = 'right';
    rightDiv.innerHTML = `<span style="font-weight: bold; color: #3b82f6;">${progress.learnedCount || 0}語クリア</span>`;

    card.appendChild(leftDiv);
    card.appendChild(rightDiv);
    container.appendChild(card);
  });

  document.getElementById('course-modal').style.display = 'flex';
}

function closeCourseModal() {
  document.getElementById('course-modal').style.display = 'none';
}

// 単語帳キャッシュのみを削除する安全な同期関数
async function syncAllData() {
  Object.keys(localStorage)
    .filter(k => k.startsWith('book_'))
    .forEach(k => localStorage.removeItem(k));

  await initMokujiAndData();
  alert("最新の単語帳データを同期しました！");
}

function startQuiz() {
  if (!currentIsbn) {
    alert("コースを選択してください");
    return;
  }
  location.href = `card.html?isbn=${currentIsbn}`;
}
