# 心事紋路 APP · 開發指南

## 技術棧
- **Frontend**: React Native + Expo
- **Backend**: Node.js + Express
- **AI 對話**: OpenAI GPT-4o（樹洞）
- **AI 生圖**: OpenAI DALL-E 3（情緒影像）
- **資料庫**: Firebase Firestore
- **推播**: Firebase Cloud Messaging

---

## 快速開始

### 1. 環境變數設定

建立 `backend/.env`：
```
OPENAI_API_KEY=sk-xxxxxx
PORT=3000
```

建立 `frontend/.env`：
```
EXPO_PUBLIC_API_URL=http://localhost:3000/api
```

### 2. 啟動後端

```bash
cd backend
npm install
npm run dev
```

### 3. 啟動前端

```bash
# 安裝依賴
npx create-expo-app xinshi --template blank
cd xinshi
npm install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/stack
npx expo install react-native-screens react-native-safe-area-context expo-linear-gradient
npm install @react-native-community/slider

# 複製本專案的 src/ 和 App.js 到 expo 專案
# 啟動
npx expo start
```

---

## 核心 API 說明

### POST /api/treehollow/chat
```json
{
  "messages": [{ "role": "user", "content": "我很累" }],
  "mode": "listen"
}
```
回傳：`{ "reply": "...", "emotion": { "tags": ["疲憊"], "primary": "疲憊", "intensity": 68 } }`

### POST /api/image/generate
```json
{
  "emotionText": "我只是很累，不是不在乎",
  "emotionTags": ["疲憊", "壓抑"],
  "style": "深空",
  "intensity": 68
}
```
回傳：`{ "imageUrl": "https://...", "revisedPrompt": "..." }`

---

## 上線清單

- [ ] Firebase 初始化（替換 `admin.initializeApp()`）
- [ ] Firestore 寫入貼文邏輯（`CreatePostScreen.handlePublish`）
- [ ] Firebase Storage 儲存 DALL-E 圖片（避免 URL 過期）
- [ ] 用戶認證（Firebase Auth）
- [ ] App Store / Google Play 審核設定（隱私政策必備）
- [ ] 費用估算：GPT-4o $2.5/1M tokens；DALL-E 3 HD $0.08/張

---

## 檔案結構

```
xinshi/
├── App.js                          # 導航入口
├── src/
│   ├── screens/
│   │   ├── TreehollowScreen.js     # 樹洞聊天（完整功能）
│   │   └── CreatePostScreen.js     # 新增作品 + 生圖（完整功能）
│   └── services/
│       └── api.js                  # API 呼叫封裝
└── backend/
    ├── server.js                   # Express 後端（完整功能）
    └── package.json
```
