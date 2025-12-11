/**
 * Options page controller
 */

import { StorageManager } from "../lib/storage";
import { RandomizationEngine } from "../lib/randomization";
import type {
  Preset,
  PresetAnswer,
  ExtensionSettings,
  QuestionType,
  RandomizationConfig,
} from "../types/extension";

class OptionsController {
  private presets: Preset[] = [];
  private settings: ExtensionSettings | null = null;
  private currentPresetId: string | null = null;

  async init() {
    this.attachEventListeners();
    await this.loadAllData();
    this.renderAllTabs();
  }

  private attachEventListeners() {
    // Tab navigation
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        this.switchTab((e.target as HTMLElement).getAttribute("data-tab") || "");
      });
    });

    // Preset buttons
    document.getElementById("createPresetBtn")?.addEventListener("click", () => {
      this.openPresetModal();
    });

    // Settings
    document.getElementById("saveSettingsBtn")?.addEventListener("click", () => {
      this.saveSettings();
    });

    document.getElementById("resetSettingsBtn")?.addEventListener("click", () => {
      this.resetSettings();
    });

    // Activity log
    document.getElementById("clearLogsBtn")?.addEventListener("click", () => {
      this.clearActivityLog();
    });

    document.getElementById("exportLogsBtn")?.addEventListener("click", () => {
      this.exportActivityLog();
    });

    // Import/Export
    document.getElementById("exportAllBtn")?.addEventListener("click", () => {
      this.exportAllData();
    });

    document.getElementById("importBtn")?.addEventListener("click", () => {
      this.importData();
    });

    // Modal
    document.getElementById("savePresetBtn")?.addEventListener("click", () => {
      this.savePreset();
    });

    document.getElementById("cancelPresetBtn")?.addEventListener("click", () => {
      this.closePresetModal();
    });
  }

  private async loadAllData() {
    this.presets = await StorageManager.loadPresets();
    this.settings = await StorageManager.loadSettings();
  }

  private renderAllTabs() {
    this.renderPresetsTab();
    this.renderSettingsTab();
    this.renderActivityLogTab();
  }

  private renderPresetsTab() {
    const list = document.getElementById("presetsList");
    if (!list) return;

    if (this.presets.length === 0) {
      list.innerHTML =
        '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No presets created yet.</p></div>';
      return;
    }

    list.innerHTML = this.presets
      .map((preset) => {
        const updatedDate = new Date(preset.updatedAt).toLocaleString();
        return `
      <div class="preset-card">
        <div class="preset-card-header">
          <div>
            <div class="preset-card-title">${preset.name}</div>
            <div class="help-text">${preset.answers.length} answers • Updated ${updatedDate}</div>
            ${preset.description ? `<div class="help-text">${preset.description}</div>` : ""}
          </div>
          <div class="preset-card-actions">
            <button class="btn btn-secondary" data-preset-id="${preset.id}" data-action="edit">Edit</button>
            <button class="btn btn-danger" data-preset-id="${preset.id}" data-action="delete">Delete</button>
          </div>
        </div>
      </div>
    `;
      })
      .join("");

    // Attach listeners
    list.querySelectorAll("[data-action='edit']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = (e.target as HTMLElement).getAttribute("data-preset-id");
        if (id) this.editPreset(id);
      });
    });

    list.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = (e.target as HTMLElement).getAttribute("data-preset-id");
        if (id && confirm("Delete this preset?")) {
          this.deletePreset(id);
        }
      });
    });
  }

  private renderSettingsTab() {
    if (!this.settings) return;

    const requireConfirm = document.getElementById(
      "requireConfirm"
    ) as HTMLInputElement;
    const delayMin = document.getElementById("delayMin") as HTMLInputElement;
    const delayMax = document.getElementById("delayMax") as HTMLInputElement;
    const jitter = document.getElementById("jitter") as HTMLInputElement;
    const rateLimit = document.getElementById("rateLimit") as HTMLInputElement;
    const logLevel = document.getElementById("logLevel") as HTMLSelectElement;

    if (requireConfirm) requireConfirm.checked = this.settings.requireConfirmation;
    if (delayMin) delayMin.value = String(this.settings.defaultDelayMin);
    if (delayMax) delayMax.value = String(this.settings.defaultDelayMax);
    if (jitter) jitter.value = String(this.settings.defaultJitter);
    if (rateLimit) rateLimit.value = String(this.settings.globalRateLimit);
    if (logLevel) logLevel.value = this.settings.logLevel;
  }

  private async renderActivityLogTab() {
    const logs = await StorageManager.loadActivityLog();
    const container = document.getElementById("activityLog");

    if (!container) return;

    if (logs.length === 0) {
      container.innerHTML =
        '<div class="empty-state"><p>No activity logged yet.</p></div>';
      return;
    }

    const html = logs
      .slice(-100)
      .reverse()
      .map((log) => {
        const date = new Date(log.timestamp).toLocaleString();
        return `<div style="padding: 8px; border-bottom: 1px solid #ddd; font-size: 13px;">
        <strong>[${log.level.toUpperCase()}]</strong> ${date}<br/>
        ${log.message}
      </div>`;
      })
      .join("");

    container.innerHTML = html;
  }

  private switchTab(tabName: string) {
    // Update nav tabs
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.classList.remove("active");
    });
    document
      .querySelector(`[data-tab="${tabName}"]`)
      ?.classList.add("active");

    // Update content
    document.querySelectorAll(".content").forEach((content) => {
      content.classList.remove("active");
    });
    document.getElementById(tabName)?.classList.add("active");
  }

  private async saveSettings() {
    if (!this.settings) return;

    const requireConfirm = (
      document.getElementById("requireConfirm") as HTMLInputElement
    ).checked;
    const delayMin = parseInt(
      (document.getElementById("delayMin") as HTMLInputElement).value
    );
    const delayMax = parseInt(
      (document.getElementById("delayMax") as HTMLInputElement).value
    );
    const jitter = parseFloat(
      (document.getElementById("jitter") as HTMLInputElement).value
    );
    const rateLimit = parseInt(
      (document.getElementById("rateLimit") as HTMLInputElement).value
    );
    const logLevel = (
      document.getElementById("logLevel") as HTMLSelectElement
    ).value as "debug" | "info" | "warn" | "error";

    const updated: ExtensionSettings = {
      ...this.settings,
      requireConfirmation: requireConfirm,
      defaultDelayMin: delayMin,
      defaultDelayMax: delayMax,
      defaultJitter: jitter,
      globalRateLimit: rateLimit,
      logLevel,
    };

    await StorageManager.saveSettings(updated);
    this.settings = updated;

    this.showAlert("Settings saved successfully!", "success");
  }

  private async resetSettings() {
    if (confirm("Reset all settings to defaults?")) {
      await StorageManager.saveSettings({
        globalRateLimit: 1000,
        defaultDelayMin: 2000,
        defaultDelayMax: 5000,
        defaultJitter: 0.2,
        requireConfirmation: true,
        logLevel: "info",
        maxActivityLogEntries: 1000,
        customSelectorOverrides: {},
      });

      await this.loadAllData();
      this.renderSettingsTab();
      this.showAlert("Settings reset to defaults", "success");
    }
  }

  private async clearActivityLog() {
    if (confirm("Clear all activity logs?")) {
      await StorageManager.clearActivityLog();
      await this.renderActivityLogTab();
      this.showAlert("Activity log cleared", "success");
    }
  }

  private async exportActivityLog() {
    const logs = await StorageManager.loadActivityLog();
    const data = JSON.stringify(logs, null, 2);
    this.downloadJSON(data, "activity-log.json");
  }

  private async exportAllData() {
    const data = await StorageManager.exportData();
    const json = JSON.stringify(data, null, 2);
    this.downloadJSON(json, "gformtasker-backup.json");
    this.showAlert("Data exported successfully", "success");
  }

  private async importData() {
    const fileInput = document.getElementById("importFile") as HTMLInputElement;
    const file = fileInput?.files?.[0];

    if (!file) {
      this.showAlert("Please select a file to import", "error");
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const result = await StorageManager.importData(data);

      if (result.errors.length === 0) {
        this.showAlert(
          `Successfully imported ${result.imported} items`,
          "success"
        );
        await this.loadAllData();
        this.renderAllTabs();
      } else {
        this.showAlert(
          `Import completed with errors: ${result.errors.join(", ")}`,
          "error"
        );
      }
    } catch (error) {
      this.showAlert("Failed to import file: " + String(error), "error");
    }
  }

  private openPresetModal() {
    this.currentPresetId = null;
    const modal = document.getElementById("presetModal");
    const nameInput = document.getElementById("presetName") as HTMLInputElement;
    const descInput = document.getElementById(
      "presetDescription"
    ) as HTMLTextAreaElement;
    const answersList = document.getElementById("answersList");

    if (nameInput) nameInput.value = "";
    if (descInput) descInput.value = "";
    if (answersList) answersList.innerHTML = "";

    modal?.classList.add("active");
  }

  private closePresetModal() {
    document.getElementById("presetModal")?.classList.remove("active");
  }

  private editPreset(presetId: string) {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) return;

    this.currentPresetId = presetId;

    const modal = document.getElementById("presetModal");
    const nameInput = document.getElementById("presetName") as HTMLInputElement;
    const descInput = document.getElementById(
      "presetDescription"
    ) as HTMLTextAreaElement;

    if (nameInput) nameInput.value = preset.name;
    if (descInput) descInput.value = preset.description || "";

    modal?.classList.add("active");
  }

  private async deletePreset(presetId: string) {
    await StorageManager.deletePreset(presetId);
    await this.loadAllData();
    this.renderPresetsTab();
    this.showAlert("Preset deleted", "success");
  }

  private async savePreset() {
    const nameInput = document.getElementById("presetName") as HTMLInputElement;
    const descInput = document.getElementById(
      "presetDescription"
    ) as HTMLTextAreaElement;

    const name = nameInput?.value?.trim();
    const description = descInput?.value?.trim();

    if (!name) {
      this.showAlert("Preset name is required", "error");
      return;
    }

    const preset: Preset = {
      id: this.currentPresetId || `preset-${Date.now()}`,
      name,
      description,
      createdAt:
        this.presets.find((p) => p.id === this.currentPresetId)?.createdAt ||
        Date.now(),
      updatedAt: Date.now(),
      answers: [],
      questionMappings: [],
    };

    await StorageManager.savePreset(preset);
    await this.loadAllData();
    this.renderPresetsTab();
    this.closePresetModal();
    this.showAlert(
      this.currentPresetId ? "Preset updated" : "Preset created",
      "success"
    );
  }

  private showAlert(message: string, type: "success" | "error" | "info") {
    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;

    const container = document.querySelector(".content.active");
    if (container) {
      container.insertAdjacentElement("afterbegin", alertDiv);

      setTimeout(() => {
        alertDiv.remove();
      }, 3000);
    }
  }

  private downloadJSON(content: string, filename: string) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  const controller = new OptionsController();
  controller.init();
});
