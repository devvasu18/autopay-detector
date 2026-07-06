import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  DeviceEventEmitter,
  Modal,
  Switch,
  AppState,
} from 'react-native';
import Svg, { Path, Rect, Circle, Line, Polyline } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { db, Transaction, AutoPay } from '../services/db';
import { smsService } from '../services/smsService';
import { MerchantLogo } from '../components/MerchantLogo';

export const HomeScreen: React.FC<{ navigation?: any }> = () => {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalIncome: 0,
    totalExpense: 0,
    netSavings: 0,
    activeAutoPays: 0,
    totalAutoPays: 0,
    largestExpense: null as Transaction | null,
    recentTransactions: [] as Transaction[],
    ottSpend: 0,
    autopaySpend: 0,
    bankSpend: 0,
    rechargeSpend: 0,
  });
  const [upcomingAutoPays, setUpcomingAutoPays] = useState<AutoPay[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [batteryOptimizationIgnored, setBatteryOptimizationIgnored] = useState<boolean>(true);
  const [deviceManufacturer, setDeviceManufacturer] = useState<string>('unknown');
  const [oemAutostartDismissed, setOemAutostartDismissed] = useState<boolean>(true);

  // Soundbox & Voice settings
  const [soundboxSettings, setSoundboxSettings] = useState({
    credit: true,
    debit: true,
    upcoming: true,
    language: 'en',
  });
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('All Time');
  const [periodModalVisible, setPeriodModalVisible] = useState(false);

  const languagesList = [
    { code: 'en', name: 'English', initial: 'E' },
    { code: 'hi', name: 'हिन्दी', initial: 'ह' },
    { code: 'bn', name: 'বাংলা', initial: 'ব' },
    { code: 'ta', name: 'தமிழ்', initial: 'த' },
    { code: 'te', name: 'తెలుగు', initial: 'తె' },
    { code: 'mr', name: 'मराठी', initial: 'म' },
    { code: 'gu', name: 'ગુજરાતી', initial: 'ગ' },
    { code: 'kn', name: 'ಕನ್ನಡ', initial: 'ಕ' },
    { code: 'ml', name: 'മലയാളം', initial: 'മ' },
    { code: 'pa', name: 'ਪੰਜਾਬੀ', initial: 'ਪ' },
  ];

  const getLanguageName = (code: string) => {
    switch (code) {
      case 'hi': return 'हिन्दी';
      case 'kn': return 'ಕನ್ನಡ';
      case 'ta': return 'தமிழ்';
      case 'te': return 'తెలుగు';
      case 'mr': return 'मराठी';
      case 'gu': return 'ગુજરાતી';
      case 'bn': return 'বাংলা';
      case 'ml': return 'മലയാളം';
      case 'pa': return 'ਪੰਜਾਬੀ';
      default: return 'English';
    }
  };

  const renderIconHelper = (iconName: string, color: string, size = 20) => {
    switch (iconName) {
      case 'card':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
            <Line x1="2" y1="10" x2="22" y2="10" />
          </Svg>
        );
      case 'sync':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.57-1.19" />
          </Svg>
        );
      case 'clock':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx="12" cy="12" r="10" />
            <Polyline points="12 6 12 12 16 14" />
          </Svg>
        );
      case 'trend':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M23 6l-9.5 9.5-5-5L1 18M23 6h-6M23 6v6" />
          </Svg>
        );
      case 'bulb':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
            <Path d="M9 18h6M10 22h4" />
          </Svg>
        );
      case 'bell':
      case 'soundbox':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </Svg>
        );
      case 'calendar':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <Line x1="16" y1="2" x2="16" y2="6" />
            <Line x1="8" y1="2" x2="8" y2="6" />
            <Line x1="3" y1="10" x2="21" y2="10" />
          </Svg>
        );
      case 'ott':
      case 'movie':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <Line x1="7" y1="2" x2="7" y2="22" />
            <Line x1="17" y1="2" x2="17" y2="22" />
            <Line x1="2" y1="12" x2="22" y2="12" />
            <Line x1="2" y1="7" x2="7" y2="7" />
            <Line x1="2" y1="17" x2="7" y2="17" />
            <Line x1="17" y1="17" x2="22" y2="17" />
            <Line x1="17" y1="7" x2="22" y2="7" />
          </Svg>
        );
      case 'bank':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2L2 7h20L12 2z" />
          </Svg>
        );
      case 'recharge':
      case 'phone':
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <Line x1="12" y1="18" x2="12" y2="18" />
          </Svg>
        );
      default:
        return null;
    }
  };

  const loadVoiceSettings = useCallback(async () => {
    try {
      const creditSetting = await db.getSetting('voice_credit', 'true');
      const debitSetting = await db.getSetting('voice_debit', 'true');
      const upcomingSetting = await db.getSetting('voice_upcoming', 'true');
      const languageSetting = await db.getSetting('voice_language', 'en');
      setSoundboxSettings({
        credit: creditSetting === 'true',
        debit: debitSetting === 'true',
        upcoming: upcomingSetting === 'true',
        language: languageSetting,
      });
    } catch (e) {
      console.warn('Failed to load voice settings', e);
    }
  }, []);

  const speakConfirmation = async (lang: string) => {
    let text = '';
    switch (lang) {
      case 'hi': text = 'आवाज़ हिंदी में सेट की गई है'; break;
      case 'kn': text = 'ಧ್ವನಿಯನ್ನು ಕನ್ನಡಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ'; break;
      case 'ta': text = 'குರல் தமிழில் அமைக்கப்பட்டுள்ளது'; break;
      case 'te': text = 'వాయిస్ తెలుగులో సెట్ చేయబడింది'; break;
      case 'mr': text = 'आवाज मराठीमध्ये सेट केला आहे'; break;
      case 'gu': text = 'અવાજ ગુજરાતીમાં સેટ થયો છે'; break;
      case 'bn': text = 'ভয়েস বাংলায় সেট করা হয়েছে'; break;
      case 'ml': text = 'ശബ്ദം മലയാളത്തിലേക്ക് സജ്ജമാക്കി'; break;
      case 'pa': text = 'ਆਵਾਜ਼ ਪੰਜਾਬੀ ਵਿੱਚ ਸੈੱਟ ਕੀਤੀ ਗਈ ਹੈ'; break;
      default: text = 'Voice set to English'; break;
    }
    try {
      const { NativeModules } = require('react-native');
      if (NativeModules.FinanceCoreModule && NativeModules.FinanceCoreModule.speak) {
        await NativeModules.FinanceCoreModule.speak(text, lang);
      }
    } catch (e) {
      console.warn('TTS speak confirmation failed', e);
    }
  };

  const handleToggleVoice = async (key: 'credit' | 'debit' | 'upcoming', currentVal: boolean) => {
    const newVal = !currentVal;
    const keyStr = `voice_${key}`;
    await db.setSetting(keyStr, newVal ? 'true' : 'false');
    setSoundboxSettings((prev) => ({ ...prev, [key]: newVal }));

    // Play audio confirmation
    const lang = soundboxSettings.language;
    let text = '';
    if (lang === 'en') {
      text = `${key.charAt(0).toUpperCase() + key.slice(1)} announcements turned ${newVal ? 'on' : 'off'}`;
    } else if (lang === 'hi') {
      text = `${key === 'credit' ? 'प्राप्ति' : key === 'debit' ? 'भुगतान' : 'आगामी'} सूचनाएं ${newVal ? 'चालू' : 'बंद'} कर दी गई हैं`;
    } else {
      text = `${key} alerts ${newVal ? 'on' : 'off'}`;
    }
    try {
      const { NativeModules } = require('react-native');
      if (NativeModules.FinanceCoreModule && NativeModules.FinanceCoreModule.speak) {
        await NativeModules.FinanceCoreModule.speak(text, lang);
      }
    } catch (e) { }
  };

  const handleSelectLanguage = async (langCode: string) => {
    await db.setSetting('voice_language', langCode);
    setSoundboxSettings((prev) => ({ ...prev, language: langCode }));
    setLangModalVisible(false);
    setTimeout(() => {
      speakConfirmation(langCode);
    }, 300);
  };



  const getStartDateForPeriod = useCallback((period: string): number | undefined => {
    const now = new Date();
    switch (period) {
      case 'Last 30 Days':
        return Date.now() - 30 * 24 * 60 * 60 * 1000;
      case 'This Month':
        return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      case 'Last Month':
        return new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      case 'This Year':
        return new Date(now.getFullYear(), 0, 1).getTime();
      case 'All Time':
      default:
        return undefined;
    }
  }, []);

  const fetchStats = useCallback(async (period: string = 'All Time') => {
    try {
      const startTs = getStartDateForPeriod(period);
      const dbStats = await db.getStats(startTs);
      setStats(dbStats);

      const autopays = await db.getAutoPays();
      const active = autopays.filter((ap) => ap.status === 'Active');
      setUpcomingAutoPays(active.slice(0, 3));
    } catch (err) {
      console.warn('Failed to load database stats', err);
    }
  }, [getStartDateForPeriod]);

  const checkPermissionState = useCallback(async () => {
    const isGranted = await smsService.checkPermission();
    setHasPermission(isGranted);
  }, []);

  const checkBatteryStatus = useCallback(async () => {
    const ignored = await smsService.isBatteryOptimizationIgnored();
    setBatteryOptimizationIgnored(ignored);

    const dismissed = await db.getSetting('oem_autostart_dismissed', 'false');
    setOemAutostartDismissed(dismissed === 'true');

    if (Platform.OS === 'android') {
      const manufacturer = await smsService.getDeviceManufacturer();
      setDeviceManufacturer(manufacturer);
    }
  }, []);

  const initData = useCallback(async () => {
    setLoading(true);
    await checkPermissionState();
    await checkBatteryStatus();
    await fetchStats(selectedPeriod);
    await loadVoiceSettings();
    setLoading(false);
  }, [checkPermissionState, checkBatteryStatus, fetchStats, loadVoiceSettings, selectedPeriod]);

  useEffect(() => {
    initData();
  }, []);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('onNewTransaction', (eventData?: any) => {
      fetchStats(selectedPeriod);
    });

    return () => {
      subscription.remove();
    };
  }, [fetchStats, selectedPeriod]);

  useEffect(() => {
    fetchStats(selectedPeriod);
  }, [selectedPeriod, fetchStats]);

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkPermissionState();
        checkBatteryStatus();
      }
    });
    return () => {
      appStateSub.remove();
    };
  }, [checkPermissionState, checkBatteryStatus]);

  const onRefresh = async () => {
    setRefreshing(true);
    await checkPermissionState();
    await checkBatteryStatus();
    await fetchStats(selectedPeriod);
    await loadVoiceSettings();
    setRefreshing(false);
  };

  const handleSync = async () => {
    const isGranted = await smsService.checkPermission();
    if (!isGranted) {
      const requested = await smsService.requestPermission();
      if (!requested) {
        setHasPermission(false);
        Alert.alert(
          'Permission Required',
          'We need SMS reading permission to extract transaction receipts. Please enable it in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => smsService.openSettings() },
          ]
        );
        return;
      }
    }

    setHasPermission(true);
    setLoading(true);
    try {
      const syncResult = await smsService.sync();
      DeviceEventEmitter.emit('onNewTransaction');
      Alert.alert(
        'Sync Complete',
        `Successfully scanned ${syncResult.processedCount} messages and processed ${syncResult.parsedCount} financial transactions.`
      );
    } catch (err: any) {
      Alert.alert('Sync Failed', err.message || 'An error occurred during synchronization.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return `₹${value.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    })}`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const getInsights = () => {
    const list = [];
    if (stats.totalExpense > 0) {
      list.push({
        id: 'spend_insight',
        icon: 'card',
        text: `You spent ${formatCurrency(stats.totalExpense)} this month.`,
        detail: stats.netSavings < 0 ? 'Your spending exceeds credit this month.' : 'Savings rate is looking healthy!',
      });
    }
    if (stats.activeAutoPays > 0) {
      list.push({
        id: 'subs_insight',
        icon: 'sync',
        text: `${stats.activeAutoPays} active autopay mandates detected.`,
        detail: 'Click AutoPay tab below to view app redirection portals.',
      });
    }

    // Check next upcoming payment within next 7 days
    const upcoming = upcomingAutoPays[0];
    if (upcoming) {
      list.push({
        id: 'upcoming_insight',
        icon: 'clock',
        text: `Your ${upcoming.merchant} payment of ${formatCurrency(upcoming.amount)} renews soon.`,
        detail: `Next debit expected on ${formatDate(upcoming.next_expected_payment)}.`,
      });
    }

    if (stats.largestExpense) {
      list.push({
        id: 'large_expense',
        icon: 'trend',
        text: `Largest expense was ${formatCurrency(stats.largestExpense.amount)} at ${stats.largestExpense.merchant}.`,
        detail: `Occurred on ${formatDate(stats.largestExpense.date)}.`,
      });
    }

    if (list.length === 0) {
      list.push({
        id: 'no_data',
        icon: 'bulb',
        text: 'No insights available yet.',
        detail: 'Trigger SMS Sync or go to Settings to seed sample data.',
      });
    }

    return list;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>


      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Soundbox Alert Card */}
        <TouchableOpacity
          style={[styles.soundboxCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setVoiceModalVisible(true)}
        >
          <View style={styles.soundboxHeaderRow}>
            <View style={styles.soundboxIconWrapper}>
              {renderIconHelper('bell', colors.primary)}
            </View>
            <View style={styles.soundboxInfo}>
              <Text style={[styles.soundboxTitle, { color: colors.text }]}>Soundbox Alert</Text>
              <Text style={[styles.soundboxSubtitle, { color: colors.textSecondary }]}>
                View announcements for transactions
              </Text>
            </View>
            <Text style={[styles.soundboxChevron, { color: colors.textSecondary }]}>›</Text>
          </View>
          <View style={styles.soundboxPillsRow}>
            <TouchableOpacity
              style={[
                styles.soundboxPill,
                soundboxSettings.credit
                  ? { backgroundColor: colors.primaryContainer, borderColor: colors.primary }
                  : { backgroundColor: colors.surface, borderColor: colors.border }
              ]}
              onPress={() => handleToggleVoice('credit', soundboxSettings.credit)}
            >
              <Text
                style={[
                  styles.soundboxPillText,
                  { color: soundboxSettings.credit ? colors.primary : colors.textSecondary }
                ]}
              >
                Credit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.soundboxPill,
                soundboxSettings.debit
                  ? { backgroundColor: colors.primaryContainer, borderColor: colors.primary }
                  : { backgroundColor: colors.surface, borderColor: colors.border }
              ]}
              onPress={() => handleToggleVoice('debit', soundboxSettings.debit)}
            >
              <Text
                style={[
                  styles.soundboxPillText,
                  { color: soundboxSettings.debit ? colors.primary : colors.textSecondary }
                ]}
              >
                Debit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.soundboxPill,
                soundboxSettings.upcoming
                  ? { backgroundColor: colors.primaryContainer, borderColor: colors.primary }
                  : { backgroundColor: colors.surface, borderColor: colors.border }
              ]}
              onPress={() => handleToggleVoice('upcoming', soundboxSettings.upcoming)}
            >
              <Text
                style={[
                  styles.soundboxPillText,
                  { color: soundboxSettings.upcoming ? colors.primary : colors.textSecondary }
                ]}
              >
                Upcoming
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* Permission Banner */}
        {hasPermission === false && (
          <View style={[styles.permissionBanner, { backgroundColor: colors.error + '15', borderColor: colors.error }]}>
            <Text style={[styles.permissionTitle, { color: colors.textRed }]}>
              SMS Permission Needed
            </Text>
            <Text style={[styles.permissionText, { color: colors.textSecondary }]}>
              Allow SMS permissions to automatically read and categorize subscription bills.
            </Text>
            <TouchableOpacity
              style={[styles.permissionActionBtn, { backgroundColor: colors.error }]}
              onPress={handleSync}
            >
              <Text style={styles.permissionActionBtnText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Battery Optimization Permission Banner */}
        {hasPermission === true && !batteryOptimizationIgnored && (
          <View style={[
            styles.permissionBanner, 
            { 
              backgroundColor: colors.isDark ? '#3A2E1F' : '#FFFBEB', 
              borderColor: colors.isDark ? '#F59E0B' : '#D97706', 
              borderWidth: 1,
              marginTop: 10,
            }
          ]}>
            <Text style={[styles.permissionTitle, { color: colors.isDark ? '#FBBF24' : '#B45309' }]}>
              ⚠️ Background Alerts Restricted
            </Text>
            <Text style={[styles.permissionText, { color: colors.isDark ? '#FDE68A' : '#78350F', marginTop: 4 }]}>
              Allow the app to always run in the background. Otherwise, Android may block voice announcements when the app is closed.
            </Text>
            <TouchableOpacity
              style={[styles.permissionActionBtn, { backgroundColor: colors.isDark ? '#D97706' : '#B45309', marginTop: 10 }]}
              onPress={async () => {
                const success = await smsService.requestIgnoreBatteryOptimizations();
                if (success) {
                  setTimeout(checkBatteryStatus, 1000);
                }
              }}
            >
              <Text style={styles.permissionActionBtnText}>Enable Always Run</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* OEM Autostart / Background Protection Warning Banner */}
        {hasPermission === true && 
         ['xiaomi', 'redmi', 'poco', 'oppo', 'realme', 'vivo', 'iqoo', 'huawei', 'honor'].includes(deviceManufacturer.toLowerCase()) && 
         !oemAutostartDismissed && (
          <View style={[
            styles.permissionBanner, 
            { 
              backgroundColor: colors.isDark ? '#3A2E1F' : '#FFFBEB', 
              borderColor: colors.isDark ? '#F59E0B' : '#D97706', 
              borderWidth: 1,
              marginTop: 10,
            }
          ]}>
            <Text style={[styles.permissionTitle, { color: colors.isDark ? '#FBBF24' : '#B45309' }]}>
              ⚠️ Auto-start Permission Required
            </Text>
            <Text style={[styles.permissionText, { color: colors.isDark ? '#FDE68A' : '#78350F', marginTop: 4 }]}>
              {(() => {
                const oem = deviceManufacturer.toLowerCase();
                if (oem.includes('xiaomi') || oem.includes('redmi') || oem.includes('poco')) {
                  return 'For Xiaomi/Redmi/Poco, you must enable "Autostart" and set Battery Saver to "No Restrictions" so voice notifications can play when the app is closed.';
                }
                if (oem.includes('oppo') || oem.includes('realme')) {
                  return 'For Oppo/Realme, you must enable "Startup Manager" / "Auto-startup" and allow background activity so voice notifications play when closed.';
                }
                if (oem.includes('vivo') || oem.includes('iqoo')) {
                  return 'For Vivo/iQOO, you must enable "Auto-start" and select "High Background Power Consumption" for the app to speak alerts in the background.';
                }
                if (oem.includes('huawei') || oem.includes('honor')) {
                  return 'For Huawei/Honor, set App Launch to "Manage manually" and enable all background and auto-launch permissions.';
                }
                return `For your ${deviceManufacturer} device, please check that the app is allowed to auto-start and run in the background.`;
              })()}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.permissionActionBtn, { backgroundColor: colors.isDark ? '#D97706' : '#B45309', marginRight: 12 }]}
                onPress={async () => {
                  await smsService.openAutostartSettings();
                }}
              >
                <Text style={styles.permissionActionBtnText}>Configure Auto-start</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                onPress={async () => {
                  await db.setSetting('oem_autostart_dismissed', 'true');
                  setOemAutostartDismissed(true);
                }}
              >
                <Text style={{ color: colors.isDark ? '#FDE68A' : '#78350F', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' }}>
                  Dismiss
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Total Spend & Date Range Card */}
        <View style={[styles.horizontalStatsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View>
            <Text style={[styles.horizontalCardLabel, { color: colors.textSecondary }]}>
              Total Payments
            </Text>
            <Text style={[styles.horizontalCardValue, { color: colors.text }]}>
              {formatCurrency(stats.totalExpense)}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.dateRangeSelector, { backgroundColor: colors.isDark ? '#3A3A3C' : '#E5E5EA', borderColor: colors.border }]}
            onPress={() => setPeriodModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {renderIconHelper('calendar', colors.text, 14)}
              <Text style={[styles.dateRangeText, { color: colors.text, marginLeft: 6 }]}>
                {selectedPeriod} ▾
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Date Period Selector Modal */}
        <Modal
          visible={periodModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setPeriodModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setPeriodModalVisible(false)}
          >
            <View style={[styles.periodModalContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.periodModalTitle, { color: colors.text }]}>Select Period</Text>
              <View style={styles.periodList}>
                {['All Time', 'Last 30 Days', 'This Month', 'Last Month', 'This Year'].map((period) => {
                  const isSelected = selectedPeriod === period;
                  return (
                    <TouchableOpacity
                      key={period}
                      style={[
                        styles.periodItem,
                        isSelected && { backgroundColor: colors.isDark ? '#2c2c2e' : '#e5f6ff' }
                      ]}
                      onPress={() => {
                        setSelectedPeriod(period);
                        setPeriodModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.periodItemText,
                          { color: isSelected ? colors.primary : colors.text },
                          isSelected && { fontWeight: 'bold' }
                        ]}
                      >
                        {period}
                      </Text>
                      {isSelected && (
                        <Text style={[styles.periodCheckmark, { color: colors.primary }]}>✓</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Dashboard Core Stats Cards - 4 Modern Grid Cards */}
        <View style={styles.gridContainer}>
          <View style={styles.gridRow}>
            {/* OTT Card */}
            <TouchableOpacity 
              style={[
                styles.gridCard,
                {
                  backgroundColor: colors.isDark ? '#2D1F3F' : '#F5E6FF',
                  borderColor: colors.isDark ? '#5C387F' : '#E8C5FF',
                  shadowColor: colors.isDark ? '#5C387F' : '#8A2BE2',
                }
              ]}
              onPress={() => DeviceEventEmitter.emit('navigate', { screen: 'Transactions', category: 'OTT' })}
            >
              <View style={styles.cardIconHeader}>
                {renderIconHelper('ott', colors.isDark ? '#D8B4FE' : '#6B21A8')}
                <Text style={[styles.cardTitleText, { color: colors.isDark ? '#D8B4FE' : '#6B21A8', marginLeft: 8 }]}>OTT</Text>
              </View>
              <Text style={[styles.cardValueText, { color: colors.isDark ? '#F3E8FF' : '#4C1D95' }]}>
                {formatCurrency(stats.ottSpend)}
              </Text>
              <Text style={[styles.cardSubtitleText, { color: colors.isDark ? '#C084FC' : '#701A75' }]}>
                Entertainment streaming
              </Text>
            </TouchableOpacity>

            {/* Autopay Card */}
            <TouchableOpacity 
              style={[
                styles.gridCard,
                {
                  backgroundColor: colors.isDark ? '#1C322E' : '#E6FFFA',
                  borderColor: colors.isDark ? '#2C5E54' : '#B2F5EA',
                  shadowColor: colors.isDark ? '#2C5E54' : '#319795',
                }
              ]}
              onPress={() => DeviceEventEmitter.emit('navigate', 'AutoPay')}
            >
              <View style={styles.cardIconHeader}>
                {renderIconHelper('sync', colors.isDark ? '#81E6D9' : '#007769')}
                <Text style={[styles.cardTitleText, { color: colors.isDark ? '#81E6D9' : '#007769', marginLeft: 8 }]}>Autopay</Text>
              </View>
              <Text style={[styles.cardValueText, { color: colors.isDark ? '#E6FFFA' : '#004D40' }]}>
                {formatCurrency(stats.autopaySpend)}
              </Text>
              <Text style={[styles.cardSubtitleText, { color: colors.isDark ? '#4FD1C5' : '#006D5B' }]}>
                Scheduled debits
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.gridRow}>
            {/* Bank Card */}
            <View style={[
              styles.gridCard,
              {
                backgroundColor: colors.isDark ? '#1B2A4A' : '#EBF8FF',
                borderColor: colors.isDark ? '#2B4A7F' : '#BEE3F8',
                shadowColor: colors.isDark ? '#2B4A7F' : '#3182CE',
              }
            ]}>
              <View style={styles.cardIconHeader}>
                {renderIconHelper('bank', colors.isDark ? '#90CDF4' : '#1A365D')}
                <Text style={[styles.cardTitleText, { color: colors.isDark ? '#90CDF4' : '#1A365D', marginLeft: 8 }]}>Bank</Text>
              </View>
              <Text style={[styles.cardValueText, { color: colors.isDark ? '#EBF8FF' : '#0B3C5D' }]}>
                {formatCurrency(stats.bankSpend)}
              </Text>
              <Text style={[styles.cardSubtitleText, { color: colors.isDark ? '#63B3ED' : '#2A4365' }]}>
                Transfers & EMIs
              </Text>
            </View>

            {/* Recharge Card */}
            <TouchableOpacity 
              style={[
                styles.gridCard,
                {
                  backgroundColor: colors.isDark ? '#3D281F' : '#FFF5F5',
                  borderColor: colors.isDark ? '#6B4A3A' : '#FED7D7',
                  shadowColor: colors.isDark ? '#6B4A3A' : '#E53E3E',
                }
              ]}
              onPress={() => DeviceEventEmitter.emit('navigate', { screen: 'Transactions', category: 'Recharge' })}
            >
              <View style={styles.cardIconHeader}>
                {renderIconHelper('recharge', colors.isDark ? '#FEB2B2' : '#9B2C2C')}
                <Text style={[styles.cardTitleText, { color: colors.isDark ? '#FEB2B2' : '#9B2C2C', marginLeft: 8 }]}>Recharge</Text>
              </View>
              <Text style={[styles.cardValueText, { color: colors.isDark ? '#FFF5F5' : '#7B1515' }]}>
                {formatCurrency(stats.rechargeSpend)}
              </Text>
              <Text style={[styles.cardSubtitleText, { color: colors.isDark ? '#FC8181' : '#9B2C2C' }]}>
                Mobile & utility
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Upcoming AutoPays Section */}
        {upcomingAutoPays.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming AutoPays</Text>
              <TouchableOpacity onPress={() => DeviceEventEmitter.emit('navigate', 'AutoPay')}>
                <Text style={[styles.sectionLink, { color: colors.primary }]}>See All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
              {upcomingAutoPays.map((ap) => (
                <View key={ap.id} style={[styles.autoPayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.autoPayRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MerchantLogo name={ap.merchant} size={24} />
                      <Text style={[styles.autoPayMerchant, { color: colors.text, marginLeft: 8 }]}>{ap.merchant}</Text>
                    </View>
                  </View>
                  <Text style={[styles.autoPayAmount, { color: colors.text }]}>{formatCurrency(ap.amount)}</Text>
                  <Text style={[styles.autoPayDate, { color: colors.textSecondary }]}>
                    Due: {formatDate(ap.next_expected_payment)} ({ap.frequency})
                  </Text>
                  <Text style={[styles.autoPayBank, { color: colors.textSecondary }]}>
                    {ap.bank} • {ap.upi_id || 'Standing Instruction'}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Recent Transactions Section */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}> All Recent Transactions</Text>
            <TouchableOpacity onPress={() => DeviceEventEmitter.emit('navigate', 'Transactions')}>
              <Text style={[styles.sectionLink, { color: colors.primary }]}>See All</Text>
            </TouchableOpacity>
          </View>

          {stats.recentTransactions.length === 0 ? (
            <View style={[styles.emptyContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No transactions indexed yet. Sync your SMS to begin.
              </Text>
            </View>
          ) : (
            stats.recentTransactions.map((tx) => (
              <View key={tx.id} style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.txIconContainer}>
                  <MerchantLogo name={tx.merchant} size={40} />
                </View>
                <View style={styles.txDetails}>
                  <Text style={[styles.txMerchant, { color: colors.text }]} numberOfLines={1}>
                    {tx.merchant}
                  </Text>
                  <Text style={[styles.txSubText, { color: colors.textSecondary }]}>
                    {formatDate(tx.date)} • {tx.bank}
                  </Text>
                </View>
                <View style={styles.txAmountContainer}>
                  <Text
                    style={[
                      styles.txAmount,
                      { color: tx.type === 'CREDIT' ? colors.textGreen : colors.text },
                    ]}
                  >
                    {tx.type === 'CREDIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </Text>
                  <Text style={[styles.txCategory, { color: colors.textSecondary }]}>
                    {tx.category}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Quick Insights Section */}
        <View style={[styles.sectionContainer, { marginBottom: 30 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Quick Insights</Text>
          {getInsights().map((insight) => (
            <View key={insight.id} style={[styles.insightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.insightIconContainer}>
                {renderIconHelper(insight.icon, colors.primary)}
              </View>
              <View style={styles.insightContent}>
                <Text style={[styles.insightText, { color: colors.text }]}>{insight.text}</Text>
                <Text style={[styles.insightDetail, { color: colors.textSecondary }]}>{insight.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Voice Settings Bottom Sheet Modal */}
      <Modal
        visible={voiceModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setVoiceModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setVoiceModalVisible(false)}
        >
          <TouchableOpacity
            style={[styles.bottomSheetContainer, { backgroundColor: colors.card }]}
            activeOpacity={1}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Voice settings</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
                Configure voice announcements for different transaction types
              </Text>
            </View>

            <View style={styles.sheetContent}>
              <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>Credit Transactions</Text>
                  <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>
                    Announce when money is received
                  </Text>
                </View>
                <Switch
                  value={soundboxSettings.credit}
                  onValueChange={() => handleToggleVoice('credit', soundboxSettings.credit)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={soundboxSettings.credit ? '#FFF' : '#FFF'}
                />
              </View>

              <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>Debit Transactions</Text>
                  <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>
                    Announce when money is sent
                  </Text>
                </View>
                <Switch
                  value={soundboxSettings.debit}
                  onValueChange={() => handleToggleVoice('debit', soundboxSettings.debit)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={soundboxSettings.debit ? '#FFF' : '#FFF'}
                />
              </View>

              <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>Upcoming Payments</Text>
                  <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>
                    Announce payment reminders
                  </Text>
                </View>
                <Switch
                  value={soundboxSettings.upcoming}
                  onValueChange={() => handleToggleVoice('upcoming', soundboxSettings.upcoming)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={soundboxSettings.upcoming ? '#FFF' : '#FFF'}
                />
              </View>

              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => {
                  setVoiceModalVisible(false);
                  setTimeout(() => setLangModalVisible(true), 300);
                }}
              >
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>Language</Text>
                  <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>
                    Select language
                  </Text>
                </View>
                <View style={styles.langSelectorValue}>
                  <Text style={[styles.langSelectorText, { color: colors.primary }]}>
                    {getLanguageName(soundboxSettings.language)}
                  </Text>
                  <Text style={[styles.langSelectorArrow, { color: colors.primary }]}> ›</Text>
                </View>
              </TouchableOpacity>

              {!batteryOptimizationIgnored && (
                <TouchableOpacity
                  style={[
                    styles.settingRow, 
                    { 
                      borderTopWidth: 1, 
                      borderTopColor: colors.border, 
                      marginTop: 10, 
                      paddingTop: 15,
                      backgroundColor: colors.isDark ? 'rgba(217, 119, 6, 0.1)' : 'rgba(217, 119, 6, 0.05)' 
                    }
                  ]}
                  onPress={async () => {
                    const success = await smsService.requestIgnoreBatteryOptimizations();
                    if (success) {
                      setTimeout(checkBatteryStatus, 1000);
                    }
                  }}
                >
                  <View style={styles.settingInfo}>
                    <Text style={[styles.settingTitle, { color: colors.isDark ? '#FBBF24' : '#B45309' }]}>⚠️ Background Execution</Text>
                    <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>
                      Exempt from battery optimization for background voice alerts
                    </Text>
                  </View>
                  <View style={styles.langSelectorValue}>
                    <Text style={[styles.langSelectorText, { color: colors.isDark ? '#F59E0B' : '#D97706', fontWeight: 'bold' }]}>
                      Fix Now
                    </Text>
                    <Text style={[styles.langSelectorArrow, { color: colors.isDark ? '#F59E0B' : '#D97706' }]}> ›</Text>
                  </View>
                </TouchableOpacity>
              )}

              {['xiaomi', 'redmi', 'poco', 'oppo', 'realme', 'vivo', 'iqoo', 'huawei', 'honor'].includes(deviceManufacturer.toLowerCase()) && (
                <TouchableOpacity 
                  style={[
                    styles.settingRow, 
                    { 
                      borderTopWidth: 1, 
                      borderTopColor: colors.border, 
                      marginTop: 10, 
                      paddingTop: 15,
                      backgroundColor: colors.isDark ? 'rgba(217, 119, 6, 0.1)' : 'rgba(217, 119, 6, 0.05)' 
                    }
                  ]}
                  onPress={async () => {
                    await smsService.openAutostartSettings();
                  }}
                >
                  <View style={styles.settingInfo}>
                    <Text style={[styles.settingTitle, { color: colors.isDark ? '#FBBF24' : '#B45309' }]}>⚠️ Auto-start Permission</Text>
                    <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>
                      Configure auto-start settings for {deviceManufacturer} to allow background alerts
                    </Text>
                  </View>
                  <View style={styles.langSelectorValue}>
                    <Text style={[styles.langSelectorText, { color: colors.isDark ? '#F59E0B' : '#D97706', fontWeight: 'bold' }]}>
                      Configure
                    </Text>
                    <Text style={[styles.langSelectorArrow, { color: colors.isDark ? '#F59E0B' : '#D97706' }]}> ›</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.closeSheetBtn, { backgroundColor: colors.primary }]}
              onPress={() => setVoiceModalVisible(false)}
            >
              <Text style={styles.closeSheetBtnText}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Select Language Bottom Sheet Modal */}
      <Modal
        visible={langModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setLangModalVisible(false)}
        >
          <TouchableOpacity
            style={[styles.bottomSheetContainer, { backgroundColor: colors.card }]}
            activeOpacity={1}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Select Language</Text>
            </View>

            <View style={styles.langGrid}>
              {languagesList.map((lang) => {
                const isSelected = soundboxSettings.language === lang.code;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.langCard,
                      isSelected && { borderColor: colors.primary, backgroundColor: colors.primaryContainer + '20' }
                    ]}
                    onPress={() => handleSelectLanguage(lang.code)}
                  >
                    <View
                      style={[
                        styles.langInitialBadge,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.surfaceVariant,
                        }
                      ]}
                    >
                      <Text style={[styles.langInitialText, { color: isSelected ? '#FFF' : colors.text }]}>
                        {lang.initial}
                      </Text>
                    </View>
                    <Text style={[styles.langNameText, { color: colors.text }, isSelected && { fontWeight: 'bold' }]}>
                      {lang.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.closeSheetBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                setLangModalVisible(false);
                setTimeout(() => setVoiceModalVisible(true), 300);
              }}
            >
              <Text style={styles.closeSheetBtnText}>Back</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  syncButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  permissionBanner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  permissionText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  permissionActionBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  permissionActionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  gridContainer: {
    marginBottom: 24,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginHorizontal: -6,
  },
  gridCard: {
    flex: 1,
    marginHorizontal: 6,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  cardIconHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIconEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  cardTitleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardValueText: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardSubtitleText: {
    fontSize: 11,
    fontWeight: '500',
  },
  sectionContainer: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  horizontalScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  autoPayCard: {
    width: 250,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginRight: 16,
  },
  autoPayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autoPayMerchant: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  autoPayAmount: {
    fontSize: 22,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  autoPayDate: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  autoPayBank: {
    fontSize: 11,
  },
  insightCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    alignItems: 'center',
  },
  insightIconContainer: {
    marginRight: 16,
  },
  insightContent: {
    flex: 1,
  },
  insightText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  insightDetail: {
    fontSize: 12,
    marginTop: 2,
  },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  txIconContainer: {
    marginRight: 16,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txDetails: {
    flex: 1,
  },
  txMerchant: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  txSubText: {
    fontSize: 12,
    marginTop: 2,
  },
  txAmountContainer: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  txCategory: {
    fontSize: 11,
    marginTop: 2,
  },
  emptyContainer: {
    padding: 24,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  soundboxCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  soundboxHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  soundboxIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(103, 80, 164, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  soundboxIcon: {
    fontSize: 22,
  },
  soundboxInfo: {
    flex: 1,
  },
  soundboxTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  soundboxSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  soundboxChevron: {
    fontSize: 24,
    fontWeight: '300',
    paddingLeft: 8,
  },
  soundboxPillsRow: {
    flexDirection: 'row',
  },
  soundboxPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  soundboxPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 32,
  },
  sheetHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 2,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  sheetSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  sheetContent: {
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  settingInfo: {
    flex: 1,
    paddingRight: 8,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  settingSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  langSelectorValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  langSelectorText: {
    fontSize: 14,
    fontWeight: '600',
  },
  langSelectorArrow: {
    fontSize: 18,
  },
  closeSheetBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  closeSheetBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginHorizontal: -4,
  },
  langCard: {
    width: '30%',
    marginHorizontal: '1.5%',
    marginBottom: 16,
    padding: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langInitialBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  langInitialText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  langNameText: {
    fontSize: 12,
    textAlign: 'center',
  },
  horizontalStatsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  horizontalCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  horizontalCardValue: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  dateRangeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  dateRangeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  periodModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  periodModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  periodList: {
    marginBottom: 8,
  },
  periodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  periodItemText: {
    fontSize: 15,
  },
  periodCheckmark: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
