/**
 * 心事紋路 · App WebSocket Service
 * 
 * 管理手機端與 WS Server 的連線：
 *   - 自動重連（指數退避）
 *   - 投放請求
 *   - 接收佇列位置更新
 *   - 接收共鳴推播
 *   - 接收曝光數更新
 */

const WS_URL = __DEV__
  ? 'ws://localhost:8080'
  : 'wss://your-production-server.com';  // 上線後替換

type MessageHandler = (msg: Record<string, unknown>) => void;

class XinshiWSService {
  private ws: WebSocket | null = null;
  private userId: string | null = null;
  private reconnectDelay = 1000;
  private maxDelay = 30000;
  private shouldReconnect = true;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private pendingMessages: string[] = [];  // buffer while disconnected

  // ── Connect ─────────────────────────────────────────────────
  connect(userId: string) {
    this.userId = userId;
    this.shouldReconnect = true;
    this._open();
  }

  private _open() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('[WS] connected');
      this.reconnectDelay = 1000;  // reset backoff

      // Register as app user
      this._send({ type: 'register', role: 'app', userId: this.userId });

      // Flush pending messages
      this.pendingMessages.forEach(m => this.ws!.send(m));
      this.pendingMessages = [];
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._dispatch(msg);
      } catch (e) {
        console.warn('[WS] parse error', e);
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] disconnected');
      if (this.shouldReconnect) this._scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('[WS] error', err);
    };
  }

  private _scheduleReconnect() {
    setTimeout(() => {
      console.log(`[WS] reconnecting in ${this.reconnectDelay}ms`);
      this._open();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
    }, this.reconnectDelay);
  }

  disconnect() {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
  }

  // ── Send helpers ─────────────────────────────────────────────
  private _send(obj: Record<string, unknown>) {
    const msg = JSON.stringify(obj);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      // Buffer until reconnected
      this.pendingMessages.push(msg);
    }
  }

  /**
   * 發起城市投放
   * @param params 從 CreatePostScreen 傳入
   */
  projectToScreen(params: {
    postId: string;
    imageUrl: string;
    quote: string;
    tags: string[];
    hz: string;
    style: string;
    color1: string;
    color2: string;
    color3: string;
    bgHue: string;
    duration: number;        // 秒，30 / 60 / 180 / 'tonight'
    screenId: string;
    anonymous: boolean;
  }) {
    this._send({
      type: 'project',
      ...params,
      userId: this.userId,
      tags: params.tags.join(' · '),
    });
  }

  // ── Event subscription ────────────────────────────────────────
  on(msgType: string, handler: MessageHandler) {
    if (!this.handlers.has(msgType)) this.handlers.set(msgType, new Set());
    this.handlers.get(msgType)!.add(handler);
    return () => this.handlers.get(msgType)?.delete(handler);  // returns unsubscribe fn
  }

  private _dispatch(msg: Record<string, unknown>) {
    const type = msg.type as string;
    this.handlers.get(type)?.forEach(h => h(msg));
    this.handlers.get('*')?.forEach(h => h(msg));  // wildcard listeners
  }
}

export default new XinshiWSService();


/**
 * ─── React hook for WS events ────────────────────────────────
 * 
 * Usage:
 *   const queueStatus = useWSMessage('queue_update');
 *   const resonateEvent = useWSMessage('resonate_push');
 */
import { useState, useEffect } from 'react';
import WSService from './wsService';

export function useWSMessage(msgType: string) {
  const [lastMsg, setLastMsg] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    const unsub = WSService.on(msgType, (msg) => setLastMsg(msg));
    return unsub;
  }, [msgType]);
  return lastMsg;
}


/**
 * ─── Example usage in CityProjectionScreen ───────────────────
 * 
 * import WSService, { useWSMessage } from '../services/wsService';
 * 
 * function CityProjectionScreen({ route }) {
 *   const { postId, imageUrl, emotionTags, style } = route.params;
 *   const [position, setPosition] = useState(null);
 *   const [exposure, setExposure] = useState(0);
 * 
 *   // Listen for queue position updates
 *   const queueMsg = useWSMessage('queue_update');
 *   useEffect(() => { if (queueMsg) setPosition(queueMsg.position); }, [queueMsg]);
 * 
 *   // Listen for exposure ticks
 *   const expMsg = useWSMessage('exposure_ack');
 *   useEffect(() => {
 *     if (expMsg?.postId === postId) setExposure(expMsg.totalExposure);
 *   }, [expMsg]);
 * 
 *   const handleLaunch = () => {
 *     WSService.projectToScreen({
 *       postId, imageUrl,
 *       quote: route.params.quote,
 *       tags: emotionTags,
 *       hz: '432',
 *       style,
 *       color1: '#7c3aed', color2: '#db2777', color3: '#0891b2',
 *       bgHue: '260',
 *       duration: 3600,   // 1 hour in seconds
 *       screenId: route.params.selectedScreenId,
 *       anonymous: route.params.privacy === 'anonymous',
 *     });
 *   };
 * 
 *   return (
 *     <View>
 *       {position && <Text>佇列第 {position} 位 · 約 {position * 2} 分鐘後上線</Text>}
 *       <Text>已被看見：{exposure} 人</Text>
 *       <Button title="啟動投放" onPress={handleLaunch} />
 *     </View>
 *   );
 * }
 */
