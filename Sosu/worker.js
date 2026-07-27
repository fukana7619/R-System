// worker.js

// 素数判定関数（試し割り法）
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

function calculate() {
  // ループ処理で高速化（1000個判定ごとにメインスレッドへ進捗報告）
  let foundPrimes = [];
  
  for (let i = 0; i < 1000; i++) {
    if (isPrime(currentNumber)) {
      foundPrimes.push(currentNumber);
    }
    currentNumber++;
  }

  // 見つかった素数の配列と、現在の計算位置をメインスレッドに送信
  postMessage({
    primes: foundPrimes,
    current: currentNumber
  });

  // 次の計算ブロックへ
  setTimeout(calculate, 0);
}

// メインスレッドからの開始指示を待つ
onmessage = function(e) {
  if (e.data === 'start') {
    calculate();
  }
};
