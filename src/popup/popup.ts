/**
 * Popup UI controller
 */

import { StorageManager } from "../lib/storage";
import type { Preset, SubmissionProgress } from "../types/extension";

class PopupController {
  private presets: Preset[] = [];
  private currentProgress: SubmissionProgress | null = null;

  async init() {
    this.attachEventListeners();
    await this.loadPresets();
    this.listenForProgress();
  }

  private attachEventListeners() {
    const recordBtn = document.getElementById("recordBtn");
    const optionsBtn = document.getElementById("optionsBtn");
    const stopBtn = document.getElementById("stopBtn");
    const cancelBtn = document.getElementById("cancelBtn");

    recordBtn?.addEventListener("click", () => this.startRecording());
    optionsBtn?.addEventListener("click", () => this.openOptions());
    stopBtn?.addEventListener("click", () => this.stopSubmission());
    cancelBtn?.addEventListener("click", () => this.cancelSubmission());
  }

  private async loadPresets() {
    try {
      this.presets = await StorageManager.loadPresets();
      this.renderPresets();
    } catch (error) {
      console.error("Failed to load presets:", error);
    }
  }

  private renderPresets() {
    const list = document.getElementById("presetList");
    if (!list) return;

    if (this.presets.length === 0) {
      list.innerHTML =
        '<li class="empty-state"><div class="empty-state-icon">📋</div><p>No presets yet. Create one in options.</p></li>';
      return;
    }

    list.innerHTML = this.presets
      .map(
        (preset) => `
      <li class="preset-item">
        <div class="preset-name">${preset.name}</div>
        <div class="preset-actions">
          <button class="btn btn-primary" data-preset-id="${preset.id}" data-action="run">Run</button>
          <button class="btn btn-secondary" data-preset-id="${preset.id}" data-action="edit">Edit</button>
        </div>
      </li>
    `
      )
      .join("");

    // Attach event listeners to preset buttons
    list.querySelectorAll("[data-action='run']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const presetId = (e.target as HTMLElement).getAttribute(
          "data-preset-id"
        );
        if (presetId) this.runPreset(presetId);
      });
    });

    list.querySelectorAll("[data-action='edit']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const presetId = (e.target as HTMLElement).getAttribute(
          "data-preset-id"
        );
        if (presetId) this.editPreset(presetId);
      });
    });
  }

  private async runPreset(presetId: string) {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) return;

    const count = prompt("How many submissions?", "1");
    if (!count || isNaN(parseInt(count))) return;

    // Send message to background service worker
    chrome.runtime.sendMessage(
      {
        type: "start_submission",
        payload: {
          presetId,
          count: parseInt(count),
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Failed to start submission:", chrome.runtime.lastError);
          alert(
            "Failed to start submission. Make sure you are on a Google Form."
          );
        }
      }
    );
  }

  private editPreset(presetId: string) {
    chrome.runtime.openOptionsPage();
  }

  private startRecording() {
    // Send message to content script to start recording
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0].id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            type: "start_recording",
          },
          (response) => {
            if (chrome.runtime.lastError) {
              alert(
                "Could not start recording. Make sure you are on a Google Form."
              );
            } else {
              alert("Recording started. Fill the form once, then stop recording.");
            }
          }
        );
      }
    });
  }

  private openOptions() {
    chrome.runtime.openOptionsPage();
  }

  private stopSubmission() {
    chrome.runtime.sendMessage(
      {
        type: "stop_submission",
      },
      () => {
        console.log("Stop signal sent");
      }
    );
  }

  private cancelSubmission() {
    if (confirm("Cancel all remaining submissions?")) {
      this.stopSubmission();
    }
  }

  private listenForProgress() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === "submission_progress") {
        this.currentProgress = request.payload;
        this.updateProgressUI();
      }
      sendResponse({ received: true });
    });
  }

  private updateProgressUI() {
    if (!this.currentProgress) return;

    const progressSection = document.getElementById("progressSection");
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    const estimatedTime = document.getElementById("estimatedTime");
    const logsContainer = document.getElementById("logsContainer");

    if (!progressSection) return;

    // Show progress section
    progressSection.style.display = this.currentProgress.isRunning
      ? "block"
      : "none";

    if (progressBar) {
      const percent =
        (this.currentProgress.completedSubmissions /
          this.currentProgress.totalSubmissions) *
        100;
      progressBar.style.width = percent + "%";
    }

    if (progressText) {
      progressText.textContent = `${this.currentProgress.completedSubmissions}/${this.currentProgress.totalSubmissions} submissions`;
    }

    if (
      estimatedTime &&
      this.currentProgress.estimatedTimeRemaining
    ) {
      const minutes = Math.ceil(
        this.currentProgress.estimatedTimeRemaining / 60000
      );
      estimatedTime.textContent = `~${minutes}m remaining`;
    }

    // Update logs
    this.updateLogs();
  }

  private async updateLogs() {
    try {
      const logs = await StorageManager.loadActivityLog();
      const logsContainer = document.getElementById("logs");

      if (!logsContainer) return;

      const recentLogs = logs.slice(-20);
      logsContainer.innerHTML = recentLogs
        .map(
          (log) => `
        <div class="log-entry log-${log.level}">
          [${log.level.toUpperCase()}] ${log.message}
        </div>
      `
        )
        .join("");

      logsContainer.scrollTop = logsContainer.scrollHeight;
    } catch (error) {
      console.error("Failed to update logs:", error);
    }
  }
}

// Initialize on popup load
document.addEventListener("DOMContentLoaded", () => {
  const controller = new PopupController();
  controller.init();
});
