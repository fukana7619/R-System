const gasUrl = "https://script.google.com/macros/s/AKfycbxowZsvBN-F13yUesQF5iFwAccdcfh_ByawUxWtwkeFrdyo9Yq9l6PZ3oXaZTz9pTHp/exec";
const urlParams = new URLSearchParams(window.location.search);
const isbn = urlParams.get('isbn');

let quizQueue = [];
let allWords = [];
let currentIdx = 0;
let correctCount = 0;
let currentQuestionLog = {}; // 今回のセッションの回答記録

window.onload = async () => {
  const localData = localStorage.getItem(`book_${isbn}`);
  if (!localData) {
    alert("単語データが見つかりません。ホームに戻ります。");
    location.href = 'index.html';
    return;
  }
  
  allWords = JSON.parse(localData);
  quizQueue = shuffle([...allWords]).slice(0, 10); // 10問抽出
  
  updateProgressBar(); // プログレスバーの初期化(0%)
  renderQuestion();
};

// プログレスバーの更新
function updateProgressBar() {
  const progress = (currentIdx / quizQueue.length) * 100;
  const fillEl = document.getElementById('quiz-progress-fill');
  if (fillEl) {
    fillEl.style.width = `${progress}%`;
  }
}

// 問題の描画
function renderQuestion() {
  const q = quizQueue[currentIdx];
  const type = Math.random() > 0.5 ? 'choice' : 'typing';
  
  document.getElementById('display-word').textContent = (type === 'choice') ? q.word : q.meaning;
  document.getElementById('question-type-label').textContent = (type === 'choice') ? "意味を選んでください" : "スペルを入力してください";

  if (type === 'choice') {
    setupChoice(q);
  } else {
    setupTyping(q);
  }
}

// 4択クイズのセットアップ
function setupChoice(correctWord) {
  const choiceArea = document.getElementById('choice-area');
  choiceArea.style.display = 'grid';
  document.getElementById('typing-area').style.display = 'none';
  choiceArea.innerHTML = '';

  const dummies = allWords
    .filter(w => w.id !== correctWord.id)
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);

  const choices = shuffle([correctWord, ...dummies]);

  choices.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = c.meaning;
    btn.onclick = () => checkAnswer(c.id === correctWord.id, correctWord.meaning, correctWord.id);
    choiceArea.appendChild(btn);
  });
}

// タイピングクイズのセットアップ
function setupTyping(correctWord) {
  const typingArea = document.getElementById('typing-area');
  typingArea.style.display = 'block';
  document.getElementById('choice-area').style.display = 'none';
  
  const input = document.getElementById('typing-input');
  input.value = '';
  input.focus();
  
  input.onkeypress = (e) => {
    if (e.key === 'Enter') {
      const isCorrect = input.value.trim().toLowerCase() === correctWord.word.toLowerCase();
      checkAnswer(isCorrect, correctWord.word, correctWord.id);
    }
  };
}

// 回答チェック
function checkAnswer(isCorrect, answerText, wordId) {
  const panel = document.getElementById('feedback-panel');
  panel.className = 'feedback-panel ' + (isCorrect ? 'correct' : 'incorrect');
  document.getElementById('feedback-message').textContent = isCorrect ? "正解です！" : "惜しい！";
  document.getElementById('correct-answer-display').textContent = isCorrect ? "" : `正解: ${answerText}`;
  
  // 今日の日付で回答ログを記録
  currentQuestionLog[wordId] = {
    isCorrect: isCorrect,
    lastLearned: new Date().toISOString()
  };

  if (isCorrect) correctCount++;
}

// 次の問題へ
function nextQuestion() {
  // フィードバックパネルを引っ込める
  document.getElementById('feedback-panel').className = 'feedback-panel';
  
  currentIdx++;
  updateProgressBar(); // 進捗バーを進める

  if (currentIdx < quizQueue.length) {
    renderQuestion();
  } else {
    showSummary();
  }
}

// レッスン完了画面表示
function showSummary() {
  document.getElementById('quiz-area').style.display = 'none';
  document.getElementById('quiz-summary').style.display = 'block';
  document.getElementById('summary-score').textContent = correctCount * 10;
  document.getElementById('summary-accuracy').textContent = `${Math.round((correctCount / quizQueue.length) * 100)}%`;
  
  // 進捗バーをMAXに
  document.getElementById('quiz-progress-fill').style.width = '100%';
}

// 進捗を保存してホームへ戻る
async function saveAndExit() {
  const userId = localStorage.getItem('ra_user_id');
  if (!userId) {
    location.href = 'index.html';
    return;
  }

  const progressKey = `progress_${userId}`;
  const localProgress = JSON.parse(localStorage.getItem(progressKey)) || {};
  
  const courseProgress = localProgress[isbn] || { learnedCount: 0, streak: 1, wordLogs: {} };
  
  // ログのマージ
  courseProgress.wordLogs = { ...courseProgress.wordLogs, ...currentQuestionLog };
  
  // 過去一度でも正解した単語の総数をカウント
  const learnedSet = new Set(
    Object.keys(courseProgress.wordLogs).filter(id => courseProgress.wordLogs[id].isCorrect)
  );
  courseProgress.learnedCount = learnedSet.size;

  localProgress[isbn] = courseProgress;
  
  // LocalStorageに保存
  localStorage.setItem(progressKey, JSON.stringify(localProgress));

  // ホームに戻る
  location.href = 'index.html';
}

// 途中でやめる（✕ボタン）
function exitQuiz() {
  if (confirm("学習を中断して戻りますか？")) {
    location.href = 'index.html';
  }
}

// 配列シャッフル関数
function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}
