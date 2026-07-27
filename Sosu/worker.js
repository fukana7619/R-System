// worker.js

// IndexedDB の初期化・接続
let db = null;
const request = indexedDB.open("PrimeDatabase", 1);

request.onupgradeneeded = (e) => {
  db = e.target.result;
  // 'primes' という名前のストア（テーブル）を作成（キーは自動連番）
  if (!db.objectStoreNames.contains("primes")) {
    db.createObjectStore("primes", { autoIncrement: true });
  }
};

request.onsuccess = (e) => {
  db = e.target.result;
};

// 素数判定関数
function isPrime(num) {
  if (num <= 1) return false;
  if (num === 2) return true;
  if (num % 2 === 0) return false;
  const sqrt = Math.sqrt(num);
  for (let i = 3; i <= sqrt; i += 2) {
    if (num % i === 0) return false;
  }
  return true;
}

let currentNumber = 2;

// IndexedDB に素数の配列を保存する関数
function savePrimesToDB(primes) {
  if (!db || primes.length === 0) return;

  const transaction = db.transaction(["primes"], "readwrite");
  const store = transaction.objectStore("primes");
  
  // 1個ずつ保存
  primes.forEach(prime => {
    store.add(prime);
  });
}

function calculate() {
  let foundPrimes = [];

  for (let i = 0; i < 1000; i++) {
    if (isPrime(currentNumber)) {
      foundPrimes.push(currentNumber);
    }
    currentNumber++;
  }

  // DBに保存
  savePrimesToDB(foundPrimes);

  // 画面描画用としてメインスレッドへ結果送信
  postMessage({
    primes: foundPrimes,
    current: currentNumber
  });

  setTimeout(calculate, 0);
}

onmessage = function(e) {
  if (e.data === 'start') {
    calculate();
  }
};
