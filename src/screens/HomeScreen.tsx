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
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { db, Transaction, AutoPay } from '../services/db';
import { smsService } from '../services/smsService';

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

  // Soundbox & Voice settings
  const [soundboxSettings, setSoundboxSettings] = useState({
    credit: true,
    debit: true,
    upcoming: true,
    language: 'en',
  });
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);

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
    } catch (e) {}
  };

  const handleSelectLanguage = async (langCode: string) => {
    await db.setSetting('voice_language', langCode);
    setSoundboxSettings((prev) => ({ ...prev, language: langCode }));
    setLangModalVisible(false);
    setTimeout(() => {
      speakConfirmation(langCode);
    }, 300);
  };

  const handleNewTransactionVoice = async (tx: {
    type: 'CREDIT' | 'DEBIT';
    amount: number;
    merchant: string;
    category: string;
    isAutoPay: boolean;
  }) => {
    try {
      const creditSetting = await db.getSetting('voice_credit', 'true');
      const debitSetting = await db.getSetting('voice_debit', 'true');
      const upcomingSetting = await db.getSetting('voice_upcoming', 'true');
      const voiceLang = await db.getSetting('voice_language', 'en');

      const voiceCredit = creditSetting === 'true';
      const voiceDebit = debitSetting === 'true';
      const voiceUpcoming = upcomingSetting === 'true';

      let shouldSpeak = false;
      let isUpcoming = tx.isAutoPay && tx.type === 'DEBIT';

      if (tx.type === 'CREDIT' && voiceCredit) {
        shouldSpeak = true;
      } else if (tx.type === 'DEBIT') {
        if (tx.isAutoPay && voiceUpcoming) {
          shouldSpeak = true;
          isUpcoming = true;
        } else if (voiceDebit) {
          shouldSpeak = true;
        }
      }

      if (!shouldSpeak) return;

      const amount = tx.amount;
      const merchant = tx.merchant;
      let text = '';

      if (voiceLang === 'en') {
        text = isUpcoming
          ? `Reminder: Upcoming payment of rupees ${amount} for ${merchant}`
          : tx.type === 'CREDIT'
            ? `Received rupees ${amount} from ${merchant}`
            : `Paid rupees ${amount} to ${merchant}`;
      } else if (voiceLang === 'hi') {
        text = isUpcoming
          ? `याद दिलाएं: ${merchant} के लिए ${amount} रुपये का आगामी भुगतान`
          : tx.type === 'CREDIT'
            ? `${merchant} से ${amount} रुपये प्राप्त हुए`
            : `${merchant} को ${amount} रुपये का भुगतान किया गया`;
      } else if (voiceLang === 'kn') {
        text = isUpcoming
          ? `ನೆನಪೋಲೆ: ${merchant} ಗಾಗಿ ${amount} ರೂಪಾಯಿ ಮುಂಬರುವ ಪಾವತಿ`
          : tx.type === 'CREDIT'
            ? `${merchant} ನಿಂದ ${amount} ರೂಪಾಯಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ`
            : `${merchant} ಗೆ ${amount} ರೂಪಾಯಿ ಪಾವತಿಸಲಾಗಿದೆ`;
      } else if (voiceLang === 'ta') {
        text = isUpcoming
          ? `நினைவூட்டல்: ${merchant} க்கான ${amount} ரூபாய் வரவிருக்கும் கட்டணம்`
          : tx.type === 'CREDIT'
            ? `${merchant} இடமிருந்து ${amount} ரூபாய் பெறப்பட்டது`
            : `${merchant} க்கு ${amount} ரூபாய் செலுத்தப்பட்டது`;
      } else if (voiceLang === 'te') {
        text = isUpcoming
          ? `రిమైండర్: ${merchant} కోసం ${amount} రూపాయల రాబోయే చెల్లింపు`
          : tx.type === 'CREDIT'
            ? `${merchant} నుండి ${amount} రూపాయలు స్వీకరించబడింది`
            : `${merchant} కి ${amount} రూపాయలు చెల్లించబడింది`;
      } else if (voiceLang === 'mr') {
        text = isUpcoming
          ? `स्मरणपत्र: ${merchant} साठी ${amount} रुपयांचे आगामी पेमेंट`
          : tx.type === 'CREDIT'
            ? `${merchant} कडून ${amount} रुपये प्राप्त झाले`
            : `${merchant} ला ${amount} रुपयांचे पेमेंट केले`;
      } else if (voiceLang === 'gu') {
        text = isUpcoming
          ? `રિમાઇન્ડર: ${merchant} માટે ${amount} રૂપિયાની આગામી ચુકવણી`
          : tx.type === 'CREDIT'
            ? `${merchant} તરફથી ${amount} રૂપિયા મળ્યા`
            : `${merchant} ને ${amount} રૂપિયા ચૂકવવામાં આવ્યા`;
      } else if (voiceLang === 'bn') {
        text = isUpcoming
          ? `রিমাইন্ডার: ${merchant} এর জন্য ${amount} টাকার আসন্ন পেমেন্ট`
          : tx.type === 'CREDIT'
            ? `${merchant} থেকে ${amount} টাকা পাওয়া গেছে`
            : `${merchant} কে ${amount} টাকা প্রদান করা হয়েছে`;
      } else if (voiceLang === 'ml') {
        text = isUpcoming
          ? `ഓർമ്മപ്പെടുത്തൽ: ${merchant} ലേക്കുള്ള ${amount} രൂപയുടെ വരാനിരിക്കുന്ന പേയ്‌മെന്റ്`
          : tx.type === 'CREDIT'
            ? `${merchant} ൽ നിന്ന് ${amount} രൂപ ലഭിച്ചു`
            : `${merchant} ലേക്ക് ${amount} രൂപ അടച്ചു`;
      } else if (voiceLang === 'pa') {
        text = isUpcoming
          ? `ਯਾਦ ਦਿਵਾਓ: ${merchant} ਲਈ ${amount} ਰੁਪਏ ਦਾ ਆਉਣ ਵਾਲਾ ਭੁਗਤਾਨ`
          : tx.type === 'CREDIT'
            ? `${merchant} ਤੋਂ ${amount} ਰੁਪਏ ਪ੍ਰਾਪਤ ਹੋਏ`
            : `${merchant} ਨੂੰ ${amount} ਰੁਪਏ ਦਾ ਭੁਗਤਾਨ ਕੀਤਾ ਗਿਆ`;
      } else {
        text = `Rupees ${amount} ${tx.type === 'CREDIT' ? 'received' : 'paid'}`;
      }

      const { NativeModules } = require('react-native');
      if (NativeModules.FinanceCoreModule && NativeModules.FinanceCoreModule.speak) {
        await NativeModules.FinanceCoreModule.speak(text, voiceLang);
      }
    } catch (e) {
      console.warn('Failed to announce voice event', e);
    }
  };

  const fetchStats = useCallback(async () => {
    try {
      const dbStats = await db.getStats();
      setStats(dbStats);

      const autopays = await db.getAutoPays();
      const active = autopays.filter((ap) => ap.status === 'Active');
      setUpcomingAutoPays(active.slice(0, 3));
    } catch (err) {
      console.warn('Failed to load database stats', err);
    }
  }, []);

  const checkPermissionState = useCallback(async () => {
    const isGranted = await smsService.checkPermission();
    setHasPermission(isGranted);
  }, []);

  const initData = useCallback(async () => {
    setLoading(true);
    await checkPermissionState();
    await fetchStats();
    await loadVoiceSettings();
    setLoading(false);
  }, [checkPermissionState, fetchStats, loadVoiceSettings]);

  useEffect(() => {
    initData();

    const subscription = DeviceEventEmitter.addListener('onNewTransaction', (eventData?: any) => {
      fetchStats();
      if (eventData) {
        handleNewTransactionVoice(eventData);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [initData, fetchStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await checkPermissionState();
    await fetchStats();
    await loadVoiceSettings();
    setRefreshing(false);
  };

  const handleSync = async () => {
    const isGranted = await smsService.checkPermission();
    if (!isGranted) {
      const requested = await smsService.requestPermission();
      if (!requested) {
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
      setHasPermission(true);
    }

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

  // Quick Insights generator
  const getInsights = () => {
    const list = [];
    if (stats.totalExpense > 0) {
      list.push({
        id: 'spend_insight',
        emoji: '💳',
        text: `You spent ${formatCurrency(stats.totalExpense)} this month.`,
        detail: stats.netSavings < 0 ? 'Your spending exceeds credit this month.' : 'Savings rate is looking healthy!',
      });
    }
    if (stats.activeAutoPays > 0) {
      list.push({
        id: 'subs_insight',
        emoji: '🔄',
        text: `${stats.activeAutoPays} active autopay mandates detected.`,
        detail: 'Click AutoPay tab below to view app redirection portals.',
      });
    }

    // Check next upcoming payment within next 7 days
    const upcoming = upcomingAutoPays[0];
    if (upcoming) {
      list.push({
        id: 'upcoming_insight',
        emoji: '⏰',
        text: `Your ${upcoming.merchant} payment of ${formatCurrency(upcoming.amount)} renews soon.`,
        detail: `Next debit expected on ${formatDate(upcoming.next_expected_payment)}.`,
      });
    }

    if (stats.largestExpense) {
      list.push({
        id: 'large_expense',
        emoji: '🔥',
        text: `Largest expense was ${formatCurrency(stats.largestExpense.amount)} at ${stats.largestExpense.merchant}.`,
        detail: `Occurred on ${formatDate(stats.largestExpense.date)}.`,
      });
    }

    if (list.length === 0) {
      list.push({
        id: 'no_data',
        emoji: '💡',
        text: 'No insights available yet.',
        detail: 'Trigger SMS Sync or go to Settings to seed sample data.',
      });
    }

    return list;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>Welcome Back,</Text>
          <Text style={[styles.title, { color: colors.text }]}>AutoPay Tracker</Text>
        </View>
      </View>

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
              <Text style={styles.soundboxIcon}>📢</Text>
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

        {/* Dashboard Core Stats Cards - 4 Modern Grid Cards */}
        <View style={styles.gridContainer}>
          <View style={styles.gridRow}>
            {/* OTT Card */}
            <View style={[
              styles.gridCard,
              {
                backgroundColor: colors.isDark ? '#2D1F3F' : '#F5E6FF',
                borderColor: colors.isDark ? '#5C387F' : '#E8C5FF',
                shadowColor: colors.isDark ? '#5C387F' : '#8A2BE2',
              }
            ]}>
              <View style={styles.cardIconHeader}>
                <Text style={styles.cardIconEmoji}>🎬</Text>
                <Text style={[styles.cardTitleText, { color: colors.isDark ? '#D8B4FE' : '#6B21A8' }]}>OTT</Text>
              </View>
              <Text style={[styles.cardValueText, { color: colors.isDark ? '#F3E8FF' : '#4C1D95' }]}>
                {formatCurrency(stats.ottSpend)}
              </Text>
              <Text style={[styles.cardSubtitleText, { color: colors.isDark ? '#C084FC' : '#701A75' }]}>
                Subscription spend
              </Text>
            </View>

            {/* Autopay Card */}
            <View style={[
              styles.gridCard,
              {
                backgroundColor: colors.isDark ? '#1C322E' : '#E6FFFA',
                borderColor: colors.isDark ? '#2C5E54' : '#B2F5EA',
                shadowColor: colors.isDark ? '#2C5E54' : '#319795',
              }
            ]}>
              <View style={styles.cardIconHeader}>
                <Text style={styles.cardIconEmoji}>🔄</Text>
                <Text style={[styles.cardTitleText, { color: colors.isDark ? '#81E6D9' : '#007769' }]}>Autopay</Text>
              </View>
              <Text style={[styles.cardValueText, { color: colors.isDark ? '#E6FFFA' : '#004D40' }]}>
                {formatCurrency(stats.autopaySpend)}
              </Text>
              <Text style={[styles.cardSubtitleText, { color: colors.isDark ? '#4FD1C5' : '#006D5B' }]}>
                Scheduled debits
              </Text>
            </View>
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
                <Text style={styles.cardIconEmoji}>🏦</Text>
                <Text style={[styles.cardTitleText, { color: colors.isDark ? '#90CDF4' : '#1A365D' }]}>Bank</Text>
              </View>
              <Text style={[styles.cardValueText, { color: colors.isDark ? '#EBF8FF' : '#0B3C5D' }]}>
                {formatCurrency(stats.bankSpend)}
              </Text>
              <Text style={[styles.cardSubtitleText, { color: colors.isDark ? '#63B3ED' : '#2A4365' }]}>
                Transfers & EMIs
              </Text>
            </View>

            {/* Recharge Card */}
            <View style={[
              styles.gridCard,
              {
                backgroundColor: colors.isDark ? '#3D281F' : '#FFF5F5',
                borderColor: colors.isDark ? '#6B4A3A' : '#FED7D7',
                shadowColor: colors.isDark ? '#6B4A3A' : '#E53E3E',
              }
            ]}>
              <View style={styles.cardIconHeader}>
                <Text style={styles.cardIconEmoji}>📱</Text>
                <Text style={[styles.cardTitleText, { color: colors.isDark ? '#FEB2B2' : '#9B2C2C' }]}>Recharge</Text>
              </View>
              <Text style={[styles.cardValueText, { color: colors.isDark ? '#FFF5F5' : '#7B1515' }]}>
                {formatCurrency(stats.rechargeSpend)}
              </Text>
              <Text style={[styles.cardSubtitleText, { color: colors.isDark ? '#FC8181' : '#9B2C2C' }]}>
                Mobile & utility
              </Text>
            </View>
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
                    <Text style={[styles.autoPayMerchant, { color: colors.text }]}>{ap.merchant}</Text>
                    <View style={[styles.badge, { backgroundColor: colors.success + '20' }]}>
                      <Text style={[styles.badgeText, { color: colors.textGreen }]}>{ap.status}</Text>
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
                  <View style={[styles.txIcon, { backgroundColor: tx.type === 'CREDIT' ? colors.success + '20' : colors.primary + '15' }]}>
                    <Text style={{ color: tx.type === 'CREDIT' ? colors.textGreen : colors.primary }}>
                      {tx.type === 'CREDIT' ? '↙' : '↗'}
                    </Text>
                  </View>
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
              <Text style={styles.insightEmoji}>{insight.emoji}</Text>
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
  insightEmoji: {
    fontSize: 24,
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
});
