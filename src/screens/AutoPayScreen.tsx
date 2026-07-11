import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  DeviceEventEmitter,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { db, AutoPay } from '../services/db';
import { smsService } from '../services/smsService';
import { MerchantLogo } from '../components/MerchantLogo';

export const AutoPayScreen: React.FC = () => {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [autoPays, setAutoPays] = useState<AutoPay[]>([]);
  const [selectedAutoPay, setSelectedAutoPay] = useState<AutoPay | null>(null);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [installedApps, setInstalledApps] = useState<{ packageName: string; appName: string }[]>([]);
  const [instructionModalVisible, setInstructionModalVisible] = useState(false);
  const [targetAppName, setTargetAppName] = useState('');

  const fetchAutoPays = useCallback(async () => {
    setLoading(true);
    try {
      const data = await db.getAutoPays();
      setAutoPays(data);
    } catch (err) {
      console.warn('Failed to load autopays', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAutoPays();

    const subscription = DeviceEventEmitter.addListener('onNewTransaction', () => {
      fetchAutoPays();
    });

    return () => {
      subscription.remove();
    };
  }, [fetchAutoPays]);

  const handleCancelClick = async (autopay: AutoPay) => {
    setSelectedAutoPay(autopay);
    setLoading(true);
    try {
      const apps = await smsService.getInstalledApps();
      setInstalledApps(apps);
      setCancelModalVisible(true);
    } catch (err) {
      console.warn('Failed to retrieve financial apps', err);
      Alert.alert('Error', 'Could not retrieve financial apps.');
    } finally {
      setLoading(false);
    }
  };

  const executeCancellationRedirection = async (packageName: string, appName: string) => {
    setCancelModalVisible(false);
    setTargetAppName(appName);
    try {
      const opened = await smsService.openApp(packageName);
      if (opened) {
        // Show instruction modal since redirection succeeded
        setInstructionModalVisible(true);
      } else {
        Alert.alert('Error', `Could not open ${appName}.`);
      }
    } catch (err) {
      Alert.alert('Error', `Failed to open ${appName}.`);
    }
  };

  const handleSimulatedRedirection = (appName: string) => {
    setCancelModalVisible(false);
    setTargetAppName(appName);
    setInstructionModalVisible(true);
  };

  const formatCurrency = (value: number) => {
    return `₹${value.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    })}`;
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'N/A';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return 'N/A';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return colors.textGreen;
      case 'Paused':
        return '#E65100'; // Orange
      case 'Cancelled':
      case 'Expired':
        return colors.textSecondary;
      case 'Missed':
        return colors.textRed;
      default:
        return colors.text;
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'Active':
        return colors.success + '15';
      case 'Paused':
        return '#FFF3E0';
      case 'Cancelled':
      case 'Expired':
        return colors.surfaceVariant;
      case 'Missed':
        return colors.error + '15';
      default:
        return colors.surfaceVariant;
    }
  };

  // Popular Indian apps to show if no apps are detected natively (e.g. on clean emulators)
  const fallbackApps = [
    { packageName: 'com.google.android.apps.nbu.paisa.user', appName: 'Google Pay' },
    { packageName: 'com.phonepe.app', appName: 'PhonePe' },
    { packageName: 'net.one97.paytm', appName: 'Paytm' },
    { packageName: 'com.dreamplug.androidapp', appName: 'CRED' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Active AutoPay & Mandates</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Only financial recurring instructions and bills
        </Text>
      </View>

      {loading && autoPays.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : autoPays.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchAutoPays}
              colors={[colors.primary]}
            />
          }
        >
          <Text style={[styles.emptyEmoji]}>🔄</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No AutoPays Detected</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Scan financial SMS or seed demo data in the Profile tab to view auto debit cards.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchAutoPays}
              colors={[colors.primary]}
            />
          }
        >
          {autoPays.map((ap) => (
            <View
              key={ap.id}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              {/* Top Row */}
              <View style={styles.row}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                  <MerchantLogo name={ap.merchant} size={28} />
                  <Text
                    style={[styles.merchantName, { color: colors.text, marginLeft: 10, flex: 1 }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {ap.merchant}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusBgColor(ap.status) },
                  ]}
                >
                  <Text style={[styles.statusText, { color: getStatusColor(ap.status) }]}>
                    {ap.status}
                  </Text>
                </View>
              </View>

              {/* Amount Row */}
              <View style={styles.row}>
                <Text style={[styles.amount, { color: colors.text }]}>
                  {formatCurrency(ap.amount)}
                </Text>
                <Text style={[styles.frequency, { color: colors.textSecondary }]}>
                  {ap.frequency}
                </Text>
              </View>

              {/* Bank and UPI Details */}
              <View style={styles.detailsRow}>
                <Text style={[styles.detailsText, { color: colors.textSecondary }]}>
                  Bank: <Text style={{ color: colors.text }}>{ap.bank}</Text>
                </Text>
                {ap.upi_id ? (
                  <Text style={[styles.detailsText, { color: colors.textSecondary }]}>
                    UPI ID: <Text style={{ color: colors.text }}>{ap.upi_id}</Text>
                  </Text>
                ) : null}
              </View>

              {/* Date Metadata */}
              <View style={styles.metaDivider} />
              <View style={styles.metaRow}>
                <View>
                  <Text style={styles.metaLabel}>First Detected</Text>
                  <Text style={[styles.metaVal, { color: colors.text }]}>
                    {formatDate(ap.first_detected)}
                  </Text>
                </View>
                <View>
                  <Text style={styles.metaLabel}>Last Payment</Text>
                  <Text style={[styles.metaVal, { color: colors.text }]}>
                    {formatDate(ap.last_payment)}
                  </Text>
                </View>
                {ap.status === 'Active' && (
                  <View>
                    <Text style={styles.metaLabel}>Next Expected</Text>
                    <Text style={[styles.metaVal, { color: colors.text }]}>
                      {formatDate(ap.next_expected_payment)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Action Button */}
              {ap.status === 'Active' && (
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.primary }]}
                  onPress={() => handleCancelClick(ap)}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.primary }]}>
                    Cancel AutoPay
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Cancel AutoPay Selection Modal */}
      <Modal
        visible={cancelModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCancelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Cancel Mandate on Payment App
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              UPI Mandates can only be revoked within the UPI app they were set up in. Select the app
              used for {selectedAutoPay?.merchant}:
            </Text>

            {installedApps.length > 0 ? (
              <View style={styles.appList}>
                <Text style={[styles.appHeader, { color: colors.primary }]}>
                  Detected Apps on Your Device:
                </Text>
                {installedApps.map((app) => (
                  <TouchableOpacity
                    key={app.packageName}
                    style={[styles.appItem, { borderColor: colors.border }]}
                    onPress={() =>
                      executeCancellationRedirection(app.packageName, app.appName)
                    }
                  >
                    <View style={styles.appIconWrapper}>
                      <Text style={styles.appIconText}>📲</Text>
                    </View>
                    <Text style={[styles.appItemText, { color: colors.text }]}>
                      {app.appName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.appList}>
                <Text style={[styles.appHeader, { color: colors.textSecondary }]}>
                  No UPI apps detected. Showing support portal list:
                </Text>
                {fallbackApps.map((app) => (
                  <TouchableOpacity
                    key={app.packageName}
                    style={[styles.appItem, { borderColor: colors.border }]}
                    onPress={() => handleSimulatedRedirection(app.appName)}
                  >
                    <View style={styles.appIconWrapper}>
                      <Text style={styles.appIconText}>📱</Text>
                    </View>
                    <Text style={[styles.appItemText, { color: colors.text }]}>
                      {app.appName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.surfaceVariant }]}
              onPress={() => setCancelModalVisible(false)}
            >
              <Text style={[styles.closeBtnText, { color: colors.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Cancellation Instructions Modal */}
      <Modal
        visible={instructionModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setInstructionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, padding: 24 }]}>
            <Text style={[styles.modalTitle, { color: colors.text, fontSize: 18 }]}>
              Revoke {selectedAutoPay?.merchant} Mandate
            </Text>
            <Text style={[styles.instructionStep, { color: colors.text }]}>
              We have opened or simulated launching <Text style={{ fontWeight: 'bold' }}>{targetAppName}</Text>.
            </Text>
            <View style={styles.stepBox}>
              <Text style={[styles.stepText, { color: colors.text }]}>
                1️⃣ Open your profile/settings in <Text style={{ fontWeight: 'bold' }}>{targetAppName}</Text>.
              </Text>
              <Text style={[styles.stepText, { color: colors.text }]}>
                2️⃣ Find <Text style={{ fontWeight: 'bold' }}>"UPI AutoPay"</Text> or <Text style={{ fontWeight: 'bold' }}>"Mandates"</Text>.
              </Text>
              <Text style={[styles.stepText, { color: colors.text }]}>
                3️⃣ Look for <Text style={{ fontWeight: 'bold' }}>"{selectedAutoPay?.merchant}"</Text> in the list.
              </Text>
              <Text style={[styles.stepText, { color: colors.text }]}>
                4️⃣ Tap <Text style={{ fontWeight: 'bold', color: colors.textRed }}>"Revoke Mandate"</Text> or <Text style={{ fontWeight: 'bold', color: colors.textRed }}>"Cancel AutoPay"</Text> and authorize using your UPI PIN.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                setInstructionModalVisible(false);
                fetchAutoPays();
              }}
            >
              <Text style={[styles.closeBtnText, { color: '#FFF' }]}>Got It, I'll Cancel It</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContainer: {
    padding: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  merchantName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  amount: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  frequency: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  detailsText: {
    fontSize: 12,
    marginRight: 16,
    marginTop: 2,
  },
  metaDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    marginVertical: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    fontSize: 10,
    color: '#8A8A8F',
    marginBottom: 2,
  },
  metaVal: {
    fontSize: 12,
    fontWeight: '600',
  },
  cancelBtn: {
    marginTop: 16,
    borderWidth: 1,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  appList: {
    marginVertical: 10,
  },
  appHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  appItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 10,
  },
  appIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  appIconText: {
    fontSize: 16,
  },
  appItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  closeBtn: {
    marginVertical: 12,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  instructionStep: {
    fontSize: 13,
    marginBottom: 12,
  },
  stepBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  stepText: {
    fontSize: 13,
    lineHeight: 22,
    marginBottom: 8,
  },
});
