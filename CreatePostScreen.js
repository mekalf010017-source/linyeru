/**
 * 心事紋路 · 新增作品畫面
 * 完整功能：情緒輸入 + DALL-E 3 生圖 + 發布
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Image, ActivityIndicator, Animated,
  Alert, Vibration
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';

// ─── 常數 ────────────────────────────────────────────────────
const EMOTION_TAGS_ALL = [
  '疲憊', '孤獨', '憤怒', '失落', '壓抑',
  '迷茫', '平靜', '希望', '焦慮', '委屈', '思念', '釋懷'
];

const IMAGE_STYLES = [
  { key: '深空', label: '深空', desc: '宇宙黑暗', gradient: ['#4c1d95', '#1e1035'] },
  { key: '風暴', label: '風暴', desc: '狂亂能量', gradient: ['#1e3a5f', '#0c1a2e'] },
  { key: '餘燼', label: '餘燼', desc: '熄滅之後', gradient: ['#7c2d12', '#1c0a04'] },
  { key: '迷霧', label: '迷霧', desc: '看不清楚', gradient: ['#1f2937', '#111827'] },
  { key: '暗花', label: '暗花', desc: '暗中綻放', gradient: ['#831843', '#1f0a14'] },
  { key: '虛無', label: '虛無', desc: '什麼都沒有', gradient: ['#080810', '#080810'] }
];

const PRIVACY_OPTIONS = [
  { key: 'public',    label: '公開',  color: '#9333ea' },
  { key: 'anonymous', label: '匿名',  color: '#ec4899' },
  { key: 'private',   label: '私密',  color: 'rgba(255,255,255,0.3)' }
];

// ─── Main Screen ─────────────────────────────────────────────
export default function CreatePostScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();

  // 從樹洞跳轉帶入的初始值
  const { emotionText: initText = '', emotionTags: initTags = [], intensity: initIntensity = 60 }
    = route?.params || {};

  const [text, setText] = useState(initText);
  const [selectedTags, setSelectedTags] = useState(initTags);
  const [intensity, setIntensity] = useState(initIntensity);
  const [selectedStyle, setSelectedStyle] = useState('深空');
  const [privacy, setPrivacy] = useState('public');

  const [imageUrl, setImageUrl] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);

  const debounceTimer = useRef(null);
  const imgOpacity = useRef(new Animated.Value(0)).current;

  // 自動情緒偵測（輸入停止 1.5 秒後觸發）
  useEffect(() => {
    if (text.length < 10) return;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setAutoDetecting(true);
      try {
        const result = await api.detectEmotion(text);
        if (result.tags?.length && selectedTags.length === 0) {
          setSelectedTags(result.tags);
          setIntensity(result.intensity || 60);
        }
      } catch (e) { /* silent fail */ }
      setAutoDetecting(false);
    }, 1500);
    return () => clearTimeout(debounceTimer.current);
  }, [text]);

  // 切換情緒標籤
  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : prev.length < 3 ? [...prev, tag] : prev
    );
    setImageUrl(null); // 標籤改變時清除預覽
  };

  // 生成圖片
  const generateImage = async () => {
    if (!text.trim()) {
      Alert.alert('', '請先寫下你的心事');
      return;
    }
    if (selectedTags.length === 0) {
      Alert.alert('', '請至少選一個情緒標籤');
      return;
    }

    Vibration.vibrate(15);
    setIsGenerating(true);
    setImageUrl(null);
    imgOpacity.setValue(0);

    try {
      const result = await api.generateEmotionImage(
        text, selectedTags, selectedStyle, intensity
      );
      setImageUrl(result.imageUrl);
      Animated.timing(imgOpacity, {
        toValue: 1, duration: 600, useNativeDriver: true
      }).start();
    } catch (err) {
      Alert.alert('生成失敗', err.message || '請稍後再試');
    } finally {
      setIsGenerating(false);
    }
  };

  // 發布貼文
  const handlePublish = async () => {
    if (!imageUrl) {
      Alert.alert('', '請先生成情緒影像');
      return;
    }

    setIsPublishing(true);
    try {
      // TODO: 串接 Firebase 儲存貼文
      // await db.collection('posts').add({ text, tags, style, imageUrl, privacy, ... })

      Alert.alert('顯影完成', '你的心事已化為紋路', [
        { text: '返回首頁', onPress: () => navigation.navigate('Home') }
      ]);
    } catch (err) {
      Alert.alert('發布失敗', err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  // 投放城市
  const handleProjectToCity = () => {
    if (!imageUrl) {
      Alert.alert('', '請先生成情緒影像');
      return;
    }
    navigation.navigate('CityProjection', { imageUrl, emotionTags: selectedTags });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>新增紋路</Text>
        <Text style={styles.draft}>草稿</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* 心事輸入 */}
        <Text style={styles.sectionLabel}>此刻的心事</Text>
        <View style={[styles.textInputWrap, text.length > 0 && styles.textInputWrapActive]}>
          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={t => { setText(t); setImageUrl(null); }}
            placeholder="不用說完整，說片段也可以…"
            placeholderTextColor="rgba(255,255,255,0.2)"
            multiline
            maxLength={300}
          />
          {autoDetecting && (
            <View style={styles.detectingRow}>
              <ActivityIndicator size="small" color="#9333ea" />
              <Text style={styles.detectingText}>情緒偵測中…</Text>
            </View>
          )}
        </View>

        {/* 情緒標籤 */}
        <Text style={styles.sectionLabel}>情緒標籤（最多3個）</Text>
        <View style={styles.tagsWrap}>
          {EMOTION_TAGS_ALL.map(tag => (
            <TouchableOpacity
              key={tag}
              style={[styles.tag, selectedTags.includes(tag) && styles.tagActive]}
              onPress={() => toggleTag(tag)}
            >
              <Text style={[styles.tagText, selectedTags.includes(tag) && styles.tagTextActive]}>
                # {tag}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 情緒強度 */}
        <Text style={styles.sectionLabel}>情緒強度</Text>
        <View style={styles.sliderRow}>
          <Text style={styles.sliderEndLabel}>微弱</Text>
          <Slider
            style={styles.slider}
            value={intensity}
            minimumValue={0}
            maximumValue={100}
            step={1}
            onValueChange={v => { setIntensity(v); setImageUrl(null); }}
            minimumTrackTintColor="#9333ea"
            maximumTrackTintColor="rgba(255,255,255,0.08)"
            thumbTintColor="#bf80ff"
          />
          <Text style={styles.sliderEndLabel}>強烈</Text>
          <Text style={styles.sliderValue}>{Math.round(intensity)}</Text>
        </View>

        {/* 影像風格 */}
        <Text style={styles.sectionLabel}>影像風格</Text>
        <View style={styles.styleGrid}>
          {IMAGE_STYLES.map(style => (
            <TouchableOpacity
              key={style.key}
              style={[styles.styleCard, selectedStyle === style.key && styles.styleCardActive]}
              onPress={() => { setSelectedStyle(style.key); setImageUrl(null); }}
            >
              <LinearGradient
                colors={style.gradient}
                style={styles.styleCardBg}
                start={{ x: 0.3, y: 0.2 }} end={{ x: 0.8, y: 0.9 }}
              />
              {selectedStyle === style.key && (
                <View style={styles.styleCheck}>
                  <Text style={styles.styleCheckText}>✓</Text>
                </View>
              )}
              <Text style={styles.styleLabel}>{style.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* AI 生成預覽 */}
        <Text style={styles.sectionLabel}>AI 生成預覽</Text>
        <View style={styles.previewBox}>
          {isGenerating ? (
            <View style={styles.previewLoading}>
              <ActivityIndicator size="large" color="#9333ea" />
              <Text style={styles.previewLoadingText}>情緒正在顯影中…</Text>
            </View>
          ) : imageUrl ? (
            <Animated.Image
              source={{ uri: imageUrl }}
              style={[styles.previewImage, { opacity: imgOpacity }]}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Text style={styles.previewPlaceholderText}>按下「生成紋路」後顯示</Text>
            </View>
          )}
        </View>

        <View style={styles.genBtnRow}>
          <TouchableOpacity
            style={[styles.regenBtn, isGenerating && styles.btnDisabled]}
            onPress={generateImage}
            disabled={isGenerating}
          >
            <Text style={styles.regenBtnText}>
              {imageUrl ? '↺ 重新生成' : '◎ 生成紋路'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 發布設定 */}
        <Text style={styles.sectionLabel}>發布設定</Text>
        <View style={styles.privacyRow}>
          {PRIVACY_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.privacyBtn, privacy === opt.key && {
                backgroundColor: opt.color + '33',
                borderColor: opt.color + '88'
              }]}
              onPress={() => setPrivacy(opt.key)}
            >
              <View style={[styles.privacyDot, { backgroundColor: opt.color }]} />
              <Text style={[styles.privacyLabel, privacy === opt.key && { color: opt.color }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 行動按鈕 */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.cityBtn} onPress={handleProjectToCity}>
            <Text style={styles.cityBtnText}>↗ 投放城市</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.publishBtn, isPublishing && styles.btnDisabled]}
            onPress={handlePublish}
            disabled={isPublishing}
          >
            {isPublishing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.publishBtnText}>顯影發布</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12
  },
  backBtn: { fontSize: 24, color: 'rgba(255,255,255,0.4)' },
  title: { fontSize: 15, fontWeight: '700', color: '#bf80ff', letterSpacing: 1 },
  draft: { fontSize: 12, color: 'rgba(255,255,255,0.3)' },

  scrollContent: { paddingHorizontal: 16 },

  sectionLabel: {
    fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: 2,
    textTransform: 'uppercase', marginTop: 16, marginBottom: 8
  },

  textInputWrap: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16, padding: 14, minHeight: 90
  },
  textInputWrapActive: { borderColor: 'rgba(147,51,234,0.4)', backgroundColor: 'rgba(147,51,234,0.06)' },
  textInput: { fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 22 },
  detectingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  detectingText: { fontSize: 11, color: 'rgba(147,51,234,0.6)' },

  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'
  },
  tagActive: { backgroundColor: 'rgba(147,51,234,0.25)', borderColor: 'rgba(167,139,250,0.6)' },
  tagText: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },
  tagTextActive: { color: '#d8b4fe' },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slider: { flex: 1 },
  sliderEndLabel: { fontSize: 10, color: 'rgba(255,255,255,0.25)', width: 28 },
  sliderValue: { fontSize: 12, color: '#c084fc', fontWeight: '700', width: 28, textAlign: 'right' },

  styleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  styleCard: {
    width: '30%', aspectRatio: 1.4, borderRadius: 12,
    overflow: 'hidden', borderWidth: 1.5, borderColor: 'transparent', position: 'relative'
  },
  styleCardActive: { borderColor: 'rgba(191,128,255,0.8)' },
  styleCardBg: { ...StyleSheet.absoluteFillObject },
  styleCheck: {
    position: 'absolute', top: 5, right: 5,
    width: 16, height: 16, borderRadius: 8, backgroundColor: '#bf80ff',
    alignItems: 'center', justifyContent: 'center'
  },
  styleCheckText: { fontSize: 9, color: '#fff' },
  styleLabel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', fontSize: 10,
    color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingVertical: 3
  },

  previewBox: {
    borderRadius: 16, overflow: 'hidden', height: 200,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'
  },
  previewImage: { width: '100%', height: '100%' },
  previewLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  previewLoadingText: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  previewPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewPlaceholderText: { fontSize: 12, color: 'rgba(255,255,255,0.2)' },

  genBtnRow: { marginTop: 10 },
  regenBtn: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, paddingVertical: 11, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  regenBtnText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },

  privacyRow: { flexDirection: 'row', gap: 8 },
  privacyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)'
  },
  privacyDot: { width: 7, height: 7, borderRadius: 4 },
  privacyLabel: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cityBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  cityBtnText: { fontSize: 13, color: 'rgba(255,255,255,0.45)' },
  publishBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
    backgroundColor: '#9333ea'
  },
  publishBtnText: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 1 },
  btnDisabled: { opacity: 0.5 }
});
