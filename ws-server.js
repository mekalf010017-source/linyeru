/**
 * 心事紋路 · WebSocket Server
 * 
 * 負責：
 *   1. 手機 App 送出投放請求 → 加入佇列
 *   2. 大螢幕連線後接收播放指令，WARP 結束時請求下一顆
 *   3. 大螢幕每次完整播放回傳 exposure_tick → 累加曝光數
 *   4. 路人落地頁按共鳴 → 推播通知給原作者
 * 
 * 訊息格式（所有訊息都是 JSON）：
 * 
 * Client → Server:
 *   { type: 'register',      role: 'screen' | 'app' | 'landing', screenId?, userId? }
 *   { type: 'project',       postId, imageUrl, quote, tags, hz, style, duration, userId, anonymous }
 *   { type: 'exposure_tick', postId, screenId }
 *   { type: 'resonate',      postId, fromUserId? }
 *   { type: 'request_next',  screenId }
 * 
 * Server → Client:
 *   { type: 'play_next',     post: { postId, imageUrl, quote, tags, hz, style, color1, color2, color3 }, queueLength }
 *   { type: 'queue_update',  position, queueLength, estimatedMinutes }
 *   { type: 'exposure_ack',  postId, totalExposure }
 *   { type: 'resonate_push', postId, resonateCount }  → to original author
 *   { type: 'screen_list',   screens: [{ screenId, location, online }] }
 *   { type: 'error',         message }
 */

const WebSocket = require('ws');
const http = require('http');
const admin = require('firebase-admin');

const PORT = process.env.WS_PORT || 8080;

// ─── In-memory state ─────────────────────────────────────────
// Production: replace with Redis for multi-process support
const state = {
  // Connected clients by role
  screens:  new Map(),  // screenId → ws
  appUsers: new Map(),  // userId  → ws
  landing:  new Map(),  // sessionId → ws

  // Projection queue per screen (default: 'global')
  queues: new Map(),    // screenId → [ post, post, ... ]

  // Currently playing per screen
  nowPlaying: new Map(), // screenId → post

  // Exposure counts
  exposures: new Map(),  // postId → number
};

// ─── HTTP server (needed for ws upgrade) ─────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      screens: state.screens.size,
      queueTotal: [...state.queues.values()].reduce((s, q) => s + q.length, 0)
    }));
  } else {
    res.writeHead(404); res.end();
  }
});

const wss = new WebSocket.Server({ server });

// ─── Helpers ─────────────────────────────────────────────────
function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcast(clients, obj) {
  const msg = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function getQueue(screenId = 'global') {
  if (!state.queues.has(screenId)) state.queues.set(screenId, []);
  return state.queues.get(screenId);
}

function notifyQueuePosition(userId, screenId) {
  const ws = state.appUsers.get(userId);
  if (!ws) return;
  const q = getQueue(screenId);
  const pos = q.findIndex(p => p.userId === userId);
  if (pos === -1) return;
  send(ws, {
    type: 'queue_update',
    position: pos + 1,
    queueLength: q.length,
    estimatedMinutes: (pos + 1) * 2  // rough estimate: 2 min per slot
  });
}

async function incrementExposure(postId) {
  const current = (state.exposures.get(postId) || 0) + 1;
  state.exposures.set(postId, current);

  // Persist to Firebase (fire-and-forget, don't block WS)
  try {
    await admin.firestore()
      .collection('posts').doc(postId)
      .update({ exposureCount: admin.firestore.FieldValue.increment(1) });
  } catch (e) {
    console.warn('Firebase exposure update failed:', e.message);
  }

  return current;
}

async function pushResonateNotification(postId) {
  try {
    const doc = await admin.firestore().collection('posts').doc(postId).get();
    if (!doc.exists) return;
    const { authorId, anonymous } = doc.data();
    if (!authorId) return;

    // Update resonate count in DB
    await doc.ref.update({ resonateCount: admin.firestore.FieldValue.increment(1) });
    const newCount = (doc.data().resonateCount || 0) + 1;

    // In-app real-time push via WS if author is connected
    const authorWs = state.appUsers.get(authorId);
    if (authorWs) {
      send(authorWs, { type: 'resonate_push', postId, resonateCount: newCount });
    }

    // FCM push notification (works even if app is closed)
    const tokenDoc = await admin.firestore()
      .collection('fcm_tokens').doc(authorId).get();
    if (tokenDoc.exists && tokenDoc.data().token) {
      const label = anonymous ? '有人' : '一位旅人';
      await admin.messaging().send({
        token: tokenDoc.data().token,
        notification: {
          title: '你的紋路被看見了',
          body: `${label}在城市螢幕前與你的心事產生了共鳴`
        },
        data: { postId, type: 'resonate' }
      });
    }
  } catch (e) {
    console.warn('Resonate notification failed:', e.message);
  }
}

// ─── Connection handler ───────────────────────────────────────
wss.on('connection', (ws, req) => {
  let clientRole = null;
  let clientId   = null;

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      // ── REGISTER ────────────────────────────────────────────
      case 'register': {
        clientRole = msg.role;
        clientId   = msg.screenId || msg.userId || `anon_${Date.now()}`;

        if (msg.role === 'screen') {
          state.screens.set(clientId, ws);
          ws._screenId = clientId;
          console.log(`Screen connected: ${clientId}`);

          // Send current queue snapshot so screen can pre-load
          const q = getQueue(clientId);
          const now = state.nowPlaying.get(clientId);
          send(ws, {
            type: 'screen_list',
            screens: [...state.screens.keys()].map(id => ({
              screenId: id, online: true
            }))
          });
          if (now) send(ws, { type: 'play_next', post: now, queueLength: q.length });
          else if (q.length > 0) {
            const next = q.shift();
            state.nowPlaying.set(clientId, next);
            send(ws, { type: 'play_next', post: next, queueLength: q.length });
          }

        } else if (msg.role === 'app') {
          state.appUsers.set(clientId, ws);
          ws._userId = clientId;
          console.log(`App user connected: ${clientId}`);

        } else if (msg.role === 'landing') {
          state.landing.set(clientId, ws);
          ws._sessionId = clientId;
        }
        break;
      }

      // ── PROJECT (App → Server) ───────────────────────────────
      case 'project': {
        const {
          postId, imageUrl, quote, tags, hz, style,
          duration = 30, userId, anonymous = true,
          screenId = 'global',
          color1 = '#7c3aed', color2 = '#db2777', color3 = '#0891b2',
          bgHue = '260'
        } = msg;

        if (!postId || !imageUrl) {
          send(ws, { type: 'error', message: 'postId and imageUrl required' });
          break;
        }

        const post = {
          postId, imageUrl, quote, tags, hz, style,
          color1, color2, color3, bgHue,
          duration, userId, anonymous,
          projectedAt: Date.now()
        };

        const q = getQueue(screenId);
        q.push(post);

        console.log(`Post ${postId} queued for screen ${screenId} (pos ${q.length})`);

        // If screen is idle (nothing playing), push immediately
        const screenWs = state.screens.get(screenId);
        if (screenWs && !state.nowPlaying.has(screenId)) {
          const next = q.shift();
          state.nowPlaying.set(screenId, next);
          send(screenWs, { type: 'play_next', post: next, queueLength: q.length });
        }

        // Tell the App user their queue position
        notifyQueuePosition(userId, screenId);
        break;
      }

      // ── REQUEST_NEXT (Screen → Server, after WARP) ───────────
      case 'request_next': {
        const sid = msg.screenId || ws._screenId || 'global';
        const q   = getQueue(sid);

        if (q.length === 0) {
          // Queue empty — screen goes to idle / demo mode
          state.nowPlaying.delete(sid);
          send(ws, { type: 'play_next', post: null, queueLength: 0 });
          break;
        }

        const next = q.shift();
        state.nowPlaying.set(sid, next);
        send(ws, { type: 'play_next', post: next, queueLength: q.length });

        // Update all remaining users' queue positions
        q.forEach((p, i) => {
          const userWs = state.appUsers.get(p.userId);
          if (userWs) {
            send(userWs, {
              type: 'queue_update',
              position: i + 1,
              queueLength: q.length,
              estimatedMinutes: (i + 1) * 2
            });
          }
        });
        break;
      }

      // ── EXPOSURE_TICK (Screen → Server) ─────────────────────
      case 'exposure_tick': {
        const { postId } = msg;
        if (!postId) break;
        const total = await incrementExposure(postId);

        // Notify the post author's app in real-time
        const post = state.nowPlaying.get(ws._screenId);
        if (post?.userId) {
          const authorWs = state.appUsers.get(post.userId);
          if (authorWs) send(authorWs, { type: 'exposure_ack', postId, totalExposure: total });
        }
        break;
      }

      // ── RESONATE (Landing page → Server) ────────────────────
      case 'resonate': {
        const { postId } = msg;
        if (!postId) break;
        await pushResonateNotification(postId);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (clientRole === 'screen')   state.screens.delete(clientId);
    if (clientRole === 'app')      state.appUsers.delete(clientId);
    if (clientRole === 'landing')  state.landing.delete(clientId);
    console.log(`${clientRole} ${clientId} disconnected`);
  });

  ws.on('error', (err) => console.error('WS error:', err.message));
});

// ─── Start ────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`心事紋路 WebSocket server running on ws://localhost:${PORT}`);
});

module.exports = { wss, state };
