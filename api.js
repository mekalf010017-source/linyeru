/**
 * 心事紋路 · API Service
 * React Native 前端呼叫後端的封裝層
 */

const BASE_URL = __DEV__
  ? 'http://localhost:3000/api'
  : 'https://your-production-server.com/api'; // 上線後替換

class ApiService {
  async _post(path, body) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async _get(path, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = `${BASE_URL}${path}${query ? '?' + query : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ── 樹洞對話 ──────────────────────────────────────────────
  /**
   * @param {Array} messages  [{ role, content }]
   * @param {'listen'|'insight'|'guide'} mode
   * @returns {{ reply: string, emotion: object }}
   */
  sendTreehollowMessage(messages, mode = 'listen') {
    return this._post('/treehollow/chat', { messages, mode });
  }

  // ── 情緒生圖 ──────────────────────────────────────────────
  /**
   * @param {string} emotionText   使用者輸入的心事文字
   * @param {string[]} emotionTags 情緒標籤陣列
   * @param {string} style         影像風格 (深空/風暴/餘燼…)
   * @param {number} intensity     情緒強度 0-100
   * @returns {{ imageUrl: string, revisedPrompt: string }}
   */
  generateEmotionImage(emotionText, emotionTags, style, intensity) {
    return this._post('/image/generate', { emotionText, emotionTags, style, intensity });
  }

  // ── 情緒偵測 ──────────────────────────────────────────────
  /**
   * @param {string} text
   * @returns {{ tags: string[], primary: string, intensity: number }}
   */
  detectEmotion(text) {
    return this._post('/emotion/detect', { text });
  }

  // ── 社群 Feed ──────────────────────────────────────────────
  getFeed(params = {}) {
    return this._get('/feed', params);
  }
}

export default new ApiService();
