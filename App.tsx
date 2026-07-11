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
import Svg, { Path, Rect, Circle, Line, Polyline } from 'react-native-svg';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { smsService } from './src/services/smsService';
import { db } from './src/services/db';
import { updateService } from './src/services/updateService';
import { UpdateModal } from './src/components/UpdateModal';

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
    // Run update check on cold start
    updateService.checkAndUpdate(false).catch(err => {
      console.error('In-app update check failed on launch:', err);
    });

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // Run update check when app resumes (throttled internally by cache)
        updateService.checkAndUpdate(false).catch(err => {
          console.error('In-app update check failed on resume:', err);
        });

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
    const navSub = DeviceEventEmitter.addListener('navigate', (target: any) => {
      if (typeof target === 'string') {
        if (
          target === 'Home' ||
          target === 'AutoPay' ||
          target === 'Transactions' ||
          target === 'Analytics' ||
          target === 'Profile'
        ) {
          setActiveTab(target);
        }
      } else if (target && typeof target === 'object') {
        if (
          target.screen === 'Home' ||
          target.screen === 'AutoPay' ||
          target.screen === 'Transactions' ||
          target.screen === 'Analytics' ||
          target.screen === 'Profile'
        ) {
          setActiveTab(target.screen);
          if (target.category) {
            setTimeout(() => {
              DeviceEventEmitter.emit('filterCategory', target.category);
            }, 100);
          }
        }
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

  const renderTabIcon = (key: string, color: string, size = 20) => {
    switch (key) {
      case 'Home':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <Polyline points="9 22 9 12 15 12 15 22" />
          </Svg>
        );
      case 'Transactions':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
            <Line x1="2" y1="10" x2="22" y2="10" />
          </Svg>
        );
      case 'AutoPay':
        return (
          <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M17 1l4 4-4 4" />
            <Path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <Path d="M7 23l-4-4 4-4" />
            <Path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </Svg>
        );
      case 'Analytics':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Line x1="18" y1="20" x2="18" y2="10" />
            <Line x1="12" y1="20" x2="12" y2="4" />
            <Line x1="6" y1="20" x2="6" y2="14" />
          </Svg>
        );
      case 'Profile':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <Circle cx="12" cy="7" r="4" />
          </Svg>
        );
      default:
        return null;
    }
  };

  const tabs = [
    { key: 'Home', label: 'Home' },
    { key: 'Transactions', label: 'Transactions' },
    { key: 'AutoPay', label: 'AutoPay' },
    { key: 'Analytics', label: 'Analytics' },
    { key: 'Profile', label: 'Profile' },
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
        {/* Curved dome background for center floating button */}
        <View style={[styles.notchBackground, { backgroundColor: colors.card }]} />

        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;

          if (tab.key === 'AutoPay') {
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.centerTabItem}
                onPress={() => setActiveTab('AutoPay')}
                activeOpacity={0.8}
              >
                {isActive && (
                  <View style={[styles.activeOuterBorder, { borderColor: colors.primary, borderTopColor: 'transparent' }]} />
                )}
                <View style={[styles.centerButton, { backgroundColor: colors.primary }]}>
                  {renderTabIcon('AutoPay', '#FFF')}
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              {isActive && (
                <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />
              )}
              <View style={styles.tabIconContainer}>
                {renderTabIcon(tab.key, isActive ? colors.primary : colors.textSecondary)}
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? colors.primary : colors.textSecondary,
                    fontWeight: isActive ? 'bold' : 'normal',
                    marginTop: 4,
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
      <UpdateModal />
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
    height: 65,
    borderTopWidth: 1,
    elevation: 8,
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 4,
    paddingBottom: 5,
    position: 'relative',
    overflow: 'visible',
  },
  notchBackground: {
    position: 'absolute',
    top: -15,
    left: '50%',
    width: 76,
    height: 38,
    borderTopLeftRadius: 38,
    borderTopRightRadius: 38,
    marginLeft: -38,
    elevation: 0,
  },
  centerTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  centerButton: {
    position: 'absolute',
    top: -18,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2196F3',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 5,
    elevation: 6,
    zIndex: 2,
  },
  activeOuterBorder: {
    position: 'absolute',
    top: -23,
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: '100%',
  },
  tabIconContainer: {
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    width: 28,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  tabLabel: {
    fontSize: 10,
  },
});
