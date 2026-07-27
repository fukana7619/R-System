// --- IndexedDB 共通処理 ---
let db = null;
function initDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open("PrimeDatabaseCustom", 1);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("primes")) d.createObjectStore("primes", { autoIncrement: true });
      if (!d.objectStoreNames.contains("state")) d.createObjectStore("state");
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
  });
}

function loadState() {
  return new Promise((resolve) => {
    if (!db) return resolve({ current: 2, count: 0, settings: null });
    const tx = db.transaction(["primes", "state"], "readonly");
    const pStore = tx.objectStore("primes");
    const sStore = tx.objectStore("state");
    
    let count = 0, current = 2, settings = null;
    const cReq = pStore.count();
    const sReq = sStore.get("currentNumber");
    const setReq = sStore.get("appSettings");

    tx.oncomplete = () => {
      count = cReq.result || 0;
      current = sReq.result || 2;
      settings = setReq.result || null;
      resolve({ current, count, settings });
    };
    tx.onerror = () => resolve({ current: 2, count: 0, settings: null });
  });
}

function saveStateAndPrimes(primes, lastNum, policy) {
  if (!db) return;
  const tx = db.transaction(["primes", "state"], "readwrite");
  if (policy === 'all' && primes.length > 0) {
    const pStore = tx.objectStore("primes");
    primes.forEach(p => pStore.add(p));
  }
  if (policy !== 'none') {
    tx.objectStore("state").put(lastNum, "currentNumber");
  }
}

// --- 詳細設定の保存機能 ---
function saveCurrentSettings() {
  if (!db) return;
  const settings = {
    engine: selectedEngine,
    savePolicy: savePolicyEl.value,
    saveInterval: saveIntervalEl.value,
    gpuThreads: gpuThreadsInput.value,
    cpuBatch: cpuBatchEl.value,
    domLimit: domLimitEl.value
  };
  const tx = db.transaction(["state"], "readwrite");
  tx.objectStore("state").put(settings, "appSettings");
}

// --- 変数定義 ---
let isRunning = false;
let selectedEngine = 'cpu';
let currentNumber = 2;
let totalPrimeCount = 0;

let checkedInSec = 0;
let opsInSec = 0;
let maxSupportedGpuThreads = 16777216; // 初期値

const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const currentEl = document.getElementById('current');
const countEl = document.getElementById('count');
const scoreEl = document.getElementById('score');
const speedEl = document.getElementById('speed');
const memoryEl = document.getElementById('memory');
const resultDiv = document.getElementById('result');

// カスタム入力エレメント
const savePolicyEl = document.getElementById('savePolicy');
const saveIntervalEl = document.getElementById('saveInterval');
const gpuThreadsInput = document.getElementById('gpuThreads');
const cpuBatchEl = document.getElementById('cpuBatch');
const domLimitEl = document.getElementById('domLimit');

const labelCpu = document.getElementById('labelCpu');
const labelGpu = document.getElementById('labelGpu');
const threadWarningEl = document.getElementById('threadWarning');
const limitTextEl = document.getElementById('gpuLimitText');

// --- 端末のWebGPU限界値を自動取得 ---
async function detectDeviceLimits() {
  if (!navigator.gpu) {
    limitTextEl.textContent = "WebGPU非対応";
    return;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter) {
      const maxWorkgroups = adapter.limits.maxComputeWorkgroupsPerDimension;
      maxSupportedGpuThreads = maxWorkgroups * 256;
      limitTextEl.textContent = `${maxSupportedGpuThreads.toLocaleString()} スレッド`;
    } else {
      limitTextEl.textContent = "取得失敗 (標準: 16,777,216)";
    }
  } catch (e) {
    limitTextEl.textContent = "取得失敗";
  }
}

// 限界値オーバー時のリアルタイム警告制御 ＆ 設定自動保存
gpuThreadsInput.addEventListener('input', () => {
  const val = parseInt(gpuThreadsInput.value) || 0;
  if (val > maxSupportedGpuThreads) {
    threadWarningEl.style.display = 'block';
  } else {
    threadWarningEl.style.display = 'none';
  }
  saveCurrentSettings();
});

// 各設定入力値の変更時に自動保存
[savePolicyEl, saveIntervalEl, cpuBatchEl, domLimitEl].forEach(el => {
  el.addEventListener('change', saveCurrentSettings);
  el.addEventListener('input', saveCurrentSettings);
});

// トグル切替イベント ＆ 設定自動保存
document.querySelectorAll('input[name="engine"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    selectedEngine = e.target.value;
    if (selectedEngine === 'cpu') {
      labelCpu.className = 'engine-option active-cpu';
      labelGpu.className = 'engine-option';
    } else {
      labelGpu.className = 'engine-option active-gpu';
      labelCpu.className = 'engine-option';
    }
    saveCurrentSettings();
  });
});

// --- モニタータイマー (1秒周期) ---
setInterval(() => {
  if (performance.memory) {
    memoryEl.textContent = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
  }
  speedEl.textContent = checkedInSec.toLocaleString();

  if (opsInSec > 0) {
    const divisor = (selectedEngine === 'cpu') ? 10000 : 100000;
    scoreEl.textContent = Math.round(opsInSec / divisor).toLocaleString();
  } else {
    scoreEl.textContent = "0";
  }

  checkedInSec = 0;
  opsInSec = 0;
}, 1000);

// --- CPU モード (Web Worker) ---
let worker = null;
const workerScript = `
  function checkPrime(num) {
    if (num <= 1) return { isPrime: false, ops: 1 };
    if (num === 2) return { isPrime: true, ops: 1 };
    if (num % 2 === 0) return { isPrime: false, ops: 1 };
    let ops = 2;
    const sqrt = Math.sqrt(num);
    for (let i = 3; i <= sqrt; i += 2) {
      ops++;
      if (num % i === 0) return { isPrime: false, ops };
    }
    return { isPrime: true, ops };
  }

  let isRunning = false;
  let currentNumber = 2;

  onmessage = function(e) {
    if (e.data.cmd === 'start') {
      isRunning = true;
      currentNumber = e.data.startNum;
      loop(e.data.batch);
    } else if (e.data.cmd === 'stop') {
      isRunning = false;
    }
  };

  function loop(batch) {
    if (!isRunning) return;
    let found = [];
    let totalOps = 0;

    for (let i = 0; i < batch; i++) {
      const res = checkPrime(currentNumber);
      totalOps += res.ops;
      if (res.isPrime) found.push(currentNumber);
      currentNumber++;
    }

    postMessage({ primes: found, current: currentNumber, ops: totalOps, checked: batch });
    if (isRunning) setTimeout(() => loop(batch), 0);
  }
`;

function runCpuMode() {
  const batchSize = parseInt(cpuBatchEl.value) || 1000;
  const policy = savePolicyEl.value;

  if (!worker) {
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = (e) => {
      if (!isRunning) return;
      const { primes, current, ops, checked } = e.data;
      checkedInSec += checked;
      opsInSec += ops;
      currentNumber = current;
      totalPrimeCount += primes.length;

      currentEl.textContent = currentNumber.toLocaleString();
      countEl.textContent = totalPrimeCount.toLocaleString();

      saveStateAndPrimes(primes, currentNumber, policy);
      appendPrimesToDom(primes);
    };
  }
  worker.postMessage({ cmd: 'start', startNum: currentNumber, batch: batchSize });
}

// --- GPU モード (WebGPU) ---
let gpuDevice = null, gpuPipeline = null;

const wgslCode = `
  struct Uniforms { startNum : u32 };
  @group(0) @binding(0) var<uniform> uniforms : Uniforms;
  @group(0) @binding(1) var<storage, read_write> opsBuffer : array<u32>;
  @group(0) @binding(2) var<storage, read_write> primeBuffer : array<u32>;

  @compute @workgroup_size(256)
  fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    let index = global_id.x;
    let num = uniforms.startNum + index;
    var ops : u32 = 1u;
    var isPrime : u32 = 0u;

    if (num == 2u) {
      isPrime = 1u;
    } else if (num > 2u && num % 2u != 0u) {
      ops = 2u;
      isPrime = 1u;
      let limit = u32(sqrt(f32(num)));
      for (var i : u32 = 3u; i <= limit; i += 2u) {
        ops += 1u;
        if (num % i == 0u) {
          isPrime = 0u;
          break;
        }
      }
    }

    opsBuffer[index] = ops;
    if (isPrime == 1u) {
      primeBuffer[index] = num;
    } else {
      primeBuffer[index] = 0u;
    }
  }
`;

async function initGPU() {
  if (!navigator.gpu) { alert("WebGPU非対応ブラウザです"); return false; }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return false;
  gpuDevice = await adapter.requestDevice();
  const module = gpuDevice.createShaderModule({ code: wgslCode });
  gpuPipeline = gpuDevice.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' }
  });
  return true;
}

async function runGpuMode() {
  if (!gpuDevice) {
    const ok = await initGPU();
    if (!ok) { stopCalculation(); return; }
  }

  const totalThreads = parseInt(gpuThreadsInput.value) || 65536;
  const workgroups = Math.ceil(totalThreads / 256);
  const policy = savePolicyEl.value;

  const uniformBuffer = gpuDevice.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const opsBuffer = gpuDevice.createBuffer({ size: totalThreads * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const primeBuffer = gpuDevice.createBuffer({ size: totalThreads * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });

  const readOpsBuffer = gpuDevice.createBuffer({ size: totalThreads * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const readPrimeBuffer = gpuDevice.createBuffer({ size: totalThreads * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

  const bindGroup = gpuDevice.createBindGroup({
    layout: gpuPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: opsBuffer } },
      { binding: 2, resource: { buffer: primeBuffer } }
    ]
  });

  const uintBufferArray = new Uint32Array(1);

  while (isRunning) {
    const domLimit = parseInt(domLimitEl.value) || 0;

    uintBufferArray[0] = currentNumber;
    gpuDevice.queue.writeBuffer(uniformBuffer, 0, uintBufferArray);

    const encoder = gpuDevice.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(gpuPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroups);
    pass.end();

    encoder.copyBufferToBuffer(opsBuffer, 0, readOpsBuffer, 0, totalThreads * 4);
    encoder.copyBufferToBuffer(primeBuffer, 0, readPrimeBuffer, 0, totalThreads * 4);
    gpuDevice.queue.submit([encoder.finish()]);

    await readOpsBuffer.mapAsync(GPUMapMode.READ);
    const opsRes = new Uint32Array(readOpsBuffer.getMappedRange());
    let batchOps = 0;
    for (let i = 0; i < totalThreads; i++) batchOps += opsRes[i];
    readOpsBuffer.unmap();

    let foundPrimes = [];
    let foundCountInBatch = 0;

    await readPrimeBuffer.mapAsync(GPUMapMode.READ);
    const primeRes = new Uint32Array(readPrimeBuffer.getMappedRange());
    
    const needArray = (domLimit > 0 || policy === 'all');
    for (let i = 0; i < totalThreads; i++) {
      if (primeRes[i] !== 0) {
        foundCountInBatch++;
        if (needArray) foundPrimes.push(primeRes[i]);
      }
    }
    readPrimeBuffer.unmap();

    checkedInSec += totalThreads;
    opsInSec += batchOps;
    currentNumber += totalThreads;
    totalPrimeCount += foundCountInBatch;

    currentEl.textContent = currentNumber.toLocaleString();
    countEl.textContent = totalPrimeCount.toLocaleString();

    saveStateAndPrimes(foundPrimes, currentNumber, policy);
    if (domLimit > 0) appendPrimesToDom(foundPrimes);
  }

  uniformBuffer.destroy();
  opsBuffer.destroy();
  primeBuffer.destroy();
  readOpsBuffer.destroy();
  readPrimeBuffer.destroy();
}

// --- DOM描画補助 ---
function appendPrimesToDom(primes) {
  const domLimit = parseInt(domLimitEl.value);
  if (domLimit === 0 || primes.length === 0) return;

  const txt = primes.join(', ') + ', ';
  resultDiv.appendChild(document.createTextNode(txt));
  resultDiv.scrollTop = resultDiv.scrollHeight;

  if (resultDiv.textContent.length > domLimit + 1000) {
    let trimmed = resultDiv.textContent.slice(-domLimit);
    const idx = trimmed.indexOf(',');
    if (idx !== -1) trimmed = trimmed.slice(idx + 2);
    resultDiv.textContent = trimmed;
  }
}

// --- 制御ロジック ---
startBtn.addEventListener('click', async () => {
  await initDB();
  const state = await loadState();
  if (!isRunning) {
    currentNumber = state.current;
    totalPrimeCount = state.count;
    countEl.textContent = totalPrimeCount.toLocaleString();
  }

  // 計算開始時に現在の設定をDBに保存
  saveCurrentSettings();

  isRunning = true;
  statusEl.textContent = selectedEngine.toUpperCase() + " で計算中...";
  startBtn.disabled = true;
  pauseBtn.disabled = false;
  resetBtn.disabled = true;

  document.querySelectorAll('input[name="engine"]').forEach(r => r.disabled = true);

  if (selectedEngine === 'cpu') runCpuMode();
  else runGpuMode();
});

function stopCalculation() {
  isRunning = false;
  if (worker) worker.postMessage({ cmd: 'stop' });
  statusEl.textContent = "一時停止中";
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  resetBtn.disabled = false;
  document.querySelectorAll('input[name="engine"]').forEach(r => r.disabled = false);
}

pauseBtn.addEventListener('click', stopCalculation);

// --- DBダウンロード機能 ---
downloadBtn.addEventListener('click', async () => {
  await initDB();
  if (!db) { alert("保存されたDBデータがありません。"); return; }

  const tx = db.transaction(["primes", "state"], "readonly");
  const pStore = tx.objectStore("primes");
  const req = pStore.getAll();

  req.onsuccess = () => {
    const primes = req.result;
    if (!primes || primes.length === 0) {
      alert("保存されている素数データがありません。（※「状態のみ保存」モードの場合はダウンロード対象の個別素数は保存されません）");
      return;
    }

    const blob = new Blob([primes.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `primes_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
});

resetBtn.addEventListener('click', async () => {
  if (confirm("全データを削除して初期化しますか？")) {
    stopCalculation();
    if (worker) { worker.terminate(); worker = null; }
    if (db) { db.close(); db = null; }
    await indexedDB.deleteDatabase("PrimeDatabaseCustom");
    currentNumber = 2;
    totalPrimeCount = 0;
    currentEl.textContent = "2";
    countEl.textContent = "0";
    scoreEl.textContent = "0";
    speedEl.textContent = "0";
    resultDiv.textContent = "";
    statusEl.textContent = "リセット完了";
  }
});

// --- ページ読み込み完了時の初期化処理 ---
document.addEventListener('DOMContentLoaded', async () => {
  await detectDeviceLimits();

  await initDB();
  const state = await loadState();
  currentNumber = state.current;
  totalPrimeCount = state.count;

  // 保存されているカスタム設定があればフォームに復元
  if (state.settings) {
    const s = state.settings;
    if (s.engine) {
      selectedEngine = s.engine;
      const radio = document.querySelector(`input[name="engine"][value="${s.engine}"]`);
      if (radio) radio.checked = true;
      if (s.engine === 'cpu') {
        labelCpu.className = 'engine-option active-cpu';
        labelGpu.className = 'engine-option';
      } else {
        labelGpu.className = 'engine-option active-gpu';
        labelCpu.className = 'engine-option';
      }
    }
    if (s.savePolicy !== undefined) savePolicyEl.value = s.savePolicy;
    if (s.saveInterval !== undefined) saveIntervalEl.value = s.saveInterval;
    if (s.gpuThreads !== undefined) gpuThreadsInput.value = s.gpuThreads;
    if (s.cpuBatch !== undefined) cpuBatchEl.value = s.cpuBatch;
    if (s.domLimit !== undefined) domLimitEl.value = s.domLimit;
  }

  currentEl.textContent = currentNumber.toLocaleString();
  countEl.textContent = totalPrimeCount.toLocaleString();

  const val = parseInt(gpuThreadsInput.value) || 0;
  if (val > maxSupportedGpuThreads) {
    threadWarningEl.style.display = 'block';
  } else {
    threadWarningEl.style.display = 'none';
  }
});
