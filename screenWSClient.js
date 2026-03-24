/**
 * 心事紋路 · 大螢幕 WebSocket Client
 * 
 * 這段程式碼插入 xinshi_cockpit_screen.html 的 <script> 區塊頂部。
 * 取代原本 hardcoded 的 PLANETS 陣列，改為從 WS Server 動態接收。
 * 
 * 整合方式：
 *   1. 將此檔案內容貼入 cockpit HTML 的 <script> 最前面
 *   2. 刪除原本的 const PLANETS = [...] 靜態陣列
 *   3. startPlanet() 改為呼叫 requestNextFromServer()
 *   4. WARP phase 結束時呼叫 requestNextFromServer() 而非 startPlanet(idx+1)
 */

// ─── 設定 ────────────────────────────────────────────────────
const WS_SERVER = 'ws://localhost:8080';  // 上線後換成 wss://
const SCREEN_ID = 'atт4fun_taipei_01';   // 每台螢幕的唯一 ID

// ─── 狀態 ────────────────────────────────────────────────────
let ws = null;
let wsReady = false;
let reconnectDelay = 2000;
let currentPost = null;    // 當前播放的 post 資料
let pendingPlay = null;    // Server 推送但還在 WARP 中尚未切換的下一顆

// Demo fallback（Server 離線時用）
const DEMO_PLANETS = [
  {
    postId: 'demo_1',
    quote: '你說會記得我，但後來的每一個夜晚我都是一個人。',
    tags: '# 孤獨 · # 失落', hz: '432', orbit: 'DEEP SPACE',
    color1: '#7c3aed', color2: '#db2777', color3: '#0891b2',
    size: 1.0, bgHue: '260',
    imageUrl: null  // null = 用程序生成的紋路
  },
  {
    postId: 'demo_2',
    quote: '我只是很累，不是不在乎你們。只是今天好像什麼都壓著我。',
    tags: '# 疲憊 · # 壓抑', hz: '396', orbit: 'DARK NEBULA',
    color1: '#db2777', color2: '#7c3aed', color3: '#064e3b',
    size: 0.85, bgHue: '320',
    imageUrl: null
  },
  {
    postId: 'demo_3',
    quote: '有時候憤怒只是害怕被拋下的另一種說法。',
    tags: '# 憤怒 · # 委屈', hz: '528', orbit: 'FIRE RING',
    color1: '#d97706', color2: '#dc2626', color3: '#7c3aed',
    size: 0.9, bgHue: '20',
    imageUrl: null
  },
  {
    postId: 'demo_4',
    quote: '有時候平靜不是放下了，是麻了。麻到感覺不到邊界在哪。',
    tags: '# 虛空 · # 迷霧', hz: '639', orbit: 'COLD DRIFT',
    color1: '#0891b2', color2: '#5b21b6', color3: '#065f46',
    size: 0.95, bgHue: '195',
    imageUrl: null
  },
];
let demoIdx = 0;

// ─── 將 Server 推送的 post 格式化為 cockpit 需要的 pData ──────
function serverPostToPlanetData(post) {
  if (!post) return null;
  return {
    postId:   post.postId,
    quote:    post.quote   || '…',
    tags:     post.tags    || '# 未知',
    hz:       post.hz      || '432',
    orbit:    post.style   || 'DEEP SPACE',
    color1:   post.color1  || '#7c3aed',
    color2:   post.color2  || '#db2777',
    color3:   post.color3  || '#0891b2',
    bgHue:    post.bgHue   || '260',
    size:     1.0,
    imageUrl: post.imageUrl || null,   // 有真實圖片時覆蓋 texture
  };
}

// ─── QR Code URL ──────────────────────────────────────────────
// 實際上線後用 qrcode.js 動態生成，目前以文字代替
function getPostUrl(postId) {
  return `https://xinshi.app/p/${postId}`;
}

// ─── 更新大螢幕 UI（右側 QR 和情緒資料）─────────────────────
function updateScreenUI(pData) {
  if (!pData) return;

  // QR 碼（實際用 qrcode.js 替換）
  const qrUrl = getPostUrl(pData.postId);
  drawQRForUrl(qrUrl);  // 見下方

  // 情緒卡
  const ecTag   = document.getElementById('ec-tag');
  const ecQuote = document.getElementById('ec-quote');
  const ecMeta  = document.getElementById('ec-meta');
  if (ecTag)   ecTag.textContent   = pData.tags;
  if (ecQuote) ecQuote.textContent = pData.quote;
  if (ecMeta)  ecMeta.textContent  = `${pData.hz} Hz · ${pData.orbit} · 掃碼共鳴`;

  // HUD
  const hudTarget = document.getElementById('hud-target');
  const hudOrbit  = document.getElementById('hud-orbit');
  if (hudTarget) hudTarget.textContent = 'TARGET  ' + (pData.tags.split('·')[0].trim());
  if (hudOrbit)  hudOrbit.textContent  = 'ORBIT CLASS  ' + pData.orbit;
}

// ─── QR 碼動態生成 ─────────────────────────────────────────
// 用 qrcode.js 產生真實 QR（引入 CDN）
function drawQRForUrl(url) {
  const qc = document.getElementById('qr-canvas');
  if (!qc) return;
  const ctx = qc.getContext('2d');

  // 嘗試用 qrcode.js（需在 HTML 引入）
  if (typeof QRCode !== 'undefined') {
    // 清空 canvas，用 QRCode 寫入
    ctx.clearRect(0, 0, qc.width, qc.height);
    const qr = new QRCode(qc, {
      text: url,
      width: qc.width,
      height: qc.height,
      colorDark: 'rgba(140,210,255,0.9)',
      colorLight: '#050a14',
      correctLevel: QRCode.CorrectLevel.M,
    });
  }
  // 若未引入 qrcode.js，保留原本手繪像素 QR（fallback）
}

// ─── 告訴 Server 播放完了，請求下一顆 ────────────────────────
function requestNextFromServer() {
  if (wsReady) {
    ws.send(JSON.stringify({ type: 'request_next', screenId: SCREEN_ID }));
  } else {
    // 離線 demo 模式
    demoIdx = (demoIdx + 1) % DEMO_PLANETS.length;
    const pData = serverPostToPlanetData(DEMO_PLANETS[demoIdx]);
    currentPost = pData;
    updateScreenUI(pData);
    startPlanet_fromData(pData);  // cockpit 的 startPlanet 變體，見下
  }
}

// ─── 曝光計數：ORBIT phase 結束時呼叫 ─────────────────────────
function reportExposureTick() {
  if (!currentPost?.postId || !wsReady) return;
  ws.send(JSON.stringify({
    type: 'exposure_tick',
    postId: currentPost.postId,
    screenId: SCREEN_ID,
  }));
}

// ─── WebSocket 連線 ──────────────────────────────────────────
function connectWS() {
  ws = new WebSocket(WS_SERVER);

  ws.onopen = () => {
    console.log('[Screen WS] connected');
    wsReady = true;
    reconnectDelay = 2000;
    // 向 server 登記自己是螢幕
    ws.send(JSON.stringify({ type: 'register', role: 'screen', screenId: SCREEN_ID }));
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    switch (msg.type) {

      case 'play_next': {
        if (!msg.post) {
          // 隊列空了，切回 demo 模式
          setTimeout(() => {
            demoIdx = (demoIdx + 1) % DEMO_PLANETS.length;
            const pData = serverPostToPlanetData(DEMO_PLANETS[demoIdx]);
            currentPost = pData;
            updateScreenUI(pData);
            startPlanet_fromData(pData);
          }, 1000);
          break;
        }
        const pData = serverPostToPlanetData(msg.post);

        // 更新右側面板的佇列長度
        const queueLabel = document.querySelector('.queue-item.active .queue-name');
        if (queueLabel) queueLabel.textContent = 'NOW PLAYING';

        if (msg.queueLength !== undefined) {
          const dashCount = document.getElementById('dash-count');
          // 不要在這裡覆蓋 liveCount，只更新佇列顯示
        }

        // 如果正在 WARP，等 WARP 結束後才切換（pendingPlay）
        // 如果 idle，直接開始
        if (typeof phase !== 'undefined' && phase === 'WARP') {
          pendingPlay = pData;
        } else {
          currentPost = pData;
          updateScreenUI(pData);
          startPlanet_fromData(pData);
        }
        break;
      }

      case 'exposure_ack': {
        // Server 確認曝光累積，更新左側 panel 數字
        const liveEl = document.getElementById('liveCount');
        if (liveEl && msg.totalExposure) {
          liveEl.textContent = msg.totalExposure;
        }
        break;
      }
    }
  };

  ws.onclose = () => {
    wsReady = false;
    console.log(`[Screen WS] disconnected, retry in ${reconnectDelay}ms`);
    setTimeout(connectWS, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
  };

  ws.onerror = (err) => console.warn('[Screen WS] error', err);
}

// ─── startPlanet 的資料驅動版本 ──────────────────────────────
// 在 cockpit HTML 裡，把原本的 startPlanet(idx) 改為此函式
// 差別：接受完整 pData 物件而非索引
function startPlanet_fromData(pData) {
  if (!pData) return;

  // 如果有真實 imageUrl，載入圖片作為 texture
  if (pData.imageUrl) {
    const loader = new THREE.TextureLoader();
    loader.load(pData.imageUrl, (tex) => {
      if (planetMesh) {
        planetMesh.material.map = tex;
        planetMesh.material.emissiveMap = tex;
        planetMesh.material.needsUpdate = true;
      }
    });
  }

  // 其他邏輯與原本 startPlanet() 相同
  // （保留原始函式，只在這裡呼叫前先設好 pData）
  // 將 PLANETS[planetIdx] 的引用全部改為讀取 currentPost
}

// ─── 啟動 ────────────────────────────────────────────────────
// 先用 demo 資料啟動（避免 Server 未連線時畫面空白）
currentPost = serverPostToPlanetData(DEMO_PLANETS[0]);
updateScreenUI(currentPost);
// 然後嘗試連 WS
connectWS();

/**
 * ─── 在 cockpit HTML 裡需要做的修改 ─────────────────────────
 * 
 * 1. HTML <head> 加入 qrcode.js：
 *    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
 * 
 * 2. 刪除 const PLANETS = [...] 靜態陣列
 * 
 * 3. WARP phase 結束處（原本 startPlanet(planetIdx+1)）改為：
 *    if (pendingPlay) {
 *      currentPost = pendingPlay; pendingPlay = null;
 *      updateScreenUI(currentPost);
 *      startPlanet_fromData(currentPost);
 *    } else {
 *      requestNextFromServer();
 *    }
 * 
 * 4. ORBIT phase 結束處加入：
 *    reportExposureTick();
 * 
 * 5. 所有 PLANETS[planetIdx] 讀取改為 currentPost
 */
