import { NativeModules, Platform, Linking, DeviceEventEmitter } from 'react-native';
import SpInAppUpdates, {
  IAUUpdateKind,
  IAUInstallStatus,
  StartUpdateOptions,
  NeedsUpdateResponse,
} from 'sp-react-native-in-app-updates';
import { compareVersions } from '../utils/versionHelper';
import { db } from './db';

const { FinanceCoreModule } = NativeModules;

export interface RemoteVersionInfo {
  latestVersion: string;
  minimumVersion: string;
  forceUpdate: boolean;
  playStoreUrl: string;
}

export type UpdateState =
  | 'IDLE'
  | 'CHECKING'
  | 'UPDATE_AVAILABLE'
  | 'DOWNLOADING'
  | 'DOWNLOADED'
  | 'INSTALLING'
  | 'INSTALLED'
  | 'FAILED';

export interface UpdateStatus {
  state: UpdateState;
  type: 'IMMEDIATE' | 'FLEXIBLE' | 'FALLBACK_IMMEDIATE' | 'FALLBACK_FLEXIBLE' | null;
  progress: number; // 0 to 100
  installedVersion: string;
  newVersion: string;
  error?: string;
  playStoreUrl?: string;
}

class UpdateService {
  private inAppUpdates: SpInAppUpdates | null = null;
  private currentStatus: UpdateStatus = {
    state: 'IDLE',
    type: null,
    progress: 0,
    installedVersion: '0.0.0',
    newVersion: '0.0.0',
  };
  private statusListeners: ((status: UpdateStatus) => void)[] = [];
  private checkIntervalMs = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
  private isChecking = false;

  constructor() {
    if (Platform.OS === 'android') {
      // isDebug = false for production-ready app
      this.inAppUpdates = new SpInAppUpdates(false);
    }
  }

  // Get current app version name/code from native module
  public async getAppVersionInfo(): Promise<{ versionName: string; versionCode: number; packageName: string }> {
    if (FinanceCoreModule && FinanceCoreModule.getAppVersion) {
      return FinanceCoreModule.getAppVersion();
    }
    // Fallback in case of mock/debugging environments
    return {
      versionName: '1.0.0',
      versionCode: 1,
      packageName: 'com.falconcoders.autopay',
    };
  }

  // Subscribe to status changes
  public addListener(listener: (status: UpdateStatus) => void): () => void {
    this.statusListeners.push(listener);
    // Emit current status immediately
    listener({ ...this.currentStatus });
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener);
    };
  }

  private updateStatus(newStatus: Partial<UpdateStatus>) {
    this.currentStatus = { ...this.currentStatus, ...newStatus };
    this.statusListeners.forEach(listener => {
      try {
        listener({ ...this.currentStatus });
      } catch (err) {
        console.error('Error executing update status listener:', err);
      }
    });
    // Emit device event for system-wide alerts if needed
    DeviceEventEmitter.emit('onAppUpdateStatusChange', this.currentStatus);
  }

  // Track update analytics
  private trackAnalytics(event: string, metadata: any = {}) {
    console.log(`[ANALYTICS] [UPDATE_SYSTEM] Event: ${event}`, {
      timestamp: new Date().toISOString(),
      installedVersion: this.currentStatus.installedVersion,
      newVersion: this.currentStatus.newVersion,
      updateType: this.currentStatus.type,
      ...metadata,
    });
    // Hook standard analytics emitters
    DeviceEventEmitter.emit('analytics_event', {
      category: 'InAppUpdate',
      action: event,
      label: this.currentStatus.newVersion,
      value: this.currentStatus.installedVersion,
      ...metadata,
    });
  }

  // Primary entry method
  public async checkAndUpdate(forceCheck = false): Promise<void> {
    if (Platform.OS !== 'android') return;
    if (this.isChecking) return;

    this.isChecking = true;
    this.updateStatus({ state: 'CHECKING' });

    try {
      const appInfo = await this.getAppVersionInfo();
      this.updateStatus({ installedVersion: appInfo.versionName });

      // Caching logic: check if 4 hours have passed
      const lastCheckStr = await db.getSetting('last_update_check_time', '0');
      const lastCheck = parseInt(lastCheckStr, 10);
      const now = Date.now();

      if (!forceCheck && (now - lastCheck < this.checkIntervalMs)) {
        console.log('[UpdateService] Update check throttled (checked less than 4 hours ago).');
        this.updateStatus({ state: 'IDLE' });
        this.isChecking = false;
        return;
      }

      // Save last check timestamp
      await db.setSetting('last_update_check_time', now.toString());

      console.log('[UpdateService] Checking for updates via Play Core...');
      await this.performPlayCoreCheck(appInfo);

    } catch (err: any) {
      console.warn('[UpdateService] Play Core check failed or returned error, attempting Remote Version API Fallback...', err);
      await this.performRemoteVersionFallback();
    } finally {
      this.isChecking = false;
    }
  }

  // Phase 1: Play Core update check
  private async performPlayCoreCheck(appInfo: { versionName: string; versionCode: number; packageName: string }) {
    if (!this.inAppUpdates) throw new Error('SpInAppUpdates is not initialized');

    const result: NeedsUpdateResponse = await this.inAppUpdates.checkNeedsUpdate();

    if (result.shouldUpdate) {
      const newVersion = result.storeVersion || 'unknown';
      this.updateStatus({ newVersion });

      this.trackAnalytics('Update available', { source: 'PlayCore', newVersion });

      // Determine update type (Immediate vs Flexible)
      // Custom heuristic: if store version is higher by a major release or specified by backend, force it.
      // By default, Google Play core allows us to specify our own logic or rely on checkNeedsUpdate recommendations.
      const isCritical = (result.other as any)?.updatePriority >= 4 || this.checkIfMajorUpdate(appInfo.versionName, newVersion);

      if (isCritical) {
        this.updateStatus({ state: 'UPDATE_AVAILABLE', type: 'IMMEDIATE' });
        this.startPlayCoreUpdate(IAUUpdateKind.IMMEDIATE);
      } else {
        this.updateStatus({ state: 'UPDATE_AVAILABLE', type: 'FLEXIBLE' });
        this.startPlayCoreUpdate(IAUUpdateKind.FLEXIBLE);
      }
    } else {
      console.log('[UpdateService] App is up to date according to Play Core.');
      this.updateStatus({ state: 'IDLE' });
    }
  }

  // Phase 2: Remote version API fallback
  private async performRemoteVersionFallback() {
    try {
      console.log('[UpdateService] Launching Remote Version API Fallback...');
      const appInfo = await this.getAppVersionInfo();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      // Configurable Endpoint (fallback to mock endpoints or custom API)
      const response = await fetch('https://our-api.com/app/version', {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal, 
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Remote API response status: ${response.status}`);
      }

      const data: RemoteVersionInfo = await response.json();
      
      // Validate response structure
      if (!data || typeof data.latestVersion !== 'string' || typeof data.forceUpdate !== 'boolean') {
        throw new Error('Malformed Remote Version JSON response');
      }

      this.updateStatus({ newVersion: data.latestVersion });

      // Compare semantic versions
      const isUpdateAvailable = compareVersions(data.latestVersion, appInfo.versionName) === 1;

      if (isUpdateAvailable) {
        this.trackAnalytics('Update available', { source: 'RemoteAPI', newVersion: data.latestVersion });

        const playStoreUrl = data.playStoreUrl || `market://details?id=${appInfo.packageName}`;
        
        if (data.forceUpdate) {
          this.updateStatus({
            state: 'UPDATE_AVAILABLE',
            type: 'FALLBACK_IMMEDIATE',
            playStoreUrl,
          });
        } else {
          this.updateStatus({
            state: 'UPDATE_AVAILABLE',
            type: 'FALLBACK_FLEXIBLE',
            playStoreUrl,
          });
        }
      } else {
        console.log('[UpdateService] App is up to date according to Remote API.');
        this.updateStatus({ state: 'IDLE' });
      }
    } catch (err: any) {
      console.error('[UpdateService] Remote Version check failed:', err.message);
      this.trackAnalytics('Update check failed', { error: err.message });
      
      // Phase 3: Final Fallback - transition state to IDLE/FAILED but don't crash
      this.updateStatus({
        state: 'FAILED',
        error: 'Network connectivity or update server unavailable. If you notice issues, please check Google Play Store directly.',
      });
      
      // Reset status to IDLE after showing error briefly
      setTimeout(() => {
        if (this.currentStatus.state === 'FAILED') {
          this.updateStatus({ state: 'IDLE', error: undefined });
        }
      }, 5000);
    }
  }

  // Check if version difference constitutes a major update (e.g. 1.0.0 -> 2.0.0)
  private checkIfMajorUpdate(currentVersion: string, storeVersion: string): boolean {
    try {
      const currMajor = parseInt(currentVersion.split('.')[0], 10);
      const storeMajor = parseInt(storeVersion.split('.')[0], 10);
      return !isNaN(currMajor) && !isNaN(storeMajor) && storeMajor > currMajor;
    } catch {
      return false;
    }
  }

  // Trigger Play Core Update Manager
  private startPlayCoreUpdate(updateType: IAUUpdateKind) {
    if (!this.inAppUpdates) return;

    this.trackAnalytics('Update started', { updateType: updateType === IAUUpdateKind.IMMEDIATE ? 'IMMEDIATE' : 'FLEXIBLE' });

    const options: StartUpdateOptions = {
      updateType,
    };

    // Attach install status listener for Flexible update
    if (updateType === IAUUpdateKind.FLEXIBLE) {
      this.updateStatus({ state: 'DOWNLOADING', progress: 0 });
      this.inAppUpdates.addStatusUpdateListener(this.handlePlayCoreInstallStatus);
    }

    this.inAppUpdates.startUpdate(options)
      .then((result) => {
        console.log('[UpdateService] Play Core flow launched successfully:', result);
        if (updateType === IAUUpdateKind.IMMEDIATE) {
          this.trackAnalytics('Immediate update completed');
          this.updateStatus({ state: 'INSTALLED' });
        }
      })
      .catch((err) => {
        console.error('[UpdateService] Play Core flow launching failed:', err);
        this.trackAnalytics('Update failed', { error: err.message });
        
        // Remove listener on failure
        if (updateType === IAUUpdateKind.FLEXIBLE) {
          this.removePlayCoreListener();
        }
        
        // Fallback: Redirection via Linking
        this.triggerRedirectionFallback();
      });
  }

  // Clean up Play Core listener
  private removePlayCoreListener() {
    if (this.inAppUpdates) {
      this.inAppUpdates.removeStatusUpdateListener(this.handlePlayCoreInstallStatus);
    }
  }

  // Handle Play Core install state changes
  private handlePlayCoreInstallStatus = (installStatus: any) => {
    if (!installStatus) return;

    const { status, bytesDownloaded, totalBytesToDownload } = installStatus;
    const progress = totalBytesToDownload > 0 
      ? Math.round((bytesDownloaded / totalBytesToDownload) * 100) 
      : 0;

    console.log(`[UpdateService] Install status change: ${status}, Progress: ${progress}%`);

    switch (status) {
      case IAUInstallStatus.PENDING:
      case IAUInstallStatus.DOWNLOADING:
        this.updateStatus({ state: 'DOWNLOADING', progress });
        break;
      case IAUInstallStatus.DOWNLOADED:
        this.updateStatus({ state: 'DOWNLOADED', progress: 100 });
        this.trackAnalytics('Update completed');
        this.removePlayCoreListener();
        break;
      case IAUInstallStatus.INSTALLING:
        this.updateStatus({ state: 'INSTALLING' });
        break;
      case IAUInstallStatus.INSTALLED:
        this.updateStatus({ state: 'INSTALLED' });
        this.trackAnalytics('Flexible update installed');
        this.removePlayCoreListener();
        break;
      case IAUInstallStatus.CANCELED:
        this.updateStatus({ state: 'IDLE' });
        this.trackAnalytics('Update cancelled');
        this.removePlayCoreListener();
        break;
      case IAUInstallStatus.FAILED:
        this.updateStatus({ state: 'FAILED', error: 'Download failed. Please update from Play Store.' });
        this.trackAnalytics('Update failed', { error: 'Play Core download failed' });
        this.removePlayCoreListener();
        break;
      default:
        break;
    }
  };

  // Installs the downloaded flexible update (triggers app restart)
  public installDownloadedUpdate() {
    if (this.inAppUpdates) {
      this.trackAnalytics('Flexible update install triggered');
      this.inAppUpdates.installUpdate();
    }
  }

  // Phase 3: Final Fallback redirection
  public async triggerRedirectionFallback() {
    const appInfo = await this.getAppVersionInfo();
    const playStoreUrl = this.currentStatus.playStoreUrl || `market://details?id=${appInfo.packageName}`;
    const fallbackUrl = `https://play.google.com/store/apps/details?id=${appInfo.packageName}`;

    this.trackAnalytics('Redirecting to Play Store', { playStoreUrl });

    try {
      const supported = await Linking.canOpenURL(playStoreUrl);
      if (supported) {
        await Linking.openURL(playStoreUrl);
      } else {
        await Linking.openURL(fallbackUrl);
      }
    } catch (err: any) {
      console.error('[UpdateService] Failed to open Play Store link:', err);
      this.updateStatus({
        state: 'FAILED',
        error: 'Unable to open Google Play Store. Please open the Play Store app manually and check for updates.',
      });
    }
  }
}

export const updateService = new UpdateService();
export default updateService;
