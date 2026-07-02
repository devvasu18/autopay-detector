import { PermissionsAndroid, Platform, NativeModules, Linking } from 'react-native';

const { FinanceCoreModule } = NativeModules;

export const smsService = {
  checkPermission: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  },

  requestPermission: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        {
          title: 'SMS Permission Required',
          message:
            'AutoPay Tracker analyzes only financial SMS messages on your device to help you manage your subscriptions, recurring bills, and EMIs. We never upload your data to any cloud server.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn(err);
      return false;
    }
  },

  openSettings: async (): Promise<void> => {
    try {
      await Linking.openSettings();
    } catch (err) {
      console.warn('Could not open settings', err);
    }
  },

  sync: async (): Promise<{ processedCount: number; parsedCount: number }> => {
    const hasPermission = await smsService.checkPermission();
    if (!hasPermission) {
      throw new Error('Permission denied');
    }

    if (!FinanceCoreModule || !FinanceCoreModule.syncSMS) {
      throw new Error('FinanceCoreModule native module is not available');
    }

    return FinanceCoreModule.syncSMS();
  },

  getInstalledApps: async (): Promise<{ packageName: string; appName: string }[]> => {
    if (!FinanceCoreModule || !FinanceCoreModule.getInstalledFinancialApps) {
      return [];
    }
    return FinanceCoreModule.getInstalledFinancialApps();
  },

  openApp: async (packageName: string): Promise<boolean> => {
    if (!FinanceCoreModule || !FinanceCoreModule.openFinancialApp) {
      return false;
    }
    return FinanceCoreModule.openFinancialApp(packageName);
  },
};
