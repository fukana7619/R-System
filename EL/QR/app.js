'use strict';

const video = document.getElementById('qr-video');
const status = document.getElementById('status');

let isRedirecting = false;

// ------------------------------------
// QR Scanner
// ------------------------------------

const qrScanner = new QrScanner(
    video,

    result => {

        // すでに遷移処理中なら無視
        if (isRedirecting) {
            return;
        }

        const scannedText = result.data.trim();

        console.log('QR:', scannedText);

        // --------------------------------
        // URLチェック
        // --------------------------------

        if (
            scannedText.startsWith('http://') ||
            scannedText.startsWith('https://')
        ) {

            isRedirecting = true;

            // --------------------------------
            // 即座にUI停止
            // --------------------------------

            status.textContent = '移動しています…';

            // アニメーション停止
            document.querySelector('.scan-line').style.animation = 'none';

            // --------------------------------
            // カメラ・スキャナ停止
            // --------------------------------

            qrScanner.stop();
            qrScanner.destroy();

            // --------------------------------
            // バイブレーション
            // --------------------------------

            if (navigator.vibrate) {
                navigator.vibrate(50);
            }

            // --------------------------------
            // 即リダイレクト
            // --------------------------------

            window.location.replace(scannedText);

            return;
        }

        // --------------------------------
        // URLではなかった場合
        // --------------------------------

        console.log('URLではないデータ:', scannedText);

    },

    {
        // デコード失敗は無視
        onDecodeError: () => {},

        // できるだけ高速
        maxScansPerSecond: 25,

        // QrScanner側のハイライト
        highlightScanRegion: false,
        highlightCodeOutline: false,

        // 背面カメラ
        preferredCamera: 'environment'
    }
);


// ------------------------------------
// カメラ起動
// ------------------------------------

async function startScanner() {

    try {

        status.textContent = 'カメラを起動しています…';

        await qrScanner.start();

        status.textContent =
            'QRコードをカメラに映してください';

    } catch (error) {

        console.error('Camera error:', error);

        status.textContent =
            'カメラを使用できません。カメラの権限を確認してください。';

    }
}


// ------------------------------------
// ページロード後に起動
// ------------------------------------

startScanner();


// ------------------------------------
// ページを離れるとき
// ------------------------------------

window.addEventListener('pagehide', () => {

    try {
        qrScanner.destroy();
    } catch (e) {
        // 何もしない
    }

});