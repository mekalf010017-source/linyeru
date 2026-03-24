/**
 * 心事紋路 · Backend Server
 * Node.js + Express
 * 
 * Routes:
 *   POST /api/treehollow/chat   → GPT-4o 樹洞對話
 *   POST /api/image/generate    → DALL-E 3 情緒生圖
 *   POST /api/emotion/detect    → 情緒偵測
 *   GET  /api/feed              → 首頁社群貼文
 */

const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Firebase init ───────────────────────────────────────────
// admin.initializeApp({ credential: admin.credential.applicationDefault() });
// const db = admin.firestore();

// ─── 情緒系統 Prompt ─────────────────────────────────────────
const TREEHOLLOW_SYSTEM = {
  listen: `你是「樹洞」，一個溫柔、安靜、沒有評判的陪伴者。
你的角色是「傾聽者」，不給建議，不分析，不解決問題。
只是讓對方感覺被聽見、被接住。

規則：
- 回應簡短（50-80字），不長篇大論
- 用片段式提問引導，每次只問一個問題
- 絕對不說「我理解」「我明白」等套話
- 不用「你應該…」「你可以嘗試…」
- 語氣像深夜裡一個真實的朋友，不是客服或治療師
- 偶爾沉默也是陪伴，可以說「你不用解釋，繼續說就好」
- 繁體中文，語氣自然、不做作`,

  insight: `你是「樹洞」，一個有洞察力的陪伴者。
你的角色是「鏡子」，幫助對方看見情緒背後的脈絡與模式。

規則：
- 回應60-100字
- 溫和地反映你觀察到的情緒模式
- 可以說「我注意到…」「聽起來…背後好像有…」
- 不下診斷，不貼標籤
- 繁體中文，語氣溫暖而清晰`,

  guide: `你是「樹洞」，一個溫暖的引導者。
你的角色是「路燈」，不替對方走路，但可以照亮前面一步的方向。

規則：
- 回應80-120字
- 先承接情緒，再提出一個小的、可行的方向
- 說「如果你願意，也許可以…」而非「你應該…」
- 方向要具體但留有彈性
- 繁體中文，語氣溫柔有力`
};

// ─── 情緒 → DALL-E Prompt 轉換表 ────────────────────────────
const EMOTION_STYLE_MAP = {
  疲憊: 'a dimly glowing orb floating in deep cosmic space, surrounded by slow drifting silver particles, muted purple and indigo tones, exhausted energy',
  孤獨: 'a single luminous sphere in an infinite dark void, soft violet light radiating inward, distant galaxy clusters barely visible, profound solitude',
  憤怒: 'a burning orb with intense amber and crimson energy swirling violently, ember particles erupting outward, deep space background',
  失落: 'a fading pink orb slowly dissolving at its edges, rose and magenta wisps drifting away into darkness, melancholy cosmic scene',
  壓抑: 'a dense dark sphere with trapped light barely escaping from cracks, deep indigo and charcoal, compressed energy seeking release',
  迷茫: 'a translucent orb obscured by shifting silver mist, undefined edges, cool blue-grey nebula surrounding it, uncertain form',
  平靜: 'a serene teal and cyan orb floating perfectly still in deep space, soft rhythmic light pulses, peaceful cosmic stillness',
  希望: 'a warm golden orb with gentle rays of light breaking through darkness, soft dawn colors at its edges, quiet cosmic optimism'
};

const STYLE_SUFFIX = {
  深空: 'deep space background, dark cosmos, distant stars, cinematic, 8k, photorealistic',
  風暴: 'turbulent nebula, storm clouds in space, electric energy, dramatic lighting',
  餘燼: 'ember glow, dying fire aesthetic, warm dark tones, post-combustion atmosphere',
  迷霧: 'ethereal mist, soft diffused light, mysterious atmosphere, dreamlike quality',
  暗花: 'dark floral elements, bioluminescent petals, organic cosmic forms, deep bloom',
  虛無: 'minimal void, single subject, absolute darkness, isolated existence'
};

// ─── Route: 樹洞對話 ─────────────────────────────────────────
app.post('/api/treehollow/chat', async (req, res) => {
  const { messages, mode = 'listen' } = req.body;
  // messages: [{ role: 'user'|'assistant', content: string }]

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    const systemPrompt = TREEHOLLOW_SYSTEM[mode] || TREEHOLLOW_SYSTEM.listen;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 200,
      temperature: 0.85,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ]
    });

    const reply = completion.choices[0].message.content;

    // 同時做情緒偵測
    const emotionResult = await detectEmotion(messages[messages.length - 1]?.content || '');

    res.json({ reply, emotion: emotionResult });
  } catch (err) {
    console.error('Treehollow chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Route: 情緒生圖 ─────────────────────────────────────────
app.post('/api/image/generate', async (req, res) => {
  const { emotionText, emotionTags = [], style = '深空', intensity = 60 } = req.body;

  try {
    // 將情緒文字轉換為英文視覺提示詞（用 GPT）
    const promptCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 150,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: `You are a visual prompt engineer for an emotional art app.
Convert the user's emotional state into a vivid, poetic English image prompt for DALL-E 3.
Focus on: abstract light orbs, cosmic space, emotional energy, color representing emotion.
Return ONLY the prompt, no explanation. Max 100 words.`
        },
        {
          role: 'user',
          content: `Emotion text: "${emotionText}"
Emotion tags: ${emotionTags.join(', ')}
Intensity: ${intensity}/100 (higher = more intense visual)
Style: ${style}`
        }
      ]
    });

    let imagePrompt = promptCompletion.choices[0].message.content;

    // 加上風格後綴
    const styleSuffix = STYLE_SUFFIX[style] || STYLE_SUFFIX['深空'];
    imagePrompt = `${imagePrompt}. ${styleSuffix}. No text, no words, purely abstract visual art.`;

    // 呼叫 DALL-E 3
    const imageResponse = await openai.images.generate({
      model: 'dall-e-3',
      prompt: imagePrompt,
      n: 1,
      size: '1024x1024',
      quality: 'hd',
      style: 'vivid'
    });

    const imageUrl = imageResponse.data[0].url;
    const revisedPrompt = imageResponse.data[0].revised_prompt;

    res.json({
      imageUrl,
      revisedPrompt,
      originalPrompt: imagePrompt
    });
  } catch (err) {
    console.error('Image generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Route: 情緒偵測（獨立端點） ─────────────────────────────
app.post('/api/emotion/detect', async (req, res) => {
  const { text } = req.body;
  try {
    const result = await detectEmotion(text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 情緒偵測 Helper ─────────────────────────────────────────
async function detectEmotion(text) {
  if (!text || text.length < 3) return { tags: [], primary: null };

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 80,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: `分析文字的情緒，從以下選項中選1-2個最符合的：
疲憊、孤獨、憤怒、失落、壓抑、迷茫、平靜、希望、焦慮、委屈、思念、釋懷

只回傳 JSON，格式：{"tags": ["疲憊", "壓抑"], "primary": "疲憊", "intensity": 65}
intensity 是 0-100 的情緒強度。`
      },
      { role: 'user', content: text }
    ]
  });

  try {
    const raw = completion.choices[0].message.content.replace(/```json|```/g, '').trim();
    return JSON.parse(raw);
  } catch {
    return { tags: ['壓抑'], primary: '壓抑', intensity: 50 };
  }
}

// ─── Route: 首頁社群 Feed ────────────────────────────────────
app.get('/api/feed', async (req, res) => {
  // 實際串接 Firestore，此處返回示範資料
  res.json({
    posts: [
      {
        id: '1',
        userId: 'anon_1',
        displayName: '匿名朋友',
        isAnonymous: true,
        emotionText: '你說會記得我，但後來的每一個夜晚我都是一個人。',
        emotionTags: ['孤獨', '失落'],
        style: '深空',
        intensity: 78,
        imageUrl: null, // 實際會有 DALL-E 生成的圖
        resonanceCount: 61,
        frequency: '432 Hz',
        createdAt: new Date(Date.now() - 86400000 * 6).toISOString()
      },
      {
        id: '2',
        userId: 'anon_2',
        displayName: '匿名朋友',
        isAnonymous: true,
        emotionText: '有時候平靜不是放下了，是麻了。',
        emotionTags: ['虛空', '壓抑'],
        style: '迷霧',
        intensity: 45,
        imageUrl: null,
        resonanceCount: 38,
        frequency: '528 Hz',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
      }
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`心事紋路 backend running on port ${PORT}`));

module.exports = app;
