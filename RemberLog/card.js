// card.js - おぼログ 学習（フラッシュカード）ページ

const gasUrl = "https://script.google.com/macros/s/AKfycbxowZsvBN-F13yUesQF5iFwAccdcfh_ByawUxWtwkeFrdyo9Yq9l6PZ3oXaZTz9pTHp/exec";

const userId = localStorage.getItem('ra_user_id');
const password = localStorage.getItem('ra_user_password');

if (!userId || !password) {
  const currentUrl = encodeURIComponent(window.location.href);
  location.href = `../RA/RA-Login.html?backurl=${currentUrl}`;
}

const urlParams = new URLSearchParams(window.location.search);
const isbn = urlParams.get('isbn');
const courseTitle = urlParams.get('title') ? decodeURIComponent(urlParams.get('title')) : '単語カード';

let allWords = [];      // このコースの全単語（サーバー/キャッシュから取得したまま）
let queue = [];         // 現在のラウンドで出題する順番（シャッフル済み）
let currentIndex = 0;
let missedIds = [];     // このラウンドで「わからない」を押した単語ID
let sessionLearnedCount = 0;
let isFlipped = false;

function showLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

window.onload = async function() {
  if (!isbn) {
    alert("コースが選択されていません。ホームからコースを選んでください。");
    location.href = 'index.html';
    return;
  }
  document.getElementById('quiz-course-title').textContent = courseTitle;
  await loadWords();
  startRound(allWords);
};

// 単語データの読み込み：ホーム画面が作ったキャッシュ(book_ISBN)があればそれを使い、
// なければ（直接URLを開いた場合など）GASから取得してキャッシュする
async function loadWords() {
  showLoading();
  const cacheKey = `book_${isbn}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      allWords = JSON.parse(cached);
      hideLoading();
      return;
    } catch (e) {
      // キャッシュが壊れていた場合はフォールバックしてサーバーから取得する
    }
  }
  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: userId, password: password, cmd: 'csv', option: 'export', sheet: isbn })
    });
    const csvText = await response.text();
    allWords = parseWordsCsv(csvText);
    localStorage.setItem(cacheKey, JSON.stringify(allWords));
  } catch (e) {
    console.error("単語データ読み込み失敗:", e);
    alert("単語データの取得に失敗しました。ホームに戻ります。");
    location.href = 'index.html';
  } finally {
    hideLoading();
  }
}

// CSV → 単語配列。ダブルクォートで囲まれたフィールド内のカンマに対応
// （意味・メモに「,」を含む行があってもズレないようにするため）
function parseWordsCsv(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim() !== '');
  const words = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length >= 3) {
      words.push({ id: cols[0], word: cols[1], meaning: cols[2], category: cols[3] || '', memo: cols[4] || '' });
    }
  }
  return words;
}

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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 1ラウンド開始。初回はコース全体、「苦手だけもう一度」の場合はその単語だけ
function startRound(words) {
  if (!words || words.length === 0) {
    alert("このコースには単語が登録されていません");
    location.href = 'index.html';
    return;
  }
  queue = shuffle(words);
  currentIndex = 0;
  missedIds = [];
  sessionLearnedCount = 0;
  document.getElementById('quiz-summary').style.display = 'none';
  document.getElementById('quiz-area').style.display = '';
  renderCard();
}

function renderCard() {
  if (currentIndex >= queue.length) {
    finishRound();
    return;
  }
  const w = queue[currentIndex];
  isFlipped = false;

  document.getElementById('flashcard').classList.remove('is-flipped');

  const categoryEl = document.getElementById('card-category');
  categoryEl.textContent = w.category || '';
  categoryEl.style.display = w.category ? 'inline-block' : 'none';

  document.getElementById('card-word').textContent = w.word;
  document.getElementById('card-meaning').textContent = w.meaning;

  const memoEl = document.getElementById('card-memo');
  memoEl.textContent = w.memo || '';
  memoEl.style.display = w.memo ? 'block' : 'none';

  document.getElementById('quiz-actions').style.visibility = 'hidden';
  document.getElementById('quiz-progress-text').textContent = `${currentIndex + 1} / ${queue.length}`;
  document.getElementById('quiz-progress-fill').style.width = `${Math.round((currentIndex / queue.length) * 100)}%`;
}

function flipCard() {
  isFlipped = !isFlipped;
  document.getElementById('flashcard').classList.toggle('is-flipped', isFlipped);
  if (isFlipped) {
    document.getElementById('quiz-actions').style.visibility = 'visible';
  }
}

function answerCard(knewIt) {
  if (!isFlipped) return; // 意味を見る前に誤って回答できないようにする
  const w = queue[currentIndex];
  if (knewIt) {
    markLearned(w.id);
    sessionLearnedCount++;
  } else if (!missedIds.includes(w.id)) {
    missedIds.push(w.id);
  }
  currentIndex++;
  renderCard();
}

function retryMistakes() {
  const retryWords = allWords.filter(w => missedIds.includes(w.id));
  startRound(retryWords);
}

function finishRound() {
  syncLearnedCountToProgress();
  document.getElementById('quiz-area').style.display = 'none';
  document.getElementById('quiz-progress-fill').style.width = '100%';

  const all = loadProgressAll();
  const prog = all[isbn] || { learnedCount: 0, streak: 0 };

  document.getElementById('summary-session-count').textContent = `${sessionLearnedCount}語`;
  document.getElementById('summary-total-count').textContent = `${prog.learnedCount}語`;
  document.getElementById('summary-streak').textContent = `${prog.streak}日`;

  const retryBtn = document.getElementById('retry-mistakes-btn');
  if (missedIds.length > 0) {
    retryBtn.style.display = '';
    retryBtn.textContent = `苦手な単語だけもう一度 (${missedIds.length}語)`;
  } else {
    retryBtn.style.display = 'none';
  }

  document.getElementById('quiz-summary').style.display = 'block';
}

function exitQuiz() {
  if (confirm('学習を終了してホームに戻りますか？')) {
    location.href = 'index.html';
  }
}

// ---- 進捗の保存。ホーム画面が読む progress_${userId} と同じキー・構造に書き込む ----

function getLearnedSet() {
  const raw = localStorage.getItem(`learned_${userId}_${isbn}`);
  if (!raw) return new Set();
  try { return new Set(JSON.parse(raw)); } catch (e) { return new Set(); }
}

function saveLearnedSet(set) {
  localStorage.setItem(`learned_${userId}_${isbn}`, JSON.stringify([...set]));
}

function markLearned(wordId) {
  const set = getLearnedSet();
  set.add(wordId);
  saveLearnedSet(set);
  updateStreakIfNeeded();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadProgressAll() {
  const raw = localStorage.getItem(`progress_${userId}`);
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}

function saveProgressAll(all) {
  localStorage.setItem(`progress_${userId}`, JSON.stringify(all));
}

// 連続学習日数：同じ日に何語やっても+1回だけ、前日から続いていれば加算、途切れていたら1に戻す
function updateStreakIfNeeded() {
  const all = loadProgressAll();
  const prog = all[isbn] || { learnedCount: 0, streak: 0, lastStudyDate: null };
  const today = todayStr();
  if (prog.lastStudyDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    prog.streak = (prog.lastStudyDate === yesterday) ? (prog.streak || 0) + 1 : 1;
    prog.lastStudyDate = today;
  }
  all[isbn] = prog;
  saveProgressAll(all);
}

function syncLearnedCountToProgress() {
  const all = loadProgressAll();
  const prog = all[isbn] || { learnedCount: 0, streak: 0, lastStudyDate: null };
  prog.learnedCount = getLearnedSet().size;
  all[isbn] = prog;
  saveProgressAll(all);
}

// キーボード操作（PC向け）：スペース/Enterでめくる、←→で回答
document.addEventListener('keydown', (e) => {
  if (document.getElementById('quiz-summary').style.display === 'block') return;
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    flipCard();
  } else if (e.code === 'ArrowRight') {
    answerCard(true);
  } else if (e.code === 'ArrowLeft') {
    answerCard(false);
  }
});
