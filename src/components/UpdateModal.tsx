import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  DeviceEventEmitter,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import updateService, { UpdateStatus } from '../services/updateService';

const { width } = Dimensions.get('window');

export const UpdateModal: React.FC = () => {
  const { colors } = useTheme();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    state: 'IDLE',
    type: null,
    progress: 0,
    installedVersion: '0.0.0',
    newVersion: '0.0.0',
  });

  // Keep modal visible if flexible prompt or immediate block is active
  const [showFlexiblePrompt, setShowFlexiblePrompt] = useState(false);

  useEffect(() => {
    const unsubscribe = updateService.addListener((status) => {
      setUpdateStatus(status);
      
      // Automatically show flexible prompt when update is fully downloaded
      if (status.state === 'DOWNLOADED') {
        setShowFlexiblePrompt(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleUpdatePress = () => {
    if (updateStatus.type === 'IMMEDIATE' || updateStatus.type === 'FLEXIBLE') {
      // Re-trigger Play Core update flow
      updateService.checkAndUpdate(true);
    } else {
      // Launch fallback Play Store link
      updateService.triggerRedirectionFallback();
    }
  };

  const handleRestartPress = () => {
    setShowFlexiblePrompt(false);
    updateService.installDownloadedUpdate();
  };

  const handleLaterPress = () => {
    setShowFlexiblePrompt(false);
    // Silent flexible update complete - user chose to restart later
  };

  const isForceUpdate =
    updateStatus.type === 'IMMEDIATE' || updateStatus.type === 'FALLBACK_IMMEDIATE';

  const isDownloading = updateStatus.state === 'DOWNLOADING';
  const isInstalling = updateStatus.state === 'INSTALLING';

  // Render Full Screen Blocking Modal for Force Updates
  if (isForceUpdate && updateStatus.state !== 'IDLE') {
    return (
      <Modal
        visible={true}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}} // Non-dismissible
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.card}>
            <Text style={styles.icon}>🚀</Text>
            <Text style={[styles.title, { color: colors.text }]}>
              Critical Update Required
            </Text>
            
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              To keep your AutoPay Tracker secure and functioning properly, you must update to the latest version to continue.
            </Text>

            <View style={[styles.versionBox, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={[styles.versionText, { color: colors.text }]}>
                Installed: <Text style={styles.bold}>{updateStatus.installedVersion}</Text>
              </Text>
              <Text style={[styles.versionText, { color: colors.text }]}>
                Latest: <Text style={[styles.bold, { color: colors.primary }]}>{updateStatus.newVersion}</Text>
              </Text>
            </View>

            {isDownloading ? (
              <View style={styles.progressContainer}>
                <Text style={[styles.statusText, { color: colors.primary }]}>
                  Downloading update: {updateStatus.progress}%
                </Text>
                <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceVariant }]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        backgroundColor: colors.primary,
                        width: `${updateStatus.progress}%`,
                      },
                    ]}
                  />
                </View>
                <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />
              </View>
            ) : isInstalling ? (
              <View style={styles.progressContainer}>
                <Text style={[styles.statusText, { color: colors.primary }]}>
                  Installing update...
                </Text>
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 12 }} />
              </View>
            ) : (
              <View style={styles.actionContainer}>
                {updateStatus.error && (
                  <Text style={[styles.errorText, { color: colors.textRed }]}>
                    {updateStatus.error}
                  </Text>
                )}
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.primary }]}
                  activeOpacity={0.8}
                  onPress={handleUpdatePress}
                >
                  <Text style={styles.buttonText}>Update Now</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  // Render Flexible Update Download Complete Banner/Modal
  if (showFlexiblePrompt && updateStatus.state === 'DOWNLOADED') {
    return (
      <Modal
        visible={true}
        transparent={true}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={handleLaterPress}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.bottomSheet, { backgroundColor: colors.card }]}>
            <Text style={styles.sheetIcon}>✨</Text>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              Update Ready to Install
            </Text>
            <Text style={[styles.sheetDescription, { color: colors.textSecondary }]}>
              A new version of AutoPay Tracker has been downloaded in the background. Restart the app now to apply the update.
            </Text>

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.sheetButtonSecondary, { borderColor: colors.border }]}
                onPress={handleLaterPress}
              >
                <Text style={[styles.sheetBtnSecText, { color: colors.textSecondary }]}>Later</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sheetButtonPrimary, { backgroundColor: colors.primary }]}
                onPress={handleRestartPress}
              >
                <Text style={styles.sheetBtnPriText}>Restart & Install</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // Render Fallback Flexible Update Modal (e.g. Remote API says update is available, but no Play Core)
  const isFallbackFlexible = updateStatus.type === 'FALLBACK_FLEXIBLE';
  const showFallbackPrompt = updateStatus.state === 'UPDATE_AVAILABLE' && isFallbackFlexible;

  if (showFallbackPrompt) {
    return (
      <Modal
        visible={true}
        transparent={true}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => updateService.checkAndUpdate(false)} // Close / Dismiss
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.bottomSheet, { backgroundColor: colors.card }]}>
            <Text style={styles.sheetIcon}>📢</Text>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              New Version Available
            </Text>
            <Text style={[styles.sheetDescription, { color: colors.textSecondary }]}>
              An update (v{updateStatus.newVersion}) is available on the Play Store. Would you like to update now?
            </Text>

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.sheetButtonSecondary, { borderColor: colors.border }]}
                onPress={() => updateService.checkAndUpdate(false)} // Closes status checking
              >
                <Text style={[styles.sheetBtnSecText, { color: colors.textSecondary }]}>Not Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sheetButtonPrimary, { backgroundColor: colors.primary }]}
                onPress={handleUpdatePress}
              >
                <Text style={styles.sheetBtnPriText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // Fallback toast alert banner for network errors
  if (updateStatus.state === 'FAILED' && updateStatus.error) {
    return (
      <View style={[styles.toastContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={styles.toastIcon}>⚠️</Text>
        <Text style={[styles.toastText, { color: colors.text }]}>{updateStatus.error}</Text>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    paddingVertical: 20,
  },
  icon: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  versionBox: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
  },
  versionText: {
    fontSize: 14,
  },
  bold: {
    fontWeight: 'bold',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  actionContainer: {
    width: '100%',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  button: {
    width: '100%',
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Bottom Sheet modal style
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 10,
  },
  sheetIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  sheetDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  sheetButtonSecondary: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  sheetButtonPrimary: {
    flex: 1.5,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    elevation: 2,
  },
  sheetBtnSecText: {
    fontSize: 15,
    fontWeight: '600',
  },
  sheetBtnPriText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  // Toast error bar
  toastContainer: {
    position: 'absolute',
    bottom: 90, // Positioned above the bottom navigation bar
    left: 16,
    right: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 5,
    zIndex: 999,
  },
  toastIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  toastText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
