/**
 * Service worker for background operations
 * Handles:
 * - Preset management (CRUD)
 * - Submission runs and progress tracking
 * - Settings management
 * - Activity logging
 */

import { StorageManager } from "../lib/storage";
import { RunEngine } from "../lib/run-engine";
import type {
  Preset,
  SubmissionConfig,
  SubmissionProgress,
  BackgroundServiceMessage,
  ActivityLogEntry,
} from "../types/extension";

class BackgroundService {
  private currentProgress: SubmissionProgress | null = null;

  constructor() {
    this.initMessageListener();
    this.initAlarmListeners();
  }

  private initMessageListener() {
    chrome.runtime.onMessage.addListener(
      (
        request: BackgroundServiceMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void
      ) => {
      console.log("Service worker received:", request.type);

      if (request.type === "create_preset") {
        this.createPreset(request.payload).then(sendResponse);
      } else if (request.type === "update_preset") {
        this.updatePreset(request.payload).then(sendResponse);
      } else if (request.type === "delete_preset") {
        this.deletePreset(request.payload).then(sendResponse);
      } else if (request.type === "get_presets") {
        this.getPresets().then(sendResponse);
      } else if (request.type === "start_submission") {
        this.startSubmission(request.payload).then(sendResponse);
      } else if (request.type === "stop_submission") {
        this.stopSubmission();
        sendResponse({ success: true });
      } else if (request.type === "get_progress") {
        sendResponse(this.currentProgress);
      } else if (request.type === "log_activity") {
        this.logActivity(request.payload).then(sendResponse);
      }

      return true; // Keep channel open for async responses
    });
  }

  private initAlarmListeners() {
    chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
      if (alarm.name === "submission_check") {
        this.broadcastProgress();
      }
    });
  }

  private async createPreset(preset: Preset) {
    try {
      await StorageManager.savePreset(preset);
      await this.logActivity({
        level: "info",
        message: `Created preset: ${preset.name}`,
      });
      return { success: true };
    } catch (error) {
      console.error("Failed to create preset:", error);
      return { success: false, error: String(error) };
    }
  }

  private async updatePreset(preset: Preset) {
    try {
      await StorageManager.savePreset(preset);
      await this.logActivity({
        level: "info",
        message: `Updated preset: ${preset.name}`,
      });
      return { success: true };
    } catch (error) {
      console.error("Failed to update preset:", error);
      return { success: false, error: String(error) };
    }
  }

  private async deletePreset(presetId: string) {
    try {
      await StorageManager.deletePreset(presetId);
      await this.logActivity({
        level: "info",
        message: `Deleted preset: ${presetId}`,
      });
      return { success: true };
    } catch (error) {
      console.error("Failed to delete preset:", error);
      return { success: false, error: String(error) };
    }
  }

  private async getPresets() {
    try {
      const presets = await StorageManager.loadPresets();
      return { success: true, presets };
    } catch (error) {
      return { success: false, error: String(error), presets: [] };
    }
  }

  private async startSubmission(config: {
    presetId: string;
    count: number;
  }) {
    try {
      const preset = await StorageManager.getPreset(config.presetId);
      if (!preset) {
        return { success: false, error: "Preset not found" };
      }

      const settings = await StorageManager.loadSettings();

      // Check for confirmation requirement
      if (settings.requireConfirmation) {
        const confirmed = await this.requestUserConfirmation(
          `Submit form ${config.count} times using "${preset.name}"?`
        );
        if (!confirmed) {
          return { success: false, error: "User cancelled" };
        }
      }

      const submissionConfig: SubmissionConfig = {
        presetId: preset.id,
        count: config.count,
        delayMin: settings.defaultDelayMin,
        delayMax: settings.defaultDelayMax,
        jitter: settings.defaultJitter,
        rateLimit: settings.globalRateLimit,
        stopOnError: false,
        confirmBeforeStart: settings.requireConfirmation,
      };

      // Start run
      const runPromise = RunEngine.startRun(
        preset,
        submissionConfig,
        (progress) => {
          this.currentProgress = progress;
          this.broadcastProgress();
        }
      );

      runPromise
        .then(async (result) => {
          await this.logActivity({
            level: "info",
            message: `Submission run completed: ${result.completedSubmissions}/${result.totalSubmissions} successful`,
          });
        })
        .catch(async (error) => {
          await this.logActivity({
            level: "error",
            message: `Submission run failed: ${error.message}`,
          });
        });

      return { success: true };
    } catch (error) {
      await this.logActivity({
        level: "error",
        message: `Failed to start submission: ${error}`,
      });
      return { success: false, error: String(error) };
    }
  }

  private async stopSubmission() {
    RunEngine.stopRun();
    await this.logActivity({
      level: "info",
      message: "Submission run stopped by user",
    });
  }

  private async logActivity(entry: Omit<ActivityLogEntry, "timestamp">) {
    const logEntry: ActivityLogEntry = {
      ...entry,
      timestamp: Date.now(),
    };

    await StorageManager.addActivityLog(logEntry);

    if (entry.level === "error" || entry.level === "warn") {
      console.warn(`[${entry.level}] ${entry.message}`);
    } else {
      console.log(`[${entry.level}] ${entry.message}`);
    }
  }

  private broadcastProgress() {
    if (!this.currentProgress) return;

    // Send to popup
    chrome.runtime.sendMessage(
      {
        type: "submission_progress",
        payload: this.currentProgress,
      },
      () => {
        if (chrome.runtime.lastError) {
          console.debug("Popup not open, progress update skipped");
        }
      }
    );
  }

  private async requestUserConfirmation(message: string): Promise<boolean> {
    // This would ideally use a notification or dialog
    // For now, we'll assume confirmation via popup interaction
    return true;
  }
}

// Initialize service worker
console.log("🔧 GFormTasker-Clone service worker initialized");
new BackgroundService();

// Export for testing
export { BackgroundService };
