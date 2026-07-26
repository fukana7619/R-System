const gasUrl = "YOUR_GAS_URL";
const urlParams = new URLSearchParams(window.location.search);
const isbn = urlParams.get('isbn');

let quizQueue = [];
let allWords = [];
let currentIdx = 0;
let correctCount = 0;

window.onload = async () => {
  allWords = JSON.parse(localStorage.getItem(`book_${isbn}`));
  quizQueue = shuffle([...allWords]).slice(0, 10); // 今回は10問出題
  renderQuestion();
};

function renderQuestion() {
  const q = quizQueue[currentIdx];
  const type = Math.random() > 0.5 ? 'choice' : 'typing'; // 形式をランダムに
  
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

  // ダミーの選択肢を3つ作る
  const dummies = allWords
    .filter(w => w.id !== correctWord.id)
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);

  const choices = shuffle([correctWord, ...dummies]);

  choices.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = c.meaning;
    btn.onclick = () => checkAnswer(c.id === correctWord.id, correctWord.meaning);
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
  input.onkeypress = (e) => {
    if (e.key === 'Enter') checkAnswer(input.value.trim().toLowerCase() === correctWord.word.toLowerCase(), correctWord.word);
  };
}

// 回答チェック
function checkAnswer(isCorrect, answerText) {
  const panel = document.getElementById('feedback-panel');
  panel.className = 'feedback-panel ' + (isCorrect ? 'correct' : 'incorrect');
  document.getElementById('feedback-message').textContent = isCorrect ? "正解です！" : "惜しい！";
  document.getElementById('correct-answer-display').textContent = isCorrect ? "" : `正解: ${answerText}`;
  
  if (isCorrect) correctCount++;
}

function nextQuestion() {
  document.getElementById('feedback-panel').className = 'feedback-panel';
  currentIdx++;
  
  const progress = (currentIdx / quizQueue.length) * 100;
  document.getElementById('quiz-progress-fill').style.width = `${progress}%`;

  if (currentIdx < quizQueue.length) {
    renderQuestion();
  } else {
    showSummary();
  }
}

// 終了時：LocalDBを更新
function showSummary() {
  document.getElementById('quiz-area').style.display = 'none';
  document.getElementById('quiz-summary').style.display = 'block';
  document.getElementById('summary-score').textContent = correctCount * 10;
  document.getElementById('summary-accuracy').textContent = `${Math.round((correctCount/quizQueue.length)*100)}%`;
}

// 保存して終了（ここでGASに一括送信）
async function saveAndExit() {
  const userId = localStorage.getItem('ra_user_id');
  const progress = JSON.parse(localStorage.getItem(`progress_${userId}`)) || {};
  
  // 進捗データのマージ（今回のクリア分を追加）
  // ... (ここでJSONを組み立てる)

  // 終了ボタンのアクション
  alert("GASへデータを送信中...");
  // fetch(gasUrl, { cmd: 'enterline', ... })
  location.href = 'index.html';
}

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}
