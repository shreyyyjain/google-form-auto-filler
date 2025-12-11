/**
 * Content script for Google Forms - Inline question configuration approach
 * Auto-detects questions and injects Fixed/Random controls below each question
 */

import { MappingEngine } from "../lib/mapping";
import { RandomizationEngine } from "../lib/randomization";

interface QuestionConfig {
  id: string;
  mode: "fixed" | "random";
  type: "text" | "radio" | "checkbox" | "dropdown" | "scale" | "date";
  randomOptions?: string; // For text: "Option1<and>Option2<and>Option3"
  probabilities?: Record<string, number>; // For MCQ/scale: { "Option A": 25, "Option B": 50, ... }
  dateRange?: { min: string; max: string }; // For date
}

interface SubmissionConfig {
  count: number;
  intervalMin: number; // seconds
  intervalMax: number; // seconds
}

class FormAutomator {
  private questions: Map<string, QuestionConfig> = new Map();
  private submissionConfig: SubmissionConfig = { count: 1, intervalMin: 2, intervalMax: 5 };
  private isSubmitting = false;
  private originalSubmitHandler: (() => void) | null = null;

  constructor() {
    if (!this.isGoogleForm()) return;
    
    this.loadStateFromSession();
    this.injectControlPanel();
    setTimeout(() => this.detectAndInjectQuestionControls(), 1000);
    this.interceptFormSubmit();
  }

  private isGoogleForm(): boolean {
    return (
      window.location.hostname.includes("docs.google.com") ||
      window.location.hostname.includes("localhost")
    ) && (
      window.location.pathname.includes("/forms/") ||
      document.querySelector('[role="main"]') !== null
    );
  }

  private loadStateFromSession() {
    const saved = sessionStorage.getItem("gformtasker-questions");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.questions = new Map(Object.entries(data.questions || {}));
      } catch (e) {
        console.error("Failed to load state:", e);
      }
    }

    const configSaved = sessionStorage.getItem("gformtasker-config");
    if (configSaved) {
      try {
        this.submissionConfig = JSON.parse(configSaved);
      } catch (e) {
        console.error("Failed to load config:", e);
      }
    }
  }

  private saveStateToSession() {
    sessionStorage.setItem(
      "gformtasker-questions",
      JSON.stringify({ questions: Object.fromEntries(this.questions) })
    );
    sessionStorage.setItem("gformtasker-config", JSON.stringify(this.submissionConfig));
  }

  private injectControlPanel() {
    const panel = document.createElement("div");
    panel.id = "gft-panel";
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      width: 320px;
      display: flex;
      flex-direction: column;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      font-size: 14px;
      cursor: move;
    `;
    header.textContent = "GFormTasker";
    header.id = "gformtasker-header";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "−";
    closeBtn.style.cssText = `
      background: rgba(255,255,255,0.3);
      color: white;
      border: none;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      transition: background 0.2s;
    `;
    closeBtn.onmouseover = () => (closeBtn.style.background = "rgba(255,255,255,0.5)");
    closeBtn.onmouseout = () => (closeBtn.style.background = "rgba(255,255,255,0.3)");
    closeBtn.addEventListener("click", () => this.minimizePanel(panel));
    header.appendChild(closeBtn);

    const content = document.createElement("div");
    content.id = "gformtasker-content";
    content.style.cssText = `
      padding: 16px;
      overflow-y: auto;
      flex: 1;
    `;

    // Submission count
    const countLabel = document.createElement("label");
    countLabel.textContent = "Submissions:";
    countLabel.style.cssText = "display: block; font-size: 13px; margin-bottom: 4px; font-weight: 500;";
    const countInput = document.createElement("input");
    countInput.type = "number";
    countInput.min = "1";
    countInput.value = String(this.submissionConfig.count);
    countInput.style.cssText = "width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 12px;";
    countInput.addEventListener("input", () => {
      this.submissionConfig.count = parseInt(countInput.value) || 1;
      this.saveStateToSession();
    });

    // Interval min
    const intervalMinLabel = document.createElement("label");
    intervalMinLabel.textContent = "Interval Min (seconds):";
    intervalMinLabel.style.cssText = "display: block; font-size: 13px; margin-bottom: 4px; font-weight: 500;";
    const intervalMinInput = document.createElement("input");
    intervalMinInput.type = "number";
    intervalMinInput.min = "0";
    intervalMinInput.value = String(this.submissionConfig.intervalMin);
    intervalMinInput.style.cssText = "width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 12px;";
    intervalMinInput.addEventListener("input", () => {
      this.submissionConfig.intervalMin = parseInt(intervalMinInput.value) || 2;
      this.saveStateToSession();
    });

    // Interval max
    const intervalMaxLabel = document.createElement("label");
    intervalMaxLabel.textContent = "Interval Max (seconds):";
    intervalMaxLabel.style.cssText = "display: block; font-size: 13px; margin-bottom: 4px; font-weight: 500;";
    const intervalMaxInput = document.createElement("input");
    intervalMaxInput.type = "number";
    intervalMaxInput.min = "0";
    intervalMaxInput.value = String(this.submissionConfig.intervalMax);
    intervalMaxInput.style.cssText = "width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 12px;";
    intervalMaxInput.addEventListener("input", () => {
      this.submissionConfig.intervalMax = parseInt(intervalMaxInput.value) || 5;
      this.saveStateToSession();
    });

    const info = document.createElement("div");
    info.style.cssText = "font-size: 12px; color: #666; line-height: 1.4; margin-top: 8px;";
    info.textContent = "Configure Fixed/Random for each question below. Submit button will trigger multi-submission.";

    content.appendChild(countLabel);
    content.appendChild(countInput);
    content.appendChild(intervalMinLabel);
    content.appendChild(intervalMinInput);
    content.appendChild(intervalMaxLabel);
    content.appendChild(intervalMaxInput);
    content.appendChild(info);

    panel.appendChild(header);
    panel.appendChild(content);
    document.body.appendChild(panel);

    this.makePanelDraggable(panel, header);

    const isMinimized = sessionStorage.getItem("gformtasker-minimized") === "true";
    if (isMinimized) {
      this.minimizePanel(panel);
    }
  }

  private makePanelDraggable(panel: HTMLElement, header: HTMLElement) {
    let offsetX = 0;
    let offsetY = 0;
    let isDown = false;

    header.addEventListener("mousedown", (e) => {
      isDown = true;
      const rect = panel.getBoundingClientRect();
      offsetX = (e as MouseEvent).clientX - rect.left;
      offsetY = (e as MouseEvent).clientY - rect.top;
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      const x = (e as MouseEvent).clientX - offsetX;
      const y = (e as MouseEvent).clientY - offsetY;
      panel.style.bottom = "auto";
      panel.style.right = "auto";
      panel.style.left = Math.max(0, Math.min(x, window.innerWidth - 320)) + "px";
      panel.style.top = Math.max(0, Math.min(y, window.innerHeight - 100)) + "px";
    });

    document.addEventListener("mouseup", () => {
      isDown = false;
    });
  }

  private minimizePanel(panel: HTMLElement) {
    const content = document.getElementById("gformtasker-content");
    if (content) {
      const isHidden = content.style.display === "none";
      content.style.display = isHidden ? "block" : "none";
      sessionStorage.setItem("gformtasker-minimized", !isHidden ? "true" : "false");
      panel.style.width = isHidden ? "320px" : "auto";
    }
  }

  private detectAndInjectQuestionControls() {
    const questions = MappingEngine.findAllQuestions();
    console.log(`📝 Detected ${questions.length} questions`);

    questions.forEach((questionEl, index) => {
      const questionType = MappingEngine.detectQuestionType(questionEl);
      const id = `q-${index}`;
      
      if (!this.questions.has(id)) {
        this.questions.set(id, {
          id,
          mode: "fixed",
          type: questionType as QuestionConfig["type"],
        });
      }

      this.injectControlForQuestion(questionEl, id, questionType);
    });

    this.saveStateToSession();
  }

  private injectControlForQuestion(questionEl: HTMLElement, id: string, type: string) {
    if (questionEl.querySelector(".gft-control")) return;

    const config = this.questions.get(id);
    if (!config) return;

    const control = document.createElement("div");
    control.className = "gft-control";
    control.style.cssText = `
      margin-top: 8px;
      padding: 8px 12px;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 3px solid #667eea;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 680px;
      box-sizing: border-box;
      position: relative;
      z-index: 1;
    `;

    // Fixed/Random pill toggle
    const toggle = document.createElement("div");
    toggle.style.cssText = "display:flex; align-items:center; gap:10px;";
    
    const modePill = document.createElement("button");
    modePill.style.cssText = `
      display:inline-flex; align-items:center; gap:8px; padding:8px 12px;
      border-radius:24px; border:none; background:${config.mode === "random" ? "#4f46e5" : "#cbd5e1"};
      color:white; font-weight:600; font-size:13px; cursor:pointer;
      transition:all 0.2s; user-select:none; width:max-content;
    `;
    modePill.innerHTML = config.mode === "random" ? "Random 🧪" : "Fixed 🔒";
    
    toggle.appendChild(modePill);
    control.appendChild(toggle);

    const randomControls = document.createElement("div");
    randomControls.id = `random-controls-${id}`;
    randomControls.style.cssText = `display:${config.mode === "random" ? "block" : "none"}; width:100%; margin-top:8px;`;
    
    modePill.addEventListener("click", () => {
      config.mode = config.mode === "random" ? "fixed" : "random";
      modePill.innerHTML = config.mode === "random" ? "Random 🧪" : "Fixed 🔒";
      modePill.style.background = config.mode === "random" ? "#4f46e5" : "#cbd5e1";
      randomControls.style.display = config.mode === "random" ? "block" : "none";
      this.saveStateToSession();
    });

    // Type-specific controls
    if (type === "short_answer" || type === "paragraph") {
      const helper = document.createElement("div");
      helper.style.cssText = "font-size:12px; color:#666; margin-bottom:8px;";
      helper.textContent = "Enter multiple values separated by <and>";
      randomControls.appendChild(helper);
      
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Value1<and>Value2<and>Value3";
      input.value = config.randomOptions || "";
      input.style.cssText = "width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;";
      input.addEventListener("input", () => {
        config.randomOptions = input.value;
        this.saveStateToSession();
      });
      randomControls.appendChild(input);
    } else if (type === "radio" || type === "checkbox" || type === "dropdown") {
      // Get options
      const options = this.getQuestionOptions(questionEl);
      const probabilities = config.probabilities || {};
      const grid = document.createElement("div");
      grid.style.cssText = "display:flex; flex-wrap:wrap; gap:12px;";
      
      options.forEach((opt) => {
        const item = document.createElement("div");
        item.style.cssText = "display:flex; align-items:center; gap:8px;";
        
        const label = document.createElement("label");
        label.textContent = opt;
        label.style.cssText = "min-width:140px; white-space:nowrap;";
        
        const num = document.createElement("input");
        num.type = "number";
        num.min = "0";
        num.max = "100";
        num.step = "1";
        num.value = String(probabilities[opt] ?? Math.floor(100 / options.length));
        num.style.cssText = "width:64px; padding:6px; border:1px solid #ddd; border-radius:6px; font-size:13px;";
        
        const pct = document.createElement("span");
        pct.textContent = "%";
        pct.style.cssText = "color:#666; font-size:13px;";
        
        num.addEventListener("input", () => {
          if (!config.probabilities) config.probabilities = {};
          config.probabilities[opt] = Math.max(0, Math.min(100, parseInt(num.value || "0")));
          this.saveStateToSession();
        });
        
        item.appendChild(label);
        item.appendChild(num);
        item.appendChild(pct);
        grid.appendChild(item);
      });
      randomControls.appendChild(grid);
    } else if (type === "scale") {
      // Get scale range
      const scaleValues = this.getScaleValues(questionEl);
      const probabilities = config.probabilities || {};
      const row = document.createElement("div");
      row.style.cssText = "display:flex; align-items:center; gap:8px; flex-wrap:wrap;";
      
      scaleValues.forEach((val) => {
        const box = document.createElement("div");
        box.style.cssText = "display:flex; align-items:center; gap:4px;";
        
        const num = document.createElement("input");
        num.type = "number";
        num.min = "0";
        num.max = "100";
        num.step = "1";
        num.value = String(probabilities[val] ?? Math.floor(100 / scaleValues.length));
        num.style.cssText = "width:60px; padding:6px; border:1px solid #ddd; border-radius:6px; font-size:12px;";
        
        const pct = document.createElement("span");
        pct.textContent = "%";
        pct.style.cssText = "color:#666; font-size:12px;";
        
        num.addEventListener("input", () => {
          if (!config.probabilities) config.probabilities = {};
          config.probabilities[val] = Math.max(0, Math.min(100, parseInt(num.value || "0")));
          this.saveStateToSession();
        });
        
        box.appendChild(num);
        box.appendChild(pct);
        row.appendChild(box);
      });
      randomControls.appendChild(row);
    } else if (type === "date") {
      const minInput = document.createElement("input");
      minInput.type = "date";
      minInput.placeholder = "Min date";
      minInput.value = config.dateRange?.min || "";
      minInput.style.cssText = "width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 8px;";
      
      const maxInput = document.createElement("input");
      maxInput.type = "date";
      maxInput.placeholder = "Max date";
      maxInput.value = config.dateRange?.max || "";
      maxInput.style.cssText = "width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;";
      
      minInput.addEventListener("input", () => {
        if (!config.dateRange) config.dateRange = { min: "", max: "" };
        config.dateRange.min = minInput.value;
        this.saveStateToSession();
      });
      
      maxInput.addEventListener("input", () => {
        if (!config.dateRange) config.dateRange = { min: "", max: "" };
        config.dateRange.max = maxInput.value;
        this.saveStateToSession();
      });
      
      randomControls.appendChild(minInput);
      randomControls.appendChild(maxInput);
    }

    control.appendChild(randomControls);

    // Append to a stable container at end of question to avoid layout breakage
    const container = questionEl.querySelector('[role="listitem"], [role="group"], .freebirdFormviewerComponentsQuestionBaseRoot, .freebirdFormviewerViewItemsItemItem') as HTMLElement | null;
    if (container) {
      container.appendChild(control);
    } else {
      questionEl.appendChild(control);
    }
  }

  private getQuestionOptions(questionEl: HTMLElement): string[] {
    const options: string[] = [];
    const labels = questionEl.querySelectorAll('label, [role="radio"], [role="checkbox"], [role="option"]');
    
    labels.forEach((label) => {
      const text = (label.textContent || "").trim();
      if (text && !options.includes(text)) {
        options.push(text);
      }
    });
    
    return options;
  }

  private getScaleValues(questionEl: HTMLElement): string[] {
    const values: string[] = [];
    const labels = questionEl.querySelectorAll('[role="radio"], label');
    
    labels.forEach((label) => {
      const text = (label.textContent || "").trim();
      if (text && /^\d+$/.test(text)) {
        values.push(text);
      }
    });
    
    return values.length > 0 ? values : ["1", "2", "3", "4", "5"];
  }

  private interceptFormSubmit() {
    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "BUTTON" || target.closest("button")) {
        const button = (target.tagName === "BUTTON" ? target : target.closest("button")) as HTMLButtonElement;
        const text = button.textContent?.toLowerCase() || "";
        
        if (text.includes("submit") && !text.includes("another")) {
          e.preventDefault();
          e.stopPropagation();
          this.handleSubmit();
        }
      }
    }, true);
  }

  private async handleSubmit() {
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    console.log(`🚀 Starting ${this.submissionConfig.count} submissions...`);

    for (let i = 0; i < this.submissionConfig.count; i++) {
      console.log(`📝 Submission ${i + 1}/${this.submissionConfig.count}`);

      // Fill form based on configs
      this.fillForm();

      // Submit
      await this.submitForm();

      // Wait for interval
      if (i < this.submissionConfig.count - 1) {
        const interval = Math.random() * (this.submissionConfig.intervalMax - this.submissionConfig.intervalMin) + this.submissionConfig.intervalMin;
        console.log(`⏳ Waiting ${interval.toFixed(1)}s...`);
        await this.sleep(interval * 1000);

        // Click "Submit another response"
        await this.clickSubmitAnother();
      }
    }

    this.isSubmitting = false;
    console.log("✅ All submissions complete!");
  }

  private fillForm() {
    const questions = MappingEngine.findAllQuestions();

    questions.forEach((questionEl, index) => {
      const id = `q-${index}`;
      const config = this.questions.get(id);
      if (!config) return;

      if (config.mode === "fixed") {
        // Keep current value, do nothing
        return;
      }

      // Apply random value
      this.applyRandomValue(questionEl, config);
    });
  }

  private applyRandomValue(questionEl: HTMLElement, config: QuestionConfig) {
    if (config.type === "text") {
      const options = (config.randomOptions || "").split("<and>").map(s => s.trim()).filter(Boolean);
      if (options.length === 0) return;
      
      const value = options[Math.floor(Math.random() * options.length)];
      const input = questionEl.querySelector("input[type='text'], textarea") as HTMLInputElement | HTMLTextAreaElement;
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else if (config.type === "radio" || config.type === "checkbox" || config.type === "dropdown") {
      const options = this.getQuestionOptions(questionEl);
      const selected = this.pickWeightedOption(options, config.probabilities || {});
      if (!selected) return;

      const labels = Array.from(questionEl.querySelectorAll('label, [role="radio"], [role="checkbox"], [role="option"]'));
      for (const label of labels) {
        if ((label.textContent || "").trim() === selected) {
          (label as HTMLElement).click();
          break;
        }
      }
    } else if (config.type === "scale") {
      const values = this.getScaleValues(questionEl);
      const selected = this.pickWeightedOption(values, config.probabilities || {});
      if (!selected) return;

      const labels = Array.from(questionEl.querySelectorAll('[role="radio"], label'));
      for (const label of labels) {
        if ((label.textContent || "").trim() === selected) {
          (label as HTMLElement).click();
          break;
        }
      }
    } else if (config.type === "date") {
      if (!config.dateRange?.min || !config.dateRange?.max) return;
      
      const min = new Date(config.dateRange.min).getTime();
      const max = new Date(config.dateRange.max).getTime();
      const random = min + Math.random() * (max - min);
      const date = new Date(random).toISOString().split("T")[0];

      const input = questionEl.querySelector("input[type='date']") as HTMLInputElement;
      if (input) {
        input.value = date;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  private pickWeightedOption(options: string[], probabilities: Record<string, number>): string | null {
    if (options.length === 0) return null;

    const weights = options.map(opt => probabilities[opt] || Math.floor(100 / options.length));
    const total = weights.reduce((sum, w) => sum + w, 0);
    
    let random = Math.random() * total;
    for (let i = 0; i < options.length; i++) {
      random -= weights[i];
      if (random <= 0) return options[i];
    }

    return options[options.length - 1];
  }

  private async submitForm() {
    const submitBtn = Array.from(document.querySelectorAll("button")).find((btn) => {
      const text = btn.textContent?.toLowerCase() || "";
      return text.includes("submit") && !text.includes("another");
    });

    if (submitBtn) {
      submitBtn.click();
      await this.sleep(1000);
    }
  }

  private async clickSubmitAnother() {
    await this.sleep(1000);

    const anotherBtn = Array.from(document.querySelectorAll("a, button")).find((el) => {
      const text = el.textContent?.toLowerCase() || "";
      return text.includes("submit another") || text.includes("another response");
    });

    if (anotherBtn) {
      (anotherBtn as HTMLElement).click();
      await this.sleep(1500);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Initialize
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new FormAutomator();
  });
} else {
  new FormAutomator();
}
