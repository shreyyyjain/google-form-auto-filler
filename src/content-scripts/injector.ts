/**
 * Content script for Google Forms - Inline question configuration approach
 * Auto-detects questions and injects Fixed/Random controls below each question
 */

import { MappingEngine } from "../lib/mapping";

type NormalizedType = "text" | "choice" | "scale" | "date" | "grid-radio" | "grid-checkbox";

interface QuestionConfig {
  id: string; // stable question id (entry id where possible)
  entryId: string; // entry.<id> extracted from DOM
  mode: "fixed" | "random";
  type: NormalizedType;
  options?: string[]; // For choice/scale questions
  gridRows?: string[];
  gridColumns?: string[];
  gridProbabilities?: Record<string, Record<string, number>>; // rowIdx -> { colLabel: weight }
  randomOptions?: string; // For text: "Option1<and>Option2<and>Option3"
  probabilities?: Record<string, number>; // For choice/scale: { "Option A": 25, "Option B": 50, ... }
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

  private normalizeType(rawType: string): NormalizedType {
    if (rawType === "radio" || rawType === "checkbox" || rawType === "dropdown") {
      return "choice";
    }
    if (rawType === "linear_scale" || rawType === "scale") {
      return "scale";
    }
    if (rawType === "grid_radio") return "grid-radio";
    if (rawType === "grid_checkbox") return "grid-checkbox";
    if (rawType === "date") return "date";
    return "text";
  }

  private getEntryId(questionEl: HTMLElement, fallbackIndex: number): string {
    const entryInput = questionEl.querySelector("input[name^='entry.'], textarea[name^='entry.'], select[name^='entry.']") as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (entryInput?.name?.startsWith("entry.")) {
      const cleaned = entryInput.name.replace("entry.", "").replace("_sentinel", "");
      if (cleaned) return cleaned;
    }

    // Fallback: data-question-id if present
    const dataId = questionEl.getAttribute("data-question-id");
    if (dataId) return dataId;

    return `q-${fallbackIndex}`;
  }

  private defaultProbabilities(optionCount: number): number[] {
    if (optionCount <= 0) return [];
    const base = Math.floor(100 / optionCount);
    const remainder = 100 - base * optionCount;
    const probs = Array(optionCount).fill(base);
    for (let i = 0; i < remainder; i++) {
      probs[i] += 1;
    }
    return probs;
  }

  private validateProbabilities(entryId: string, checkbox: HTMLInputElement, errorContainer: HTMLElement, isGrid = false): boolean {
    if (!checkbox.checked) {
      errorContainer.style.display = "none";
      return true;
    }

    const inputs = Array.from(document.querySelectorAll(`.g-form-tasker-prob-input[data-question-id="${entryId}"]`)) as HTMLInputElement[];
    if (inputs.length === 0) {
      errorContainer.style.display = "none";
      return true;
    }

    const shouldGroupByRow = isGrid || inputs.some((input) => input.dataset.rowIdx !== undefined);

    if (shouldGroupByRow) {
      const rowSums = new Map<string, number>();
      inputs.forEach((input) => {
        const rowKey = input.dataset.rowIdx ?? "0";
        const num = parseFloat(input.value);
        const current = rowSums.get(rowKey) || 0;
        rowSums.set(rowKey, current + (Number.isNaN(num) ? 0 : num));
      });

      let allValid = true;
      for (const [rowKey, sum] of rowSums.entries()) {
        const validRow = Math.abs(sum - 100) <= 0.1;
        if (!validRow && allValid) {
          const rowIndex = Number.isNaN(Number(rowKey)) ? rowKey : `Row ${Number(rowKey) + 1}`;
          errorContainer.textContent = `Probabilities for ${rowIndex} sum to ${sum.toFixed(1)}%. Please adjust to 100%.`;
          errorContainer.style.display = "block";
        }
        allValid = allValid && validRow;
      }

      if (allValid) {
        errorContainer.style.display = "none";
      }

      return allValid;
    }

    const sum = inputs.reduce((acc, input) => {
      const num = parseFloat(input.value);
      return acc + (Number.isNaN(num) ? 0 : num);
    }, 0);

    const valid = Math.abs(sum - 100) <= 0.1;
    if (!valid) {
      errorContainer.textContent = `Probabilities sum to ${sum.toFixed(1)}%. Please adjust to sum to 100%.`;
      errorContainer.style.display = "block";
    } else {
      errorContainer.style.display = "none";
    }

    return valid;
  }

  private loadProbabilities(entryId: string, options?: string[]): Record<string, number> | undefined {
    if (!options || options.length === 0) return undefined;

    const probabilities: Record<string, number> = {};
    let hasStored = false;

    options.forEach((opt, idx) => {
      const stored = sessionStorage.getItem(`prob.${entryId}.${idx}`);
      if (stored !== null) {
        const num = parseFloat(stored);
        if (!Number.isNaN(num)) {
          probabilities[opt] = num;
          hasStored = true;
        }
      }
    });

    if (hasStored) return probabilities;

    const defaults = this.defaultProbabilities(options.length);
    options.forEach((opt, idx) => {
      probabilities[opt] = defaults[idx];
    });
    return probabilities;
  }

  private loadGridProbabilities(entryId: string, rows: string[] | undefined, columns: string[] | undefined): Record<string, Record<string, number>> | undefined {
    if (!rows || !columns || rows.length === 0 || columns.length === 0) return undefined;

    const grid: Record<string, Record<string, number>> = {};

    rows.forEach((_, rowIdx) => {
      const rowKey = String(rowIdx);
      const defaults = this.defaultProbabilities(columns.length);
      const rowProb: Record<string, number> = {};
      let hasStored = false;

      columns.forEach((col, colIdx) => {
        const stored = sessionStorage.getItem(`prob.${entryId}.${rowIdx}.${colIdx}`);
        if (stored !== null) {
          const num = parseFloat(stored);
          if (!Number.isNaN(num)) {
            rowProb[col] = num;
            hasStored = true;
          }
        }
      });

      if (!hasStored) {
        columns.forEach((col, colIdx) => {
          rowProb[col] = defaults[colIdx];
        });
      }

      grid[rowKey] = rowProb;
    });

    return grid;
  }

  private getGridColumns(questionEl: HTMLElement): string[] {
    const cols: string[] = [];
    questionEl.querySelectorAll('[role="columnheader"]').forEach((cell) => {
      const text = (cell.textContent || "").trim();
      if (text) cols.push(text);
    });

    if (cols.length > 0) return cols;

    // Fallback: infer from first row cell count
    const firstRow = questionEl.querySelector('[role="row"]');
    if (firstRow) {
      const cellCount = firstRow.querySelectorAll('[role="radio"], [role="checkbox"]').length;
      for (let i = 0; i < cellCount; i++) {
        cols.push(`Option ${i + 1}`);
      }
    }
    return cols;
  }

  private getGridRows(questionEl: HTMLElement): { rowEl: HTMLElement; rowLabel: string; cells: HTMLElement[] }[] {
    const rows: { rowEl: HTMLElement; rowLabel: string; cells: HTMLElement[] }[] = [];
    const headers = questionEl.querySelectorAll('[role="rowheader"]');

    headers.forEach((header, idx) => {
      const rowEl = header.closest('[role="row"]') as HTMLElement | null;
      if (!rowEl) return;
      const rowLabel = (header.textContent || "").trim() || `Row ${idx + 1}`;
      const cells = Array.from(rowEl.querySelectorAll('[role="radio"], [role="checkbox"]')) as HTMLElement[];
      rows.push({ rowEl, rowLabel, cells });
    });

    return rows;
  }

  private loadDateRange(entryId: string): { min: string; max: string } | undefined {
    const stored = sessionStorage.getItem(`date-range.${entryId}`);
    if (!stored) return undefined;
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.min || parsed?.max) {
        return { min: parsed.min || "", max: parsed.max || "" };
      }
    } catch (err) {
      console.error("Failed to parse date range", err);
    }
    return undefined;
  }

  private persistQuestionSnapshot(config: QuestionConfig) {
    const keyBase = config.entryId;
    if (config.options?.length) {
      sessionStorage.setItem(`entry.${keyBase}`, JSON.stringify(config.options));
    }
    if ((config.type === "grid-radio" || config.type === "grid-checkbox") && config.gridColumns?.length) {
      sessionStorage.setItem(`entry.${keyBase}`, JSON.stringify(config.gridColumns));
    }

    sessionStorage.setItem(`q-entry.${keyBase}`, config.id);
    sessionStorage.setItem(`t-entry.${keyBase}`, config.type);

    sessionStorage.setItem(`r-entry.${keyBase}`, JSON.stringify(config.mode === "random"));

    if (config.dateRange) {
      sessionStorage.setItem(`date-range.${keyBase}`, JSON.stringify(config.dateRange));
    }
  }

  private loadStateFromSession() {
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

    const seen = new Set<string>();

    questions.forEach((questionEl, index) => {
      const container = questionEl.closest(".Qr7Oae") as HTMLElement | null;
      const targetEl = container || questionEl;
      const normalizedType = this.normalizeType(MappingEngine.detectQuestionType(questionEl));
      const entryId = this.getEntryId(targetEl, index);
      if (seen.has(entryId)) return;
      seen.add(entryId);
      const id = entryId;

      const options = normalizedType === "choice"
        ? this.getQuestionOptions(targetEl)
        : normalizedType === "scale"
          ? this.getScaleValues(targetEl)
          : undefined;

      const gridColumns = (normalizedType === "grid-radio" || normalizedType === "grid-checkbox")
        ? this.getGridColumns(targetEl)
        : undefined;
      const gridRowData = (normalizedType === "grid-radio" || normalizedType === "grid-checkbox")
        ? this.getGridRows(targetEl)
        : undefined;
      const gridRows = gridRowData?.map((r) => r.rowLabel);
      const gridProbabilities = (normalizedType === "grid-radio" || normalizedType === "grid-checkbox")
        ? this.loadGridProbabilities(entryId, gridRows, gridColumns)
        : undefined;

      const savedMode = sessionStorage.getItem(`r-entry.${entryId}`);
      const mode: "fixed" | "random" = savedMode ? (JSON.parse(savedMode) ? "random" : "fixed") : "fixed";

      const config: QuestionConfig = {
        id,
        entryId,
        mode,
        type: normalizedType,
        options,
        gridRows,
        gridColumns,
        gridProbabilities,
        randomOptions: sessionStorage.getItem(`text-random.${entryId}`) || undefined,
        probabilities: this.loadProbabilities(entryId, options),
        dateRange: this.loadDateRange(entryId),
      };

      this.questions.set(id, config);
      this.persistQuestionSnapshot(config);
      this.injectControlForQuestion(targetEl, config);
    });

    this.saveStateToSession();
  }

  private injectControlForQuestion(questionEl: HTMLElement, config: QuestionConfig) {
    if (questionEl.querySelector(".gft-toggle")) return;

    // Create ONE toggle switch per question
    const toggleContainer = document.createElement("div");
    toggleContainer.className = "gft-toggle";
    toggleContainer.style.cssText = "margin-top:8px; margin-bottom:8px;";

    const label = document.createElement("label");
    label.className = "g-form-tasker-switch";
    label.style.cssText = "display:inline-flex; align-items:center; cursor:pointer; position:relative; gap:8px;";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `g-form-tasker-random-${config.entryId}`;
    checkbox.checked = config.mode === "random";
    checkbox.style.cssText = "margin:0;";

    const sliderLabel = document.createElement("span");
    sliderLabel.textContent = config.mode === "random" ? "Random" : "Fixed";
    sliderLabel.style.cssText = "font-weight:600; font-size:13px;";

    label.appendChild(checkbox);
    label.appendChild(sliderLabel);
    toggleContainer.appendChild(label);

    const errorContainer = document.createElement("div");
    errorContainer.id = `g-form-tasker-error-${config.entryId}`;
    errorContainer.style.cssText = "color:#d93025;font-size:12px;margin-top:4px;display:none;";

    const entryId = config.entryId;
    const probabilities = config.probabilities || {};
    const isGrid = config.type === "grid-radio" || config.type === "grid-checkbox";

    // Get all choice containers based on question type
    if (config.type === "choice") {
      const choiceContainers = Array.from(questionEl.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"], .freebirdFormviewerComponentsChoiceItem'));
      const options = config.options || this.getQuestionOptions(questionEl);

      choiceContainers.forEach((choiceEl, idx) => {
        const optionText = options[idx];
        if (!optionText) return;

        let probInput = choiceEl.querySelector(`.g-form-tasker-prob-input[data-question-id="${entryId}"][data-choice-idx="${idx}"]`) as HTMLInputElement;

        if (!probInput) {
          const probContainer = document.createElement("div");
          probContainer.className = "gft-prob-container";
          probContainer.style.cssText = `display:${config.mode === "random" ? "flex" : "none"}; align-items:center; margin-left:8px; gap:4px;`;
          probContainer.dataset.questionId = entryId;
          probContainer.dataset.choiceIdx = String(idx);

          probInput = document.createElement("input");
          probInput.type = "number";
          probInput.min = "0";
          probInput.max = "100";
          probInput.className = "g-form-tasker-prob-input";
          probInput.dataset.questionId = entryId;
          probInput.dataset.choiceIdx = String(idx);
          probInput.value = String(probabilities[optionText] ?? this.defaultProbabilities(options.length)[idx]);
          probInput.style.cssText = "width:40px; padding:4px; border:1px solid #ddd; border-radius:4px; font-size:12px;";
          const probKey = `prob.${entryId}.${idx}`;
          if (sessionStorage.getItem(probKey) === null) {
            sessionStorage.setItem(probKey, probInput.value);
          }

          const pctSpan = document.createElement("span");
          pctSpan.textContent = "%";
          pctSpan.style.cssText = "font-size:90%; color:#888; margin-left:2px;";

          probInput.addEventListener("input", () => {
            if (!config.probabilities) config.probabilities = {};
            const num = Math.max(0, Math.min(100, parseInt(probInput.value || "0")));
            config.probabilities[optionText] = num;
            sessionStorage.setItem(`prob.${entryId}.${idx}`, String(num));
            this.validateProbabilities(entryId, checkbox, errorContainer);
            this.saveStateToSession();
          });

          probContainer.appendChild(probInput);
          probContainer.appendChild(pctSpan);
          choiceEl.appendChild(probContainer);
        }
      });
    } else if (config.type === "scale") {
      const scaleContainers = Array.from(questionEl.querySelectorAll('[role="radio"]'));
      const scaleValues = config.options || this.getScaleValues(questionEl);

      scaleContainers.forEach((scaleEl, idx) => {
        const val = scaleValues[idx];
        if (!val) return;

        let probInput = scaleEl.querySelector(`.g-form-tasker-prob-input[data-question-id="${entryId}"][data-choice-idx="${idx}"]`) as HTMLInputElement;

        if (!probInput) {
          const probContainer = document.createElement("div");
          probContainer.className = "gft-prob-container";
          probContainer.style.cssText = `display:${config.mode === "random" ? "flex" : "none"}; align-items:center; margin-left:8px; gap:4px;`;
          probContainer.dataset.questionId = entryId;
          probContainer.dataset.choiceIdx = String(idx);

          probInput = document.createElement("input");
          probInput.type = "number";
          probInput.min = "0";
          probInput.max = "100";
          probInput.className = "g-form-tasker-prob-input";
          probInput.dataset.questionId = entryId;
          probInput.dataset.choiceIdx = String(idx);
          probInput.value = String(probabilities[val] ?? this.defaultProbabilities(scaleValues.length)[idx]);
          probInput.style.cssText = "width:40px; padding:4px; border:1px solid #ddd; border-radius:4px; font-size:12px;";
          const probKey = `prob.${entryId}.${idx}`;
          if (sessionStorage.getItem(probKey) === null) {
            sessionStorage.setItem(probKey, probInput.value);
          }

          const pctSpan = document.createElement("span");
          pctSpan.textContent = "%";
          pctSpan.style.cssText = "font-size:90%; color:#888; margin-left:2px;";

          probInput.addEventListener("input", () => {
            if (!config.probabilities) config.probabilities = {};
            const num = Math.max(0, Math.min(100, parseInt(probInput.value || "0")));
            config.probabilities[val] = num;
            sessionStorage.setItem(`prob.${entryId}.${idx}`, String(num));
            this.validateProbabilities(entryId, checkbox, errorContainer);
            this.saveStateToSession();
          });

          probContainer.appendChild(probInput);
          probContainer.appendChild(pctSpan);
          scaleEl.appendChild(probContainer);
        }
      });
    } else if (config.type === "grid-radio" || config.type === "grid-checkbox") {
      const columns = config.gridColumns || this.getGridColumns(questionEl);
      const rows = this.getGridRows(questionEl);

      rows.forEach((row, rowIdx) => {
        const defaults = this.defaultProbabilities(columns.length);
        row.cells.forEach((cellEl, colIdx) => {
          const colLabel = columns[colIdx];
          if (!colLabel) return;

          let probInput = cellEl.querySelector(`.g-form-tasker-prob-input[data-question-id="${entryId}"][data-row-idx="${rowIdx}"][data-choice-idx="${colIdx}"]`) as HTMLInputElement;

          if (!probInput) {
            const probContainer = document.createElement("div");
            probContainer.className = "gft-prob-container";
            probContainer.style.cssText = `display:${config.mode === "random" ? "flex" : "none"}; align-items:center; margin-left:8px; gap:4px;`;
            probContainer.dataset.questionId = entryId;
            probContainer.dataset.choiceIdx = String(colIdx);
            probContainer.dataset.rowIdx = String(rowIdx);

            probInput = document.createElement("input");
            probInput.type = "number";
            probInput.min = "0";
            probInput.max = "100";
            probInput.className = "g-form-tasker-prob-input";
            probInput.dataset.questionId = entryId;
            probInput.dataset.choiceIdx = String(colIdx);
            probInput.dataset.rowIdx = String(rowIdx);

            const rowProb = config.gridProbabilities?.[String(rowIdx)] || {};
            probInput.value = String(rowProb[colLabel] ?? defaults[colIdx]);
            probInput.style.cssText = "width:40px; padding:4px; border:1px solid #ddd; border-radius:4px; font-size:12px;";
            const probKey = `prob.${entryId}.${rowIdx}.${colIdx}`;
            if (sessionStorage.getItem(probKey) === null) {
              sessionStorage.setItem(probKey, probInput.value);
            }

            const pctSpan = document.createElement("span");
            pctSpan.textContent = "%";
            pctSpan.style.cssText = "font-size:90%; color:#888; margin-left:2px;";

            probInput.addEventListener("input", () => {
              if (!config.gridProbabilities) config.gridProbabilities = {};
              if (!config.gridProbabilities[String(rowIdx)]) config.gridProbabilities[String(rowIdx)] = {};
              const num = Math.max(0, Math.min(100, parseInt(probInput.value || "0")));
              config.gridProbabilities[String(rowIdx)][colLabel] = num;
              sessionStorage.setItem(probKey, String(num));
              this.validateProbabilities(entryId, checkbox, errorContainer, true);
              this.saveStateToSession();
            });

            probContainer.appendChild(probInput);
            probContainer.appendChild(pctSpan);
            cellEl.appendChild(probContainer);
          }
        });
      });
    } else if (config.type === "text") {
      const textContainer = document.createElement("div");
      textContainer.className = "gft-text-container";
      textContainer.style.cssText = `display:${config.mode === "random" ? "block" : "none"}; margin-top:8px;`;

      const helper = document.createElement("div");
      helper.style.cssText = "font-size:12px; color:#666; margin-bottom:8px;";
      helper.textContent = "Separate values with <and>";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "gft-text-input";
      input.placeholder = "Value1<and>Value2<and>Value3";
      input.value = config.randomOptions || "";
      input.style.cssText = "width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;";
      input.addEventListener("input", () => {
        config.randomOptions = input.value;
        sessionStorage.setItem(`text-random.${entryId}`, input.value);
        this.saveStateToSession();
      });

      textContainer.appendChild(helper);
      textContainer.appendChild(input);
      toggleContainer.appendChild(textContainer);
    } else if (config.type === "date") {
      const dateContainer = document.createElement("div");
      dateContainer.className = "gft-date-container";
      dateContainer.style.cssText = `display:${config.mode === "random" ? "flex" : "none"}; gap:8px; margin-top:8px;`;

      const minInput = document.createElement("input");
      minInput.type = "date";
      minInput.value = config.dateRange?.min || "";
      minInput.style.cssText = "padding:6px; border:1px solid #ddd; border-radius:4px;";
      minInput.addEventListener("input", () => {
        if (!config.dateRange) config.dateRange = { min: "", max: "" };
        config.dateRange.min = minInput.value;
        sessionStorage.setItem(`date-range.${entryId}`, JSON.stringify(config.dateRange));
        this.saveStateToSession();
      });

      const maxInput = document.createElement("input");
      maxInput.type = "date";
      maxInput.value = config.dateRange?.max || "";
      maxInput.style.cssText = "padding:6px; border:1px solid #ddd; border-radius:4px;";
      maxInput.addEventListener("input", () => {
        if (!config.dateRange) config.dateRange = { min: "", max: "" };
        config.dateRange.max = maxInput.value;
        sessionStorage.setItem(`date-range.${entryId}`, JSON.stringify(config.dateRange));
        this.saveStateToSession();
      });

      dateContainer.appendChild(minInput);
      dateContainer.appendChild(maxInput);
      toggleContainer.appendChild(dateContainer);
    }

    // Persist "Other" text responses similarly to GFormTasker
    const otherInput = questionEl.querySelector('input[type="text"][aria-label*="Other"], textarea[aria-label*="Other"]') as HTMLInputElement | HTMLTextAreaElement | null;
    if (otherInput) {
      const otherKey = `other-text.${entryId}`;
      const storedOther = sessionStorage.getItem(otherKey);
      if (storedOther) {
        otherInput.value = storedOther;
      }
      const persistOther = () => {
        sessionStorage.setItem(otherKey, otherInput.value || "");
      };
      otherInput.addEventListener("input", persistOther);
      otherInput.addEventListener("blur", persistOther);
    }

    toggleContainer.appendChild(errorContainer);

    // Toggle handler
    checkbox.addEventListener("change", () => {
      config.mode = checkbox.checked ? "random" : "fixed";
      sliderLabel.textContent = checkbox.checked ? "Random" : "Fixed";

      sessionStorage.setItem(`r-entry.${entryId}`, JSON.stringify(checkbox.checked));

      const probContainers = questionEl.querySelectorAll(".gft-prob-container");
      probContainers.forEach((pc) => {
        (pc as HTMLElement).style.display = checkbox.checked ? "flex" : "none";
      });

      const textContainer = questionEl.querySelector(".gft-text-container") as HTMLElement;
      if (textContainer) textContainer.style.display = checkbox.checked ? "block" : "none";

      const dateContainer = questionEl.querySelector(".gft-date-container") as HTMLElement;
      if (dateContainer) dateContainer.style.display = checkbox.checked ? "flex" : "none";

      this.validateProbabilities(entryId, checkbox, errorContainer, isGrid);
      this.saveStateToSession();
    });

    this.validateProbabilities(entryId, checkbox, errorContainer, isGrid);

    // Prepend toggle at the top of the question
    const questionContent = questionEl.querySelector('[role="main"], .freebirdFormviewerComponentsQuestionTitleDescription, [data-question-id]');
    if (questionContent?.parentElement) {
      questionContent.parentElement.insertBefore(toggleContainer, questionContent);
    } else {
      questionEl.insertBefore(toggleContainer, questionEl.firstChild);
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
    if (!this.ensureValidProbabilities()) return;
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

  private ensureValidProbabilities(): boolean {
    let allValid = true;
    this.questions.forEach((config) => {
      if (config.mode !== "random") return;
      const checkbox = document.getElementById(`g-form-tasker-random-${config.entryId}`) as HTMLInputElement | null;
      const errorContainer = document.getElementById(`g-form-tasker-error-${config.entryId}`) as HTMLElement | null;
      if (checkbox && errorContainer) {
        const isGrid = config.type === "grid-radio" || config.type === "grid-checkbox";
        const valid = this.validateProbabilities(config.entryId, checkbox, errorContainer, isGrid);
        allValid = allValid && valid;
      }
    });
    return allValid;
  }

  private fillForm() {
    const questions = MappingEngine.findAllQuestions();

    questions.forEach((questionEl, index) => {
      const container = questionEl.closest(".Qr7Oae") as HTMLElement | null;
      const targetEl = container || questionEl;
      const entryId = this.getEntryId(targetEl, index);
      const config = this.questions.get(entryId);
      if (!config) return;

      if (config.mode === "fixed") {
        // Keep current value, do nothing
        return;
      }

      // Apply random value
      this.applyRandomValue(targetEl, config);
    });
  }

  private applyRandomValue(questionEl: HTMLElement, config: QuestionConfig) {
    if (config.type === "text") {
      const options = (config.randomOptions || "").split("<and>").map((s) => s.trim()).filter(Boolean);
      if (options.length === 0) return;

      const value = options[Math.floor(Math.random() * options.length)];
      const input = questionEl.querySelector("input[type='text'][name^='entry.'], textarea[name^='entry.']") as HTMLInputElement | HTMLTextAreaElement;
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      sessionStorage.setItem(`text-random.${config.entryId}`, config.randomOptions || "");
      return;
    }

    if (config.type === "choice") {
      const options = config.options || this.getQuestionOptions(questionEl);
      const selected = this.pickWeightedOption(options, config.probabilities || {});
      if (!selected) return;

      const labels = Array.from(questionEl.querySelectorAll("label, [role='radio'], [role='checkbox'], [role='option']"));
      for (const label of labels) {
        if ((label.textContent || "").trim() === selected) {
          (label as HTMLElement).click();
          break;
        }
      }
      return;
    }

    if (config.type === "scale") {
      const values = config.options || this.getScaleValues(questionEl);
      const selected = this.pickWeightedOption(values, config.probabilities || {});
      if (!selected) return;

      const labels = Array.from(questionEl.querySelectorAll("[role='radio'], label"));
      for (const label of labels) {
        if ((label.textContent || "").trim() === selected) {
          (label as HTMLElement).click();
          break;
        }
      }
      return;
    }

    if (config.type === "grid-radio" || config.type === "grid-checkbox") {
      const columns = config.gridColumns || this.getGridColumns(questionEl);
      const rows = this.getGridRows(questionEl);
      if (columns.length === 0 || rows.length === 0) return;

      rows.forEach((row, rowIdx) => {
        const baseWeights = this.defaultProbabilities(columns.length);
        const rowProb = config.gridProbabilities?.[String(rowIdx)] || {};
        const probabilities: Record<string, number> = {};
        columns.forEach((col, colIdx) => {
          probabilities[col] = rowProb[col] ?? baseWeights[colIdx];
        });

        const selected = this.pickWeightedOption(columns, probabilities);
        if (!selected) return;
        const chosenIdx = columns.findIndex((col) => col === selected);
        if (chosenIdx >= 0 && row.cells[chosenIdx]) {
          (row.cells[chosenIdx] as HTMLElement).click();
        }
      });

      return;
    }

    if (config.type === "date") {
      if (!config.dateRange?.min || !config.dateRange?.max) return;

      const min = new Date(config.dateRange.min).getTime();
      const max = new Date(config.dateRange.max).getTime();
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return;
      const random = min + Math.random() * (max - min);
      const date = new Date(random).toISOString().split("T")[0];

      const input = questionEl.querySelector("input[type='date'][name^='entry.']") as HTMLInputElement;
      if (input) {
        input.value = date;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      sessionStorage.setItem(`date-range.${config.entryId}`, JSON.stringify(config.dateRange));
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
