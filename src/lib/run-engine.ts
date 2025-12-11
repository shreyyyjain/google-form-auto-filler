/**
 * Submission run engine for batch form submissions
 */

import type {
  Preset,
  SubmissionConfig,
  SubmissionProgress,
  SubmissionError,
} from "../types/extension";
import { RandomizationEngine } from "./randomization";

export class RunEngine {
  private static runningProcess: {
    configId: string;
    abortController: AbortController;
  } | null = null;

  /**
   * Start a submission run
   */
  static async startRun(
    preset: Preset,
    config: SubmissionConfig,
    onProgress: (progress: SubmissionProgress) => void
  ): Promise<SubmissionProgress> {
    if (this.runningProcess) {
      throw new Error("A submission run is already in progress");
    }

    const abortController = new AbortController();
    const configId = `run-${Date.now()}`;
    this.runningProcess = { configId, abortController };

    const progress: SubmissionProgress = {
      totalSubmissions: config.count,
      completedSubmissions: 0,
      failedSubmissions: 0,
      isRunning: true,
      currentSubmissionIndex: 0,
      errors: [],
    };

    try {
      for (let i = 0; i < config.count; i++) {
        if (abortController.signal.aborted) {
          progress.isRunning = false;
          break;
        }

        progress.currentSubmissionIndex = i + 1;

        try {
          await this.executeSingleSubmission(preset, config, i);
          progress.completedSubmissions++;
          progress.lastSubmissionTime = Date.now();
        } catch (error) {
          progress.failedSubmissions++;
          progress.errors.push({
            submissionIndex: i + 1,
            questionId: "form",
            message: String(error),
            timestamp: Date.now(),
          });

          if (config.stopOnError) {
            throw error;
          }
        }

        // Apply delay between submissions
        if (i < config.count - 1) {
          const delay = this.calculateDelay(config, i);
          await this.sleep(delay, abortController.signal);
        }

        progress.estimatedTimeRemaining = this.estimateTimeRemaining(
          config,
          progress
        );

        onProgress(progress);
      }
    } finally {
      progress.isRunning = false;
      this.runningProcess = null;
    }

    return progress;
  }

  /**
   * Stop the current run
   */
  static stopRun(): void {
    if (this.runningProcess) {
      this.runningProcess.abortController.abort();
    }
  }

  /**
   * Check if a run is active
   */
  static isRunning(): boolean {
    return this.runningProcess !== null;
  }

  /**
   * Execute a single form submission
   */
  private static async executeSingleSubmission(
    preset: Preset,
    config: SubmissionConfig,
    submissionIndex: number
  ): Promise<void> {
    // This will be called from content script via messaging
    // For now, we prepare the submission data

    const submissionData = {
      presetId: preset.id,
      submissionIndex,
      answers: {} as Record<string, unknown>,
    };

    // Generate randomized values for each answer
    for (const answer of preset.answers) {
      const randomValue = RandomizationEngine.generate(answer.randomization);
      submissionData.answers[answer.questionId] = randomValue;
    }

    // Send to content script to fill and submit form
    await chrome.tabs.query({ active: true, currentWindow: true });
    // Message handling is in content script
  }

  /**
   * Calculate delay for next submission
   */
  private static calculateDelay(
    config: SubmissionConfig,
    submissionIndex: number
  ): number {
    const baseDelay = config.delayMin + 
      Math.random() * (config.delayMax - config.delayMin);

    // Add jitter
    const jitterAmount = baseDelay * config.jitter;
    const jitter = (Math.random() - 0.5) * 2 * jitterAmount;

    const delay = Math.max(0, baseDelay + jitter);

    // Apply global rate limit if configured
    if (config.rateLimit) {
      return Math.max(delay, config.rateLimit);
    }

    return delay;
  }

  /**
   * Estimate remaining time
   */
  private static estimateTimeRemaining(
    config: SubmissionConfig,
    progress: SubmissionProgress
  ): number {
    if (progress.completedSubmissions === 0) {
      const avgDelay = (config.delayMin + config.delayMax) / 2;
      const remaining = config.count - progress.currentSubmissionIndex;
      return remaining * avgDelay;
    }

    const elapsed = progress.lastSubmissionTime || Date.now();
    const avgTimePerSubmission = elapsed / progress.completedSubmissions;
    const remaining = config.count - progress.completedSubmissions;

    return remaining * avgTimePerSubmission;
  }

  /**
   * Sleep with abort support
   */
  private static sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("Aborted"));
        return;
      }

      const timeout = setTimeout(resolve, ms);

      signal?.addEventListener("abort", () => {
        clearTimeout(timeout);
        reject(new Error("Aborted"));
      });
    });
  }

  /**
   * Detect confirmation page and click "Submit another response"
   */
  static detectConfirmationPage(): boolean {
    const confirmText = [
      "Your response has been recorded",
      "Thanks for your response",
      "Thank you for completing this form",
      "response was recorded",
      "submit another response",
    ];

    const bodyText = document.body.textContent || "";
    return confirmText.some((text) => bodyText.toLowerCase().includes(text));
  }

  /**
   * Click "Submit another response" button
   */
  static async clickSubmitAnother(): Promise<boolean> {
    const buttons = document.querySelectorAll("button, a");
    const submitButton = Array.from(buttons).find((btn) => {
      const text = btn.textContent?.toLowerCase() || "";
      return text.includes("submit") && text.includes("another");
    });

    if (submitButton) {
      (submitButton as HTMLElement).click();
      await this.sleep(500);
      return true;
    }

    return false;
  }

  /**
   * Reload form for next submission
   */
  static async reloadForm(): Promise<void> {
    window.location.reload();
    await this.sleep(2000);
  }
}
