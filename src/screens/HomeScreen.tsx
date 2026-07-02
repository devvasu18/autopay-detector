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
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { db, Transaction, AutoPay } from '../services/db';
import { smsService } from '../services/smsService';

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
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
  });
  const [upcomingAutoPays, setUpcomingAutoPays] = useState<AutoPay[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

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
    setLoading(false);
  }, [checkPermissionState, fetchStats]);

  useEffect(() => {
    initData();

    const subscription = DeviceEventEmitter.addListener('onNewTransaction', () => {
      fetchStats();
    });

    return () => {
      subscription.remove();
    };
  }, [initData, fetchStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await checkPermissionState();
    await fetchStats();
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

        {/* Dashboard Core Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={[styles.statsCardLarge, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
            <Text style={styles.cardLabelLarge}>Net Savings</Text>
            <Text style={styles.cardValLarge}>{formatCurrency(stats.netSavings)}</Text>
            <View style={styles.cardDivide} />
            <View style={styles.cardRow}>
              <View>
                <Text style={styles.cardLabelSmall}>Income</Text>
                <Text style={styles.cardValSmall}>{formatCurrency(stats.totalIncome)}</Text>
              </View>
              <View>
                <Text style={styles.cardLabelSmall}>Expense</Text>
                <Text style={styles.cardValSmall}>{formatCurrency(stats.totalExpense)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Upcoming AutoPays Section */}
        {upcomingAutoPays.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming AutoPays</Text>
              <TouchableOpacity onPress={() => navigation.navigate('AutoPay')}>
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

        {/* Quick Insights Section */}
        <View style={styles.sectionContainer}>
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

        {/* Recent Transactions Section */}
        <View style={[styles.sectionContainer, { marginBottom: 30 }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Transactions</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Transactions')}>
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
      </ScrollView>
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
  statsContainer: {
    marginBottom: 24,
  },
  statsCardLarge: {
    borderRadius: 24,
    padding: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  cardLabelLarge: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
  cardValLarge: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 4,
  },
  cardDivide: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 16,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardLabelSmall: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
  },
  cardValSmall: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
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
});
