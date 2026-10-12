'use strict';

const video = document.getElementById('video');
const status = document.getElementById('status');

let scanning = true;
let detector = null;

let lastDetectionTime = 0;

// --------------------------------------------------
// QR読み取り成功
// --------------------------------------------------

function handleResult(value) {

    if (!scanning) {
        return;
    }

    if (!value) {
        return;
    }

    const text = value.trim();

    console.log('QR:', text);

    // URLだけ処理
    if (
        text.startsWith('https://') ||
        text.startsWith('http://')
    ) {

        scanning = false;

        // バイブレーション
        if (navigator.vibrate) {
            navigator.vibrate(40);
        }

        // UI停止
        status.textContent = '移動中...';

        // カメラ停止
        if (video.srcObject) {

            video.srcObject
                .getTracks()
                .forEach(track => track.stop());

            video.srcObject = null;
        }

        // 即遷移
        window.location.replace(text);
    }
}


// --------------------------------------------------
// カメラ
// --------------------------------------------------

async function startCamera() {

    const stream = await navigator.mediaDevices.getUserMedia({

        video: {
            facingMode: {
                ideal: 'environment'
            },

            // QR検出用に高解像度
            width: {
                ideal: 1920
            },

            height: {
                ideal: 1080
            },

            // オートフォーカスを要求
            focusMode: 'continuous'
        },

        audio: false
    });

    video.srcObject = stream;

    await video.play();

    status.textContent = 'QRコードを探しています...';
}


// --------------------------------------------------
// BarcodeDetector
// --------------------------------------------------

async function startNativeScanner() {

    // APIそのものがない
    if (!('BarcodeDetector' in window)) {

        throw new Error(
            'BarcodeDetector is not supported'
        );
    }

    // QRに対応しているか確認
    const formats =
        await BarcodeDetector.getSupportedFormats();

    if (!formats.includes('qr_code')) {

        throw new Error(
            'QR detection is not supported'
        );
    }

    // QRだけ検出
    detector = new BarcodeDetector({
        formats: ['qr_code']
    });

    scanLoop();
}


// --------------------------------------------------
// 高速スキャンループ
// --------------------------------------------------

async function scanLoop() {

    if (!scanning) {
        return;
    }

    // カメラ映像がまだ準備できていない
    if (
        video.readyState <
        HTMLMediaElement.HAVE_ENOUGH_DATA
    ) {

        requestAnimationFrame(scanLoop);

        return;
    }

    // 前回検出から最低限の間隔
    const now = performance.now();

    if (now - lastDetectionTime < 20) {

        requestAnimationFrame(scanLoop);

        return;
    }

    lastDetectionTime = now;

    try {

        const results =
            await detector.detect(video);

        if (results.length > 0) {

            const result = results[0];

            handleResult(
                result.rawValue
            );

            return;
        }

    } catch (error) {

        // 一時的な検出エラーは無視
        console.debug(
            'detect:',
            error
        );
    }

    requestAnimationFrame(scanLoop);
}


// --------------------------------------------------
// 起動
// --------------------------------------------------

async function main() {

    try {

        await startCamera();

        await startNativeScanner();

    } catch (error) {

        console.error(error);

        status.textContent =
            'このブラウザでは高速QR読み取りを利用できません。';

    }
}


// --------------------------------------------------
// 開始
// --------------------------------------------------

main();


// --------------------------------------------------
// ページ離脱時にカメラ停止
// --------------------------------------------------

window.addEventListener(
    'pagehide',
    () => {

        scanning = false;

        if (video.srcObject) {

            video.srcObject
                .getTracks()
                .forEach(track => track.stop());

        }

    }
);
