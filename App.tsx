import React, { useState, useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  DeviceEventEmitter,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { smsService } from './src/services/smsService';
import { db } from './src/services/db';

// Import Screens
import { HomeScreen } from './src/screens/HomeScreen';
import { AutoPayScreen } from './src/screens/AutoPayScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';

function OnboardingScreen({
  visible,
  onComplete,
}: {
  visible: boolean;
  onComplete: () => void;
}) {
  const { colors } = useTheme();
  const [deniedBefore, setDeniedBefore] = useState(false);

  useEffect(() => {
    const checkPreviousPermission = async () => {
      const hasPerm = await smsService.checkPermission();
      if (hasPerm) {
        onComplete();
      }
    };
    checkPreviousPermission();
  }, [onComplete]);

  const handleRequestPermission = async () => {
    const granted = await smsService.requestPermission();
    if (granted) {
      // Sync initial database in background
      try {
        await smsService.sync();
        DeviceEventEmitter.emit('onNewTransaction');
      } catch (err) {
        console.warn('Initial sync warning', err);
      }
      onComplete();
    } else {
      setDeniedBefore(true);
    }
  };

  const handleLater = () => {
    onComplete();
  };

  const handleOpenSettings = () => {
    smsService.openSettings();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[styles.onboardingContainer, { backgroundColor: colors.background }]}>
        <View style={styles.onboardingContent}>
          <Text style={styles.emojiLogo}>📊</Text>
          <Text style={[styles.onboardingTitle, { color: colors.text }]}>
            AutoPay Tracker
          </Text>
          <Text style={[styles.onboardingSubtitle, { color: colors.textSecondary }]}>
            We analyze only financial SMS to help you manage subscriptions and recurring payments.
          </Text>

          <View style={[styles.infoBox, { backgroundColor: colors.surfaceVariant }]}>
            <Text style={[styles.infoItem, { color: colors.text }]}>
              🔒 <Text style={{ fontWeight: 'bold' }}>100% Secure & Local</Text>
            </Text>
            <Text style={[styles.infoDetail, { color: colors.textSecondary }]}>
              All SMS analysis is done offline. Your personal chats, codes, and private details are
              ignored. No cloud uploads.
            </Text>
          </View>

          {deniedBefore ? (
            <View style={styles.deniedContainer}>
              <Text style={[styles.deniedText, { color: colors.textRed }]}>
                Permission was previously denied. Please open App Settings to grant SMS permission.
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleOpenSettings}
              >
                <Text style={styles.primaryBtnText}>Open Settings</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleRequestPermission}
            >
              <Text style={styles.primaryBtnText}>Allow Permission</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.laterBtn} onPress={handleLater}>
            <Text style={[styles.laterBtnText, { color: colors.primary }]}>Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function AppContent() {
  const { colors, isDark } = useTheme();
  const [isOnboarding, setIsOnboarding] = useState(true);
  const [activeTab, setActiveTab] = useState<'Home' | 'AutoPay' | 'Transactions' | 'Analytics' | 'Profile'>('Home');

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        const hasPerm = await smsService.checkPermission();
        if (hasPerm) {
          try {
            const res = await smsService.sync();
            if (res.processedCount > 0 || res.parsedCount > 0) {
              DeviceEventEmitter.emit('onNewTransaction');
            }
          } catch (err) {
            console.warn('Auto foreground sync failed', err);
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  // Custom Navigation Event Listener for "See All" triggers
  useEffect(() => {
    const navSub = DeviceEventEmitter.addListener('navigate', (target: string) => {
      if (
        target === 'Home' ||
        target === 'AutoPay' ||
        target === 'Transactions' ||
        target === 'Analytics' ||
        target === 'Profile'
      ) {
        setActiveTab(target);
      }
    });
    return () => {
      navSub.remove();
    };
  }, []);

  const renderScreen = () => {
    switch (activeTab) {
      case 'Home':
        return <HomeScreen />;
      case 'AutoPay':
        return <AutoPayScreen />;
      case 'Transactions':
        return <TransactionsScreen />;
      case 'Analytics':
        return <AnalyticsScreen />;
      case 'Profile':
        return <ProfileScreen />;
      default:
        return <HomeScreen />;
    }
  };

  const tabs = [
    { key: 'Home', label: 'Home', icon: '🏠' },
    { key: 'AutoPay', label: 'AutoPay', icon: '🔄' },
    { key: 'Transactions', label: 'Ledger', icon: '💳' },
    { key: 'Analytics', label: 'Analytics', icon: '📊' },
    { key: 'Profile', label: 'Profile', icon: '👤' },
  ] as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.card}
      />
      <View style={{ flex: 1 }}>
        {renderScreen()}
      </View>

      {/* Custom Bottom Navigation Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabIcon, { opacity: isActive ? 1 : 0.6 }]}>
                {tab.icon}
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? colors.primary : colors.textSecondary,
                    fontWeight: isActive ? 'bold' : 'normal',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <OnboardingScreen
        visible={isOnboarding}
        onComplete={() => setIsOnboarding(false)}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  onboardingContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 30,
  },
  onboardingContent: {
    alignItems: 'center',
  },
  emojiLogo: {
    fontSize: 72,
    marginBottom: 20,
  },
  onboardingTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  onboardingSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  infoBox: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 35,
    width: '100%',
  },
  infoItem: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  infoDetail: {
    fontSize: 12,
    lineHeight: 18,
  },
  primaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  laterBtn: {
    marginTop: 15,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  laterBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  deniedContainer: {
    width: '100%',
    alignItems: 'center',
  },
  deniedText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  tabBar: {
    flexDirection: 'row',
    height: 60,
    borderTopWidth: 1,
    elevation: 8,
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 4,
    paddingBottom: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 10,
  },
});
