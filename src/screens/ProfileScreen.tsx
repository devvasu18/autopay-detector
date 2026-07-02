import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { db } from '../services/db';
import { smsService } from '../services/smsService';

export const ProfileScreen: React.FC = () => {
  const { colors, isDark, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    rawSmsCount: 0,
    txCount: 0,
    autopayCount: 0,
  });
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const rawCount = await db.execute('SELECT COUNT(*) as count FROM raw_sms');
      const txCount = await db.execute('SELECT COUNT(*) as count FROM transactions');
      const autoCount = await db.execute('SELECT COUNT(*) as count FROM autopay');

      setStats({
        rawSmsCount: rawCount[0]?.count || 0,
        txCount: txCount[0]?.count || 0,
        autopayCount: autoCount[0]?.count || 0,
      });

      const perm = await smsService.checkPermission();
      setHasPermission(perm);
    } catch (err) {
      console.warn('Failed to fetch stats', err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSeedData = async () => {
    setLoading(true);
    try {
      await db.seedDummyData();
      Alert.alert('Success', 'Rich financial dummy data has been successfully seeded in the local SQLite database.');
      await fetchStats();
    } catch (err: any) {
      Alert.alert('Seed Failed', err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Wipe Database',
      'Are you sure you want to clear all transactions, raw logs, and autopay mandates? This action is permanent.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe Everything',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await db.clearDatabase();
              Alert.alert('Success', 'Database cleared successfully.');
              await fetchStats();
            } catch (err: any) {
              Alert.alert('Failed', err.message || 'An error occurred.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handlePermissionToggle = async () => {
    if (hasPermission) {
      Alert.alert(
        'Disable Permission',
        'Android permission must be disabled in system App Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => smsService.openSettings() },
        ]
      );
    } else {
      const granted = await smsService.requestPermission();
      setHasPermission(granted);
      if (granted) {
        Alert.alert('Success', 'SMS reading permission granted. Go to Home to scan your inbox!');
      } else {
        Alert.alert('Denied', 'Permission was denied. You can enable it anytime in system Settings.');
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Settings & Security</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Device-only database controls
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Security Banner */}
        <View style={[styles.securityCard, { backgroundColor: colors.primaryContainer }]}>
          <Text style={[styles.securityTitle, { color: colors.primary }]}>🔒 100% Privacy Secure</Text>
          <Text style={[styles.securityText, { color: colors.primary }]}>
            All SMS processing and analysis happens locally on this device. We never upload your text
            messages or financial profiles to the cloud.
          </Text>
        </View>

        {/* Database Stats Section */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Local Data Bank</Text>
        <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: colors.text }]}>Raw SMS Processed</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.rawSmsCount}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: colors.text }]}>Transactions Indexed</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.txCount}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: colors.text }]}>AutoPay Mandates</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.autopayCount}</Text>
          </View>
        </View>

        {/* Configuration settings */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferences</Text>
        <View style={[styles.settingsList, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.settingItem}>
            <View>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Dark Mode</Text>
              <Text style={[styles.settingSubLabel, { color: colors.textSecondary }]}>
                Toggle high-contrast theme
              </Text>
            </View>
            <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ true: colors.primary }} />
          </View>

          <View style={styles.statDivider} />

          <View style={styles.settingItem}>
            <View style={{ flex: 1, marginRight: 16 }}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>SMS Inbox Access</Text>
              <Text style={[styles.settingSubLabel, { color: colors.textSecondary }]}>
                Analyze text receipts locally
              </Text>
            </View>
            <Switch
              value={!!hasPermission}
              onValueChange={handlePermissionToggle}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </View>

        {/* Development utilities */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Maintenance</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primaryContainer }]}
            onPress={handleSeedData}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.actionBtnText, { color: colors.primary }]}>🌱 Seed Demo Data</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.error + '15' }]}
            onPress={handleClearData}
            disabled={loading}
          >
            <Text style={[styles.actionBtnText, { color: colors.textRed }]}>🗑️ Wipe Database</Text>
          </TouchableOpacity>
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  scrollContent: {
    padding: 20,
  },
  securityCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  securityText: {
    fontSize: 12,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginVertical: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statsCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  settingsList: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingSubLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  actionBtn: {
    flex: 0.48,
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
});
