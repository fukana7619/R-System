const gasUrl = "https://script.google.com/macros/s/AKfycbxowZsvBN-F13yUesQF5iFwAccdcfh_ByawUxWtwkeFrdyo9Yq9l6PZ3oXaZTz9pTHp/exec";

// 1. ログインチェック（情報が欠けている場合のみリダイレクト）
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
  const userEl = document.getElementById('display-user');
  if (userEl) userEl.innerText = userId;

  loadLocalProgress();
  await initMokujiAndData();
};

// 明示的なログアウト処理
function logout() {
  if (confirm('ログアウトしますか？')) {
    localStorage.removeItem('ra_user_id');
    localStorage.removeItem('ra_user_password');
    localStorage.removeItem('is_logged_in');
    
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

// GASからCSVを取得する共通関数
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
    throw new Error("認証エラーまたはデータ取得エラーが発生しました");
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
        const row = parseCsvLine(lines[i]);
        if (row.length >= 2) {
          const isbn = row[0];
          const name = row[1] || isbn;
          const desc = row[4] || '';
          mokujiData.push({ isbn, name, desc });
        }
      }
    }

    // 最後に選択していたコース、または先頭のコースを選択
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

// カンマ・ダブルクォート対応の簡易CSVパーサ
function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result;
}

// コース切り替え
async function selectCourse(isbn) {
  currentIsbn = isbn;
  localStorage.setItem(`selected_isbn_${userId}`, isbn);
  closeCourseModal();
  await loadWordBookData(isbn);
}

// 単語帳データのロード（キャッシュ優先化）
async function loadWordBookData(isbn) {
  showLoading();
  const cacheKey = `book_${isbn}`;
  let words = [];

  const localBook = localStorage.getItem(cacheKey);
  if (localBook) {
    try {
      words = JSON.parse(localBook);
    } catch(e) {
      words = [];
    }
  }

  // キャッシュがない場合のみGASから取得
  if (words.length === 0) {
    try {
      const lines = await fetchCsvFromGas(isbn);

      for (let i = 1; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
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

// ダッシュボードUI描画
function updateDashboardUI(isbn, words) {
  const book = mokujiData.find(b => b.isbn === isbn);
  const titleEl = document.getElementById('current-course-title');
  if (book && titleEl) {
    titleEl.innerText = book.name;
  }

  loadLocalProgress(); // 最新の進捗を読み直す

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
  if (tbody) {
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
  }

  const totalWords = words.length;
  const rate = totalWords > 0 ? Math.round(((courseProgress.learnedCount || 0) / totalWords) * 100) : 0;

  const countEl = document.getElementById('total-learned-count');
  if (countEl) countEl.innerText = `${courseProgress.learnedCount || 0}語`;

  const rateEl = document.getElementById('current-progress-rate');
  if (rateEl) rateEl.innerText = `${rate}%`;

  const streakEl = document.getElementById('streak-days');
  if (streakEl) streakEl.innerText = `${courseProgress.streak || 0}日`;
}

// コース選択モーダル表示
function openCourseModal() {
  const container = document.getElementById('course-list');
  if (!container) return;
  
  container.innerHTML = '';
  loadLocalProgress();

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
      margin-bottom: 8px;
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

  const modal = document.getElementById('course-modal');
  if (modal) modal.style.display = 'flex';
}

function closeCourseModal() {
  const modal = document.getElementById('course-modal');
  if (modal) modal.style.display = 'none';
}

// 【重要】安全なデータ同期（単語帳のキャッシュのみ削除）
async function syncAllData() {
  if (!confirm("最新の単語帳データをサーバーから取得しますか？")) return;

  Object.keys(localStorage)
    .filter(k => k.startsWith('book_'))
    .forEach(k => localStorage.removeItem(k));

  await initMokujiAndData();
  alert("最新の単語帳データを同期しました！");
}

// クイズ開始（card.htmlへの遷移）
function startQuiz() {
  if (!currentIsbn) {
    alert("コースを選択してください");
    return;
  }
  const book = mokujiData.find(b => b.isbn === currentIsbn);
  const title = book ? encodeURIComponent(book.name) : '';
  location.href = `card.html?isbn=${currentIsbn}&title=${title}`;
}
