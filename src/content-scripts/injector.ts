/**
 * Content script for Google Forms interaction
 * Injects into docs.google.com/forms/* and handles:
 * - Recording mode (capturing questions and answers)
 * - Filling forms with preset answers
 * - Submitting forms
 */

import { MappingEngine } from "../lib/mapping";
import { RandomizationEngine } from "../lib/randomization";
import type {
  ContentScriptMessage,
  QuestionMapping,
  Preset,
  PresetAnswer,
} from "../types/extension";

class FormInteractor {
  private isRecording = false;
  private recordingPresetName = "";
  private recordedAnswers: Array<{
    mapping: QuestionMapping;
    value: unknown;
  }> = [];

  constructor() {
    this.initMessageListener();
    this.injectRecordingUI();
  }

  private initMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("Content script received:", request.type);

      if (request.type === "start_recording") {
        this.startRecording();
        sendResponse({ success: true });
      } else if (request.type === "stop_recording") {
        const preset = this.stopRecording();
        sendResponse({ success: true, preset });
      } else if (request.type === "fill_and_submit") {
        this.fillFormFromPreset(request.payload.preset);
        sendResponse({ success: true });
      }

      return true; // Keep channel open
    });
  }

  private injectRecordingUI() {
    // Check if we're on a Google Form
    if (!this.isGoogleForm()) return;

    // Create a floating record button
    const container = document.createElement("div");
    container.id = "gformtasker-recorder-ui";
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    const button = document.createElement("button");
    button.id = "gformtasker-record-btn";
    button.textContent = "🔴 Record Preset";
    button.style.cssText = `
      padding: 12px 16px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 24px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: all 0.2s;
    `;

    button.onmouseover = () => {
      button.style.background = "#5568d3";
      button.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    };

    button.onmouseout = () => {
      button.style.background = "#667eea";
      button.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
    };

    button.addEventListener("click", () => this.toggleRecording());
    container.appendChild(button);

    document.body.appendChild(container);
  }

  private isGoogleForm(): boolean {
    return window.location.hostname.includes("docs.google.com") &&
      window.location.pathname.includes("/forms/");
  }

  private toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  private startRecording() {
    this.isRecording = true;
    this.recordedAnswers = [];

    const btn = document.getElementById("gformtasker-record-btn");
    if (btn) {
      btn.textContent = "⏹️ Stop Recording";
      btn.style.background = "#ef4444";
    }

    // Start listening to form changes
    this.attachFormListeners();

    console.log("🔴 Recording started");
  }

  private stopRecording(): Preset | null {
    if (!this.isRecording) return null;

    this.isRecording = false;

    const btn = document.getElementById("gformtasker-record-btn");
    if (btn) {
      btn.textContent = "🔴 Record Preset";
      btn.style.background = "#667eea";
    }

    // Find all questions and create mappings
    const questions = MappingEngine.findAllQuestions();
    const questionMappings: QuestionMapping[] = [];

    for (let i = 0; i < questions.length; i++) {
      const mapping = MappingEngine.createMapping(questions[i], i);
      questionMappings.push(mapping);
    }

    // Convert recorded answers to preset answers
    const presetAnswers: PresetAnswer[] = questionMappings.map((mapping) => {
      const recorded = this.recordedAnswers.find(
        (r) => r.mapping.id === mapping.id
      );

      return {
        questionId: mapping.id,
        randomization: {
          type: "fixed",
          value: recorded?.value || null,
        },
      };
    });

    const preset: Preset = {
      id: `recorded-${Date.now()}`,
      name: prompt("Preset name:", "My Recorded Preset") || "My Recorded Preset",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      answers: presetAnswers,
      questionMappings,
      metadata: {
        formUrl: window.location.href,
        recordedAt: Date.now(),
      },
    };

    // Save preset via background script
    chrome.runtime.sendMessage(
      {
        type: "create_preset",
        payload: preset,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Failed to save preset:", chrome.runtime.lastError);
        } else {
          console.log("✅ Preset saved:", preset);
        }
      }
    );

    return preset;
  }

  private attachFormListeners() {
    // Listen to all input changes
    document.addEventListener(
      "change",
      (e) => {
        const target = e.target as HTMLElement;
        if (!this.isRecording) return;

        const value = this.extractValue(target);
        const parentQuestion = this.findParentQuestion(target);

        if (parentQuestion) {
          const mapping = MappingEngine.createMapping(parentQuestion, 0);
          const existing = this.recordedAnswers.findIndex(
            (r) => r.mapping.id === mapping.id
          );

          if (existing >= 0) {
            this.recordedAnswers[existing] = { mapping, value };
          } else {
            this.recordedAnswers.push({ mapping, value });
          }

          console.log("📝 Captured:", mapping.label, "=", value);
        }
      },
      true
    );
  }

  private async fillFormFromPreset(preset: Preset) {
    console.log("🚀 Filling form from preset:", preset.name);

    const questions = MappingEngine.findAllQuestions();

    for (const answer of preset.answers) {
      const mapping = preset.questionMappings.find(
        (m) => m.id === answer.questionId
      );
      if (!mapping) continue;

      // Generate randomized value
      const value = RandomizationEngine.generate(answer.randomization);

      // Find matching question element
      const element = this.findQuestionElement(mapping, questions);
      if (element) {
        await this.fillFormField(element, value, mapping.type);
      }
    }

    console.log("✅ Form filled");

    // Wait a moment then submit
    setTimeout(() => {
      this.submitForm();
    }, 500);
  }

  private submitForm() {
    const submitBtn = Array.from(document.querySelectorAll("button")).find(
      (btn) => {
        const text = btn.textContent?.toLowerCase() || "";
        return text.includes("submit") && !text.includes("another");
      }
    );

    if (submitBtn) {
      (submitBtn as HTMLElement).click();
      console.log("✅ Form submitted");
    }
  }

  private findQuestionElement(
    mapping: QuestionMapping,
    questions: HTMLElement[]
  ): HTMLElement | null {
    // Try selector first
    if (mapping.selector) {
      try {
        const el = document.querySelector(mapping.selector);
        if (el) return el as HTMLElement;
      } catch (e) {
        // Invalid selector
      }
    }

    // Try element ID
    if (mapping.elementId) {
      const el = document.getElementById(mapping.elementId);
      if (el) return el;
    }

    // Try aria-label
    if (mapping.ariaLabel) {
      const el = document.querySelector(
        `[aria-label="${mapping.ariaLabel}"]`
      );
      if (el) return el as HTMLElement;
    }

    // Try data attributes
    for (const [key, value] of Object.entries(mapping.dataAttributes || {})) {
      const el = document.querySelector(`[${key}="${value}"]`);
      if (el) return el as HTMLElement;
    }

    // Fallback: fuzzy match from found questions
    return null;
  }

  private async fillFormField(
    element: HTMLElement,
    value: unknown,
    questionType: string
  ) {
    const strValue = String(value || "");

    if (questionType === "short_answer" || questionType === "paragraph") {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      if (input.value !== undefined) {
        input.value = strValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else if (
      questionType === "radio" ||
      questionType === "checkbox"
    ) {
      const options = element.querySelectorAll(
        "label, [role='option'], [role='radio'], [role='checkbox']"
      );
      for (const opt of options) {
        if (opt.textContent?.includes(strValue)) {
          (opt as HTMLElement).click();
          break;
        }
      }
    } else if (questionType === "dropdown") {
      const options = element.querySelectorAll("[role='option']");
      for (const opt of options) {
        if (opt.textContent?.includes(strValue)) {
          (opt as HTMLElement).click();
          break;
        }
      }
    } else if (questionType === "date") {
      const input = element as HTMLInputElement;
      input.value = strValue;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  private extractValue(element: HTMLElement): unknown {
    const input = element as HTMLInputElement | HTMLTextAreaElement;

    if (element.tagName === "TEXTAREA") return (element as HTMLTextAreaElement).value;
    if (input.type === "checkbox") return (input as HTMLInputElement).checked;
    if (input.type === "radio") return (input as HTMLInputElement).value;
    if (input.value !== undefined) return input.value;

    const select = element as HTMLSelectElement;
    if (select.selectedIndex !== undefined) {
      return select.options[select.selectedIndex]?.text || "";
    }

    return element.textContent || "";
  }

  private findParentQuestion(element: HTMLElement): HTMLElement | null {
    let current = element as HTMLElement | null;

    while (current && current !== document.body) {
      if (current.getAttribute("data-question-id")) return current;
      if (current.getAttribute("role") === "presentation") return current;
      if (current.classList.contains("question-container")) return current;

      current = current.parentElement;
    }

    return element;
  }
}

// Initialize content script
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new FormInteractor();
  });
} else {
  new FormInteractor();
}
