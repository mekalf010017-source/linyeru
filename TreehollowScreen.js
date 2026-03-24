/**
 * 心事紋路 · 樹洞畫面
 * 完整功能：GPT對話 + 情緒偵測 + 模式切換
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Animated, Vibration
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';

// ─── 常數 ────────────────────────────────────────────────────
const MODES = [
  { key: 'listen',  label: '傾聽模式',  desc: '不給建議，只是陪你說完' },
  { key: 'insight', label: '洞察模式',  desc: '幫你看見情緒背後的脈絡' },
  { key: 'guide',   label: '引導模式',  desc: '提出方向，但你來決定' }
];

const EMOTION_COLORS = {
  疲憊: ['#7c3aed', '#4c1d95'],
  孤獨: ['#6d28d9', '#2e1065'],
  憤怒: ['#d97706', '#92400e'],
  失落: ['#db2777', '#831843'],
  壓抑: ['#5b21b6', '#1e1b4b'],
  迷茫: ['#0891b2', '#164e63'],
  平靜: ['#0f766e', '#134e4a'],
  希望: ['#d97706', '#7c2d12'],
  default: ['#7c3aed', '#1e1035']
};

// ─── Sub-components ──────────────────────────────────────────
function OrbAvatar({ emotion, size = 44, animated: isAnimated = false }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isAnimated) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 2000, useNativeDriver: true })
      ])
    ).start();
  }, [isAnimated]);

  const colors = EMOTION_COLORS[emotion] || EMOTION_COLORS.default;

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <LinearGradient
        colors={[colors[0], colors[1], '#080810']}
        style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}
        start={{ x: 0.3, y: 0.2 }}
        end={{ x: 0.8, y: 0.9 }}
      />
    </Animated.View>
  );
}

function ModeTab({ mode, isActive, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.modeTab, isActive && styles.modeTabActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.modeTabText, isActive && styles.modeTabTextActive]}>
        {mode.label}
      </Text>
    </TouchableOpacity>
  );
}

function MessageBubble({ message }) {
  const isAI = message.role === 'assistant';
  return (
    <View style={[styles.msgRow, isAI ? styles.msgRowLeft : styles.msgRowRight]}>
      {isAI && (
        <OrbAvatar emotion={message.emotion || '壓抑'} size={28} />
      )}
      <View style={[styles.bubble, isAI ? styles.bubbleAI : styles.bubbleUser]}>
        <Text style={[styles.bubbleText, isAI ? styles.bubbleTextAI : styles.bubbleTextUser]}>
          {message.content}
        </Text>
        <Text style={styles.bubbleTime}>{message.time}</Text>
      </View>
    </View>
  );
}

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = (dot, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: 1,   duration: 400, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true })
      ])
    ).start();
    anim(dot1, 0); anim(dot2, 200); anim(dot3, 400);
  }, []);

  return (
    <View style={[styles.msgRow, styles.msgRowLeft]}>
      <OrbAvatar emotion="壓抑" size={28} />
      <View style={[styles.bubble, styles.bubbleAI]}>
        <View style={styles.typingDots}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View key={i} style={[styles.typingDot, { opacity: dot }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

function EmotionDetectedBar({ emotion, onConvert }) {
  if (!emotion?.primary) return null;
  const colors = EMOTION_COLORS[emotion.primary] || EMOTION_COLORS.default;

  return (
    <TouchableOpacity style={styles.emotionBar} onPress={onConvert} activeOpacity={0.8}>
      <LinearGradient
        colors={[colors[0] + '33', colors[1] + '22']}
        style={styles.emotionBarInner}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      >
        <OrbAvatar emotion={emotion.primary} size={20} />
        <Text style={[styles.emotionBarText, { color: colors[0] }]}>
          偵測到：{emotion.tags?.join(' · ')}
        </Text>
        <Text style={styles.emotionBarAction}>轉為紋路 ›</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────
export default function TreehollowScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState('listen');
  const [messages, setMessages] = useState([
    {
      id: '0',
      role: 'assistant',
      content: '我在這裡。不用說完整，說片段也可以。你現在感覺到什麼？',
      time: formatTime(new Date()),
      emotion: null
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [detectedEmotion, setDetectedEmotion] = useState(null);
  const flatListRef = useRef(null);

  // 送出訊息
  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    Vibration.vibrate(10);
    setInputText('');

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      time: formatTime(new Date())
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);

    // 捲到底部
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // 轉換為 API 格式（去掉 UI 欄位）
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

      const { reply, emotion } = await api.sendTreehollowMessage(apiMessages, mode);

      const aiMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        time: formatTime(new Date()),
        emotion: emotion?.primary
      };

      setMessages(prev => [...prev, aiMsg]);
      if (emotion?.primary) setDetectedEmotion(emotion);

    } catch (err) {
      const errMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '樹洞剛剛斷線了，你說的我都記得。再說一遍也沒關係。',
        time: formatTime(new Date()),
        emotion: null
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [inputText, isLoading, messages, mode]);

  // 切換模式時重置對話
  const changeMode = (newMode) => {
    setMode(newMode);
    const modeInfo = MODES.find(m => m.key === newMode);
    const systemMsg = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `已切換為${modeInfo.label}。${modeInfo.desc}。`,
      time: formatTime(new Date()),
      emotion: null
    };
    setMessages(prev => [...prev, systemMsg]);
  };

  // 跳轉到新增作品（帶情緒資料）
  const handleConvertToImage = () => {
    if (!detectedEmotion) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    navigation.navigate('CreatePost', {
      emotionText: lastUserMsg?.content || '',
      emotionTags: detectedEmotion.tags || [],
      intensity: detectedEmotion.intensity || 60
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Orb identity */}
      <View style={styles.orbHeader}>
        <OrbAvatar emotion={detectedEmotion?.primary || '壓抑'} size={60} animated />
        <Text style={styles.orbName}>樹洞</Text>
        <Text style={styles.orbSub}>安全 · 中立 · 即時</Text>
      </View>

      {/* Mode tabs */}
      <View style={styles.modeTabs}>
        {MODES.map(m => (
          <ModeTab
            key={m.key}
            mode={m}
            isActive={mode === m.key}
            onPress={() => changeMode(m.key)}
          />
        ))}
      </View>

      {/* Chat */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.chatContent}
        ListFooterComponent={isLoading ? <TypingIndicator /> : null}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Emotion detected bar */}
      <EmotionDetectedBar emotion={detectedEmotion} onConvert={handleConvertToImage} />

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.bottom}
      >
        <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="說說你現在的心情…"
            placeholderTextColor="rgba(255,255,255,0.2)"
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || isLoading}
          >
            {isLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.sendIcon}>›</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────
function formatTime(date) {
  return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' },

  orbHeader: { alignItems: 'center', paddingVertical: 16 },
  orbName: { fontFamily: 'Syne-Bold', fontSize: 16, color: '#bf80ff', marginTop: 8, letterSpacing: 1 },
  orbSub: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2, letterSpacing: 2 },

  orb: { },

  modeTabs: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 3
  },
  modeTab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 11 },
  modeTabActive: { backgroundColor: 'rgba(147,51,234,0.35)', borderWidth: 1, borderColor: 'rgba(147,51,234,0.4)' },
  modeTabText: { fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'Syne-Regular', letterSpacing: 0.5 },
  modeTabTextActive: { color: '#d8b4fe' },

  chatContent: { paddingHorizontal: 14, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, gap: 8 },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgRowRight: { justifyContent: 'flex-end' },

  bubble: { maxWidth: '78%', borderRadius: 18, padding: 10 },
  bubbleAI: {
    backgroundColor: 'rgba(147,51,234,0.18)',
    borderWidth: 1, borderColor: 'rgba(147,51,234,0.3)',
    borderTopLeftRadius: 4
  },
  bubbleUser: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderBottomRightRadius: 4
  },
  bubbleText: { fontSize: 13, lineHeight: 20 },
  bubbleTextAI: { color: 'rgba(255,255,255,0.85)' },
  bubbleTextUser: { color: 'rgba(255,255,255,0.75)' },
  bubbleTime: { fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 4, fontFamily: 'Syne-Regular' },

  typingDots: { flexDirection: 'row', gap: 4, padding: 4 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9333ea' },

  emotionBar: { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, overflow: 'hidden' },
  emotionBarInner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: 'rgba(244,114,182,0.2)', borderRadius: 12
  },
  emotionBarText: { flex: 1, fontSize: 11, fontFamily: 'Syne-Regular', letterSpacing: 0.5 },
  emotionBarAction: { fontSize: 11, color: 'rgba(244,114,182,0.5)' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 14, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)'
  },
  input: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 13, color: 'rgba(255,255,255,0.7)',
    maxHeight: 100, minHeight: 40
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#9333ea',
    alignItems: 'center', justifyContent: 'center'
  },
  sendBtnDisabled: { backgroundColor: 'rgba(147,51,234,0.3)' },
  sendIcon: { fontSize: 20, color: '#fff', marginLeft: 2 }
});
