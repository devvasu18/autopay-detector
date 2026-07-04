import { PermissionsAndroid, Platform, NativeModules, Linking } from 'react-native';

const { FinanceCoreModule } = NativeModules;

export const smsService = {
  checkPermission: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    const readGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    const receiveGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
    return readGranted && receiveGranted;
  },

  requestPermission: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      ]);
      return (
        granted[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED
      );
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

  isBatteryOptimizationIgnored: async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !FinanceCoreModule || !FinanceCoreModule.isBatteryOptimizationIgnored) {
      return true;
    }
    return FinanceCoreModule.isBatteryOptimizationIgnored();
  },

  requestIgnoreBatteryOptimizations: async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !FinanceCoreModule || !FinanceCoreModule.requestIgnoreBatteryOptimizations) {
      return false;
    }
    return FinanceCoreModule.requestIgnoreBatteryOptimizations();
  },
};
