/**
 * Storage management for presets and settings
 * Handles chrome.storage.sync with fallback to chrome.storage.local
 */

import type {
  Preset,
  ExtensionSettings,
  ActivityLogEntry,
} from "../types/extension";

const STORAGE_KEYS = {
  PRESETS: "gformtasker_presets",
  SETTINGS: "gformtasker_settings",
  ACTIVITY_LOG: "gformtasker_activity_log",
  SUBMISSION_PROGRESS: "gformtasker_submission_progress",
  LAST_SYNC: "gformtasker_last_sync",
};

const DEFAULT_SETTINGS: ExtensionSettings = {
  globalRateLimit: 1000, // ms between submissions
  defaultDelayMin: 2000,
  defaultDelayMax: 5000,
  defaultJitter: 0.2,
  requireConfirmation: true,
  logLevel: "info",
  maxActivityLogEntries: 1000,
  customSelectorOverrides: {},
};

export class StorageManager {
  private static syncFailed = false;

  /**
   * Save presets to storage
   */
  static async savePresets(presets: Preset[]): Promise<void> {
    try {
      await chrome.storage.sync.set({
        [STORAGE_KEYS.PRESETS]: presets,
        [STORAGE_KEYS.LAST_SYNC]: Date.now(),
      });
      this.syncFailed = false;
    } catch (error) {
      console.warn("Sync storage failed, falling back to local:", error);
      this.syncFailed = true;
      await chrome.storage.local.set({
        [STORAGE_KEYS.PRESETS]: presets,
        [STORAGE_KEYS.LAST_SYNC]: Date.now(),
      });
    }
  }

  /**
   * Load presets from storage
   */
  static async loadPresets(): Promise<Preset[]> {
    try {
      const data = await chrome.storage.sync.get(STORAGE_KEYS.PRESETS);
      if (data[STORAGE_KEYS.PRESETS]) {
        return data[STORAGE_KEYS.PRESETS] as Preset[];
      }
    } catch (error) {
      console.warn("Failed to load from sync storage:", error);
    }

    // Fallback to local storage
    const data = await chrome.storage.local.get(STORAGE_KEYS.PRESETS);
    return (data[STORAGE_KEYS.PRESETS] as Preset[]) || [];
  }

  /**
   * Save individual preset
   */
  static async savePreset(preset: Preset): Promise<void> {
    const presets = await this.loadPresets();
    const index = presets.findIndex((p) => p.id === preset.id);

    if (index >= 0) {
      presets[index] = { ...preset, updatedAt: Date.now() };
    } else {
      presets.push({ ...preset, createdAt: Date.now(), updatedAt: Date.now() });
    }

    await this.savePresets(presets);
  }

  /**
   * Delete preset
   */
  static async deletePreset(presetId: string): Promise<void> {
    const presets = await this.loadPresets();
    const filtered = presets.filter((p) => p.id !== presetId);
    await this.savePresets(filtered);
  }

  /**
   * Get preset by ID
   */
  static async getPreset(presetId: string): Promise<Preset | null> {
    const presets = await this.loadPresets();
    return presets.find((p) => p.id === presetId) || null;
  }

  /**
   * Save settings
   */
  static async saveSettings(settings: ExtensionSettings): Promise<void> {
    try {
      await chrome.storage.sync.set({
        [STORAGE_KEYS.SETTINGS]: settings,
      });
    } catch (error) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.SETTINGS]: settings,
      });
    }
  }

  /**
   * Load settings
   */
  static async loadSettings(): Promise<ExtensionSettings> {
    try {
      const data = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
      if (data[STORAGE_KEYS.SETTINGS]) {
        return { ...DEFAULT_SETTINGS, ...data[STORAGE_KEYS.SETTINGS] };
      }
    } catch (error) {
      console.warn("Failed to load settings from sync:", error);
    }

    const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    if (data[STORAGE_KEYS.SETTINGS]) {
      return { ...DEFAULT_SETTINGS, ...data[STORAGE_KEYS.SETTINGS] };
    }

    // Save defaults
    await this.saveSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }

  /**
   * Add activity log entry
   */
  static async addActivityLog(entry: ActivityLogEntry): Promise<void> {
    const logs = await this.loadActivityLog();
    const settings = await this.loadSettings();

    logs.push(entry);

    // Keep only recent entries
    const trimmed = logs.slice(-settings.maxActivityLogEntries);

    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.ACTIVITY_LOG]: trimmed,
      });
    } catch (error) {
      console.error("Failed to save activity log:", error);
    }
  }

  /**
   * Load activity log
   */
  static async loadActivityLog(): Promise<ActivityLogEntry[]> {
    const data = await chrome.storage.local.get(STORAGE_KEYS.ACTIVITY_LOG);
    return (data[STORAGE_KEYS.ACTIVITY_LOG] as ActivityLogEntry[]) || [];
  }

  /**
   * Clear activity log
   */
  static async clearActivityLog(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEYS.ACTIVITY_LOG);
  }

  /**
   * Export all data as JSON
   */
  static async exportData(): Promise<{
    presets: Preset[];
    settings: ExtensionSettings;
    activityLog: ActivityLogEntry[];
    exportedAt: number;
  }> {
    const [presets, settings, activityLog] = await Promise.all([
      this.loadPresets(),
      this.loadSettings(),
      this.loadActivityLog(),
    ]);

    return {
      presets,
      settings,
      activityLog,
      exportedAt: Date.now(),
    };
  }

  /**
   * Import data from JSON
   */
  static async importData(data: {
    presets?: Preset[];
    settings?: ExtensionSettings;
    activityLog?: ActivityLogEntry[];
  }): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;

    try {
      if (data.presets && Array.isArray(data.presets)) {
        await this.savePresets(data.presets);
        imported += data.presets.length;
      }

      if (data.settings) {
        await this.saveSettings(data.settings);
        imported++;
      }

      if (data.activityLog && Array.isArray(data.activityLog)) {
        // Append to existing logs
        const existing = await this.loadActivityLog();
        const combined = [...existing, ...data.activityLog];
        const settings = await this.loadSettings();
        const trimmed = combined.slice(-settings.maxActivityLogEntries);
        await chrome.storage.local.set({
          [STORAGE_KEYS.ACTIVITY_LOG]: trimmed,
        });
      }
    } catch (error) {
      errors.push(String(error));
    }

    return { imported, errors };
  }

  /**
   * Check if sync storage is available and working
   */
  static isSyncAvailable(): boolean {
    return !this.syncFailed && !!chrome.storage.sync;
  }

  /**
   * Get storage stats for debugging
   */
  static async getStorageStats(): Promise<{
    presetsCount: number;
    activityLogCount: number;
    lastSync: number | null;
  }> {
    const presets = await this.loadPresets();
    const logs = await this.loadActivityLog();
    const data = await chrome.storage.local.get(STORAGE_KEYS.LAST_SYNC);

    return {
      presetsCount: presets.length,
      activityLogCount: logs.length,
      lastSync: (data[STORAGE_KEYS.LAST_SYNC] as number) || null,
    };
  }
}
