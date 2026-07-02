import React, { useState, useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { smsService } from './src/services/smsService';
import { db } from './src/services/db';

// Import Screens
import { HomeScreen } from './src/screens/HomeScreen';
import { AutoPayScreen } from './src/screens/AutoPayScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';

const Tab = createBottomTabNavigator();

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

function MainTabs() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => {
          let emoji = '🏠';
          if (route.name === 'AutoPay') emoji = '🔄';
          else if (route.name === 'Transactions') emoji = '💳';
          else if (route.name === 'Analytics') emoji = '📊';
          else if (route.name === 'Profile') emoji = '👤';

          return (
            <Text
              style={{
                fontSize: 20,
                opacity: focused ? 1 : 0.6,
              }}
            >
              {emoji}
            </Text>
          );
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          elevation: 8,
          shadowOpacity: 0.1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: 'bold',
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="AutoPay" component={AutoPayScreen} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { colors, isDark } = useTheme();
  const [isOnboarding, setIsOnboarding] = useState(true);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.card}
      />
      <NavigationContainer>
        <MainTabs />
      </NavigationContainer>
      <OnboardingScreen
        visible={isOnboarding}
        onComplete={() => setIsOnboarding(false)}
      />
    </View>
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
});
