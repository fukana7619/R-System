self.onmessage = function(e) {
  let current = parseInt(e.data.startNum);
  const endNum = e.data.endNum ? parseInt(e.data.endNum) : Infinity;

  while (current <= endNum) {
    const isPrimeNum = checkPrime(current);

    if (isPrimeNum) {
      self.postMessage({ type: 'prime', number: current });
    }

    current++;
  }
};

function checkPrime(num) {
  if (num < 2) return false;

  const maxDivisor = Math.floor(Math.sqrt(num));
  
  if (maxDivisor < 2) {
    self.postMessage({
      type: 'step',
      target: num,
      divisor: '-',
      progress: 100
    });
    return num >= 2;
  }

  for (let i = 2; i <= maxDivisor; i++) {
    const progress = Math.floor(((i - 1) / (maxDivisor - 1)) * 100);

    self.postMessage({
      type: 'step',
      target: num,
      divisor: i,
      progress: Math.min(progress, 100)
    });

    if (num % i === 0) {
      return false;
    }
  }

  return true;
}