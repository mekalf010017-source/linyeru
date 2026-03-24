/**
 * 心事紋路 · App 入口 + 導航設定
 * 
 * 安裝依賴：
 *   npx create-expo-app xinshi --template blank
 *   npm install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/stack
 *   npx expo install react-native-screens react-native-safe-area-context
 *   npx expo install expo-linear-gradient
 *   npm install @react-native-community/slider
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import TreehollowScreen from './src/screens/TreehollowScreen';
import CreatePostScreen from './src/screens/CreatePostScreen';

// ─── Placeholder screens (待實作) ───────────────────────────
function HomeScreen({ navigation }) {
  return (
    <View style={ph.container}>
      <Text style={ph.title}>首頁 · 情緒宇宙</Text>
      <TouchableOpacity style={ph.btn} onPress={() => navigation.navigate('CreatePost')}>
        <Text style={ph.btnText}>+ 新增紋路</Text>
      </TouchableOpacity>
    </View>
  );
}

function ProfileScreen() {
  return <View style={ph.container}><Text style={ph.title}>個人頁 · 紋路合輯</Text></View>;
}

function MessagesScreen() {
  return <View style={ph.container}><Text style={ph.title}>訊息</Text></View>;
}

// ─── Custom Tab Bar ─────────────────────────────────────────
function CustomTabBar({ state, descriptors, navigation }) {
  const tabs = [
    { key: 'Home',      label: '首頁', icon: '⬡' },
    { key: 'Treehollow', label: '樹洞', icon: '◎' },
    { key: 'Create',    label: '',     icon: '+', isCenter: true },
    { key: 'Messages',  label: '訊息', icon: '⌁' },
    { key: 'Profile',   label: '我的',  icon: '◈' }
  ];

  return (
    <View style={tabStyles.bar}>
      {tabs.map((tab, i) => {
        if (tab.isCenter) {
          return (
            <TouchableOpacity
              key="center"
              style={tabStyles.centerBtn}
              onPress={() => navigation.navigate('CreatePost')}
            >
              <Text style={tabStyles.centerIcon}>+</Text>
            </TouchableOpacity>
          );
        }
        const isFocused = state.routes[state.index]?.name === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={tabStyles.item}
            onPress={() => navigation.navigate(tab.key)}
          >
            <Text style={[tabStyles.icon, isFocused && tabStyles.iconActive]}>{tab.icon}</Text>
            <Text style={[tabStyles.label, isFocused && tabStyles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Navigators ──────────────────────────────────────────────
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Treehollow" component={TreehollowScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="CreatePost"
            component={CreatePostScreen}
            options={{ presentation: 'modal' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const ph = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810', alignItems: 'center', justifyContent: 'center', gap: 20 },
  title: { fontSize: 18, color: '#bf80ff', fontWeight: '700' },
  btn: { backgroundColor: '#9333ea', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' }
});

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: 'rgba(8,8,16,0.97)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    paddingBottom: 20, paddingTop: 8, alignItems: 'center'
  },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  icon: { fontSize: 20, color: 'rgba(255,255,255,0.3)' },
  iconActive: { color: '#bf80ff' },
  label: { fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5 },
  labelActive: { color: '#bf80ff' },
  centerBtn: {
    width: 48, height: 48, borderRadius: 24, marginBottom: 8,
    backgroundColor: '#9333ea', alignItems: 'center', justifyContent: 'center'
  },
  centerIcon: { fontSize: 24, color: '#fff', lineHeight: 28 }
});
