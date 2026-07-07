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
  const [batteryIgnored, setBatteryIgnored] = useState<boolean>(true);
  const [manufacturer, setManufacturer] = useState<string>('');

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

      const batt = await smsService.isBatteryOptimizationIgnored();
      setBatteryIgnored(batt);

      const mfg = await smsService.getDeviceManufacturer();
      setManufacturer(mfg);
    } catch (err) {
      console.warn('Failed to fetch stats', err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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

        {/* Background services */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Background Processing</Text>
        <View style={[styles.settingsList, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.settingItem}>
            <View style={{ flex: 0.7 }}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Battery Optimization</Text>
              <Text style={[styles.settingSubLabel, { color: colors.textSecondary }]}>
                {batteryIgnored ? '🔋 Allowed in background' : '⚠️ Battery saver may block background speech'}
              </Text>
            </View>
            {!batteryIgnored && (
              <TouchableOpacity
                style={[styles.smallActionBtn, { backgroundColor: colors.primary }]}
                onPress={async () => {
                  await smsService.requestIgnoreBatteryOptimizations();
                  const batt = await smsService.isBatteryOptimizationIgnored();
                  setBatteryIgnored(batt);
                }}
              >
                <Text style={styles.smallActionBtnText}>Allow</Text>
              </TouchableOpacity>
            )}
          </View>

          {['xiaomi', 'redmi', 'poco', 'oppo', 'realme', 'vivo', 'oneplus', 'unknown'].includes(manufacturer.toLowerCase()) && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.settingItem}>
                <View style={{ flex: 0.7 }}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>Auto-start Permission</Text>
                  <Text style={[styles.settingSubLabel, { color: colors.textSecondary }]}>
                    Required for {manufacturer || 'your'} device to receive SMS when the app is closed.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.smallActionBtn, { backgroundColor: colors.primary }]}
                  onPress={async () => {
                    await smsService.openAutostartSettings();
                  }}
                >
                  <Text style={styles.smallActionBtnText}>Configure</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
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

        </View>

        {/* Development utilities */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Maintenance</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.error + '15', flex: 1 }]}
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
  smallActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  smallActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
