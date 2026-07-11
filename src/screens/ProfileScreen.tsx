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
  Modal,
  SafeAreaView,
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
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [showPrivacy, setShowPrivacy] = useState<boolean>(false);

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
          <TouchableOpacity style={styles.settingItem} onPress={() => setShowPrivacy(true)}>
            <View>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Privacy Policy</Text>
              <Text style={[styles.settingSubLabel, { color: colors.textSecondary }]}>
                Data handling and security details
              </Text>
            </View>
            <Text style={{ color: colors.primary, fontSize: 16 }}>&gt;</Text>
          </TouchableOpacity>
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

      {/* Privacy Policy Modal */}
      <Modal visible={showPrivacy} animationType="slide" onRequestClose={() => setShowPrivacy(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowPrivacy(false)} style={styles.backBtn}>
              <Text style={[styles.backBtnText, { color: colors.primary }]}>← Back</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Privacy Policy</Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={true}>
            <Text style={[styles.policyHeader, { color: colors.text }]}>AutoPay Tracker &gt; Privacy Policy</Text>
            <Text style={[styles.policyDate, { color: colors.textSecondary }]}>Last Updated: 7 Jul 2026</Text>

            <Text style={[styles.policyTitle, { color: colors.text }]}>Privacy Policy for AutoPay Tracker</Text>

            <Text style={[styles.policyText, { color: colors.text }]}>
              Falcon Coders ("Company", "we", "us", or "our") operates the AutoPay Tracker mobile application (the "App"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our App.
            </Text>

            <View style={[styles.highlightBox, { backgroundColor: colors.surfaceVariant, borderColor: colors.primary }]}>
              <Text style={[styles.highlightTitle, { color: colors.text }]}>🔑 Key Privacy Principle</Text>
              <Text style={[styles.highlightText, { color: colors.textSecondary }]}>
                Your SMS and notification data stays on YOUR device. We process SMS messages and notifications locally on your device to detect autopays. This data is NEVER uploaded to our servers.
              </Text>
            </View>

            <Text style={[styles.policySectionTitle, { color: colors.text }]}>1. Information We Collect</Text>

            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>1.1 Personal Information</Text>


            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>1.2 Device Information</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              We automatically collect:{"\n"}
              • Device ID (Android ID){"\n"}
              • Device manufacturer and model{"\n"}
              • Operating system version{"\n"}
              • App version{"\n"}
              • Language preference
            </Text>

            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>1.3 SMS Data</Text>
            <Text style={[styles.policyBoldText, { color: colors.text }]}>Local Processing Only</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              With your explicit permission, the App reads SMS messages from:{"\n"}
              • Banks (SBI, HDFC, ICICI, Axis, Kotak, and other Indian banks){"\n"}
              • Payment services{"\n\n"}
              Purpose: To automatically detect autopay transactions, EMIs, and recurring payments mentioned in bank SMS messages.{"\n\n"}
              <Text style={{ fontWeight: 'bold' }}>Important:</Text> SMS data is processed locally on your device. We do NOT upload or store your SMS content on our servers.
            </Text>

            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>1.4 Notification Data</Text>
            <Text style={[styles.policyBoldText, { color: colors.text }]}>Local Processing Only</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              With your explicit permission, the App monitors notifications from:{"\n"}
              • UPI apps (PhonePe, Google Pay, Paytm, BHIM, Amazon Pay){"\n"}
              • Banking apps{"\n\n"}
              Purpose: To detect autopay transactions and payment notifications.{"\n\n"}
              <Text style={{ fontWeight: 'bold' }}>Important:</Text> Notification data is processed locally on your device. We do NOT upload or store your notification content on our servers.
            </Text>

            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>1.5 Autopay Data</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              Information about detected or manually added autopays:{"\n"}
              • Service/subscription name{"\n"}
              • Amount{"\n"}
              • Payment frequency{"\n"}
              • Category{"\n"}
              • Due dates
            </Text>

            <Text style={[styles.policySectionTitle, { color: colors.text }]}>2. How We Use Your Information</Text>

            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>2.1 Provide Core Services</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              • Authenticate your account using phone number verification{"\n"}
              • Detect and track your autopay subscriptions{"\n"}
              • Display your recurring payment information
            </Text>

            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>2.2 Improve Our Services</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              • Analyze app usage patterns (anonymized){"\n"}
              • Fix bugs and improve performance{"\n"}
              • Develop new features
            </Text>

            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>2.3 Communication</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              • Provide customer support{"\n"}
              • Send important service updates
            </Text>

            <Text style={[styles.policySectionTitle, { color: colors.text }]}>3. Data Storage and Security</Text>

            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>3.1 Local Storage</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              • SMS and notification data is processed and stored locally on your device{"\n"}
              • Autopay information is stored in an encrypted local database{"\n"}
            </Text>

            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>3.2 Server Storage</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              We store on our secure servers:{"\n"}
              • Account information (phone number, name, email){"\n"}
              • Device information for authentication{"\n"}
              • Authentication tokens
            </Text>

            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>3.3 Security Measures</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              • All data transmission uses HTTPS encryption{"\n"}
              • Sensitive data encrypted with AES-256-GCM{"\n"}
              • Regular security audits{"\n"}
              • Access controls and authentication
            </Text>





            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>4.3 What We DON'T Do</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              • We do NOT read personal messages{"\n"}
              • We do NOT upload SMS/notification content to our servers{"\n"}
              • We do NOT share this data with third parties{"\n"}
              • We do NOT access messages older than 6 months
            </Text>

            <Text style={[styles.policySubSectionTitle, { color: colors.text }]}>5.4 Data Processing</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              All SMS and notification processing happens locally on your device.
            </Text>

            <Text style={[styles.policySectionTitle, { color: colors.text }]}>6. Data Sharing and Disclosure</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              We do NOT sell your personal information. We may share information only:{"\n\n"}
              <Text style={{ fontWeight: 'bold' }}>6.1 With Service Providers:</Text> Third-party companies that help us operate our services (listed in Section 4).{"\n\n"}
              <Text style={{ fontWeight: 'bold' }}>6.2 For Legal Requirements:</Text> When required by law, court order, or government request.{"\n\n"}
              <Text style={{ fontWeight: 'bold' }}>6.3 For Safety:</Text> To protect the rights, property, or safety of our users or others.{"\n\n"}
              <Text style={{ fontWeight: 'bold' }}>6.4 Business Transfers:</Text> In case of merger, acquisition, or sale of assets.
            </Text>

            <Text style={[styles.policySectionTitle, { color: colors.text }]}>8  Your Rights</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              To exercise these rights, contact us at: <Text style={{ textDecorationLine: 'underline' }}>falconcodersapp@gmail.com</Text>
            </Text>

            <Text style={[styles.policySectionTitle, { color: colors.text }]}> 9. Your Rights</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              To exercise these rights, visit at: <Text style={{ textDecorationLine: 'underline' }}>Our Official address</Text>
            </Text>

            <Text style={[styles.policySectionTitle, { color: colors.text }]}>9. Children's Privacy</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              The App is not intended for users under 18 years of age. We do not knowingly collect personal information from children. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.
            </Text>

            <Text style={[styles.policySectionTitle, { color: colors.text }]}>10. International Data Transfers</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              Your information may be transferred to and processed on servers located outside India. We ensure appropriate safeguards are in place for such transfers in compliance with applicable data protection laws.
            </Text>

            <Text style={[styles.policySectionTitle, { color: colors.text }]}>11. Changes to This Privacy Policy</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              We may update this Privacy Policy from time to time. We will notify you of any changes by:{"\n"}
              • Posting the new Privacy Policy in the App{"\n"}
              • Updating the "Last Updated" date{"\n"}
              • Sending a notification for significant changes{"\n\n"}
              Your continued use of the App after changes constitutes acceptance of the updated Privacy Policy.
            </Text>

            <Text style={[styles.policySectionTitle, { color: colors.text }]}>12. Contact Us</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              If you have questions about this Privacy Policy or our data practices, please contact us:{"\n\n"}
              <Text style={{ fontWeight: 'bold' }}>Binaryscript Private Limited</Text>{"\n"}
              Email: falconcodersapp@gmail.com{"\n"}
              Address: yelahanka bangalore , karnataka , india
            </Text>

            <Text style={[styles.policySectionTitle, { color: colors.text }]}>13. Grievance Officer</Text>
            <Text style={[styles.policyText, { color: colors.text }]}>
              In accordance with Information Technology Act 2000 and rules made thereunder, the name and contact details of the Grievance Officer are:{"\n\n"}
              Email: falconcodersapp@gmail.com{"\n"}
              Address: yelahanka bangalore , karnataka , india{"\n\n"}
              We will address your concerns within 30 days of receiving your complaint.
            </Text>

            <View style={[styles.summaryBox, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
              <Text style={[styles.summaryTitle, { color: colors.text }]}>📋 Summary</Text>

              <Text style={[styles.policyBoldText, { color: colors.text, marginTop: 10 }]}>What we collect:</Text>
              <Text style={[styles.summaryItemText, { color: colors.textSecondary }]}>
                • Phone number (for login){"\n"}
                • Name and email (optional){"\n"}
                • Device information
              </Text>

              <Text style={[styles.policyBoldText, { color: colors.text, marginTop: 10 }]}>What stays on YOUR device (never uploaded):</Text>
              <Text style={[styles.summaryItemText, { color: colors.textSecondary }]}>
                • SMS messages from banks{"\n"}
                • Notifications from UPI/banking apps{"\n"}
                • Detected autopay details
              </Text>

              <Text style={[styles.policyBoldText, { color: colors.text, marginTop: 10 }]}>What we DON'T do:</Text>
              <Text style={[styles.summaryItemText, { color: colors.textSecondary }]}>
                • Upload your SMS or notifications{"\n"}
                • Read personal messages{"\n"}
                • Sell your data{"\n"}
                • Show ads
              </Text>

              <Text style={[styles.summaryFooterText, { color: colors.primary, marginTop: 15 }]}>
                Your financial data, your control. Always.
              </Text>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  backBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalScrollContent: {
    padding: 20,
  },
  policyHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  policyDate: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 20,
  },
  policyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  policySectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 25,
    marginBottom: 10,
  },
  policySubSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 6,
  },
  policyBoldText: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 6,
  },
  policyText: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  highlightBox: {
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    marginVertical: 15,
  },
  highlightTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  highlightText: {
    fontSize: 12,
    lineHeight: 18,
  },
  summaryBox: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    marginTop: 25,
    marginBottom: 15,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  summaryItemText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  summaryFooterText: {
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
