/**
 * Mapping engine for Google Forms question detection and selector generation
 */

import type { QuestionMapping, QuestionType } from "../types/extension";

const QUESTION_TYPE_SELECTORS: Record<string, string[]> = {
  short_answer: [
    "[role='textbox'][data-question-type='short_text']",
    "input[type='text'][aria-label*='']",
  ],
  paragraph: [
    "[role='textbox'][data-question-type='paragraph']",
    "textarea[aria-label*='']",
  ],
  radio: [
    "[role='radio']",
    "input[type='radio']",
  ],
  checkbox: [
    "[role='checkbox']",
    "input[type='checkbox']",
  ],
  dropdown: [
    "[role='listbox']",
    "select",
  ],
  linear_scale: [
    "[role='radio'][aria-label*='scale']",
  ],
  date: [
    "input[type='date']",
  ],
  time: [
    "input[type='time']",
  ],
  file_upload: [
    "input[type='file']",
  ],
  grid_checkbox: [
    "[role='presentation'] [role='checkbox']",
  ],
  grid_radio: [
    "[role='presentation'] [role='radio']",
  ],
};

export class MappingEngine {
  /**
   * Detect question type from element and its context
   */
  static detectQuestionType(element: HTMLElement): QuestionType {
    const text = element.textContent?.toLowerCase() || "";
    const ariaLabel = element.getAttribute("aria-label")?.toLowerCase() || "";
    const dataType = element.getAttribute("data-question-type") || "";

    // Check data-question-type attribute (most reliable)
    if (dataType.includes("paragraph")) return "paragraph";
    if (dataType.includes("short_text")) return "short_answer";
    if (dataType.includes("radio")) return "radio";
    if (dataType.includes("checkbox")) return "checkbox";
    if (dataType.includes("dropdown")) return "dropdown";
    if (dataType.includes("linear")) return "linear_scale";
    if (dataType.includes("date")) return "date";
    if (dataType.includes("time")) return "time";
    if (dataType.includes("file")) return "file_upload";

    // Check element type
    const inputType = element.getAttribute("type")?.toLowerCase();
    if (inputType === "text") return "short_answer";
    if (inputType === "file") return "file_upload";
    if (inputType === "date") return "date";
    if (inputType === "time") return "time";

    if (element.tagName === "TEXTAREA") return "paragraph";
    if (element.tagName === "SELECT") return "dropdown";

    // Check role attribute
    const role = element.getAttribute("role");
    if (role === "radio") return "radio";
    if (role === "checkbox") return "checkbox";
    if (role === "listbox") return "dropdown";

    // Fuzzy detection from context
    if (text.includes("scale") || ariaLabel.includes("scale")) {
      return "linear_scale";
    }
    if (text.includes("file") || ariaLabel.includes("file")) {
      return "file_upload";
    }
    if (text.includes("check") || ariaLabel.includes("checkbox")) {
      return "checkbox";
    }
    if (text.includes("select") || ariaLabel.includes("choose")) {
      return "dropdown";
    }

    // Default fallback
    return "short_answer";
  }

  /**
   * Generate stable selector for an element
   */
  static generateSelector(element: HTMLElement): string {
    // Priority 1: data-question-id or data-item-id
    const questionId = element.getAttribute("data-question-id");
    if (questionId) return `[data-question-id="${questionId}"]`;

    const itemId = element.getAttribute("data-item-id");
    if (itemId) return `[data-item-id="${itemId}"]`;

    // Priority 2: id attribute
    const id = element.id;
    if (id && !id.includes("tmp")) return `#${id}`;

    // Priority 3: name attribute (for form elements)
    const name = element.getAttribute("name");
    if (name) return `[name="${name}"]`;

    // Priority 4: aria-label (case-insensitive match)
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) {
      return `[aria-label="${this.escapeSelector(ariaLabel)}"]`;
    }

    // Priority 5: Build path from parent + specific attributes
    return this.buildRelativeSelector(element);
  }

  /**
   * Extract stable attributes from element for fallback matching
   */
  static extractStableAttributes(element: HTMLElement): Record<string, string> {
    return {
      elementId: element.id || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      dataQuestionId: element.getAttribute("data-question-id") || "",
      dataItemId: element.getAttribute("data-item-id") || "",
      name: element.getAttribute("name") || "",
      dataQuestionType: element.getAttribute("data-question-type") || "",
      role: element.getAttribute("role") || "",
      type: element.getAttribute("type") || "",
    };
  }

  /**
   * Fuzzy match question text (case-insensitive, substring)
   */
  static fuzzyMatchText(
    sourceText: string,
    targetTexts: string[]
  ): string | null {
    const normalized = sourceText.toLowerCase().trim();

    // Exact match first
    for (const target of targetTexts) {
      if (target.toLowerCase() === normalized) return target;
    }

    // Substring match
    for (const target of targetTexts) {
      const targetLower = target.toLowerCase();
      if (
        normalized.includes(targetLower) ||
        targetLower.includes(normalized)
      ) {
        return target;
      }
    }

    // Levenshtein-like rough match (>70% similarity)
    let bestMatch = null;
    let bestScore = 0;
    for (const target of targetTexts) {
      const score = this.stringSimilarity(normalized, target.toLowerCase());
      if (score > bestScore && score > 0.7) {
        bestScore = score;
        bestMatch = target;
      }
    }

    return bestMatch;
  }

  /**
   * Create a mapping from a form element
   */
  static createMapping(
    element: HTMLElement,
    questionIndex: number
  ): QuestionMapping {
    const type = this.detectQuestionType(element);
    const selector = this.generateSelector(element);
    const label = this.extractLabel(element);
    const id = element.getAttribute("data-question-id") || `q-${questionIndex}`;

    const mapping: QuestionMapping = {
      id,
      label,
      type,
      selector,
      elementId: element.id || undefined,
      ariaLabel: element.getAttribute("aria-label") || undefined,
      dataAttributes: this.extractDataAttributes(element),
      textContent: element.textContent?.substring(0, 200) || undefined,
    };

    // Extract options for choice questions
    if (type === "radio" || type === "checkbox" || type === "dropdown") {
      const options = this.extractOptions(element, type);
      if (options.length > 0) mapping.options = options;
    }

    // Extract grid structure for grid questions
    if (type === "grid_radio" || type === "grid_checkbox") {
      const grid = this.extractGridStructure(element);
      if (grid) {
        mapping.gridRows = grid.rows;
        mapping.gridColumns = grid.columns;
      }
    }

    return mapping;
  }

  /**
   * Find all questions in the current form
   */
  static findAllQuestions(doc: Document = document): HTMLElement[] {
    const selectors = [
      "[data-question-id]",
      "[role='textbox']",
      "[role='radio']",
      "[role='checkbox']",
      "[role='listbox']",
      "[role='presentation'] [role='radio']",
      "[role='presentation'] [role='checkbox']",
      "input[type='file']",
      "input[type='date']",
      "input[type='time']",
      "textarea",
      "select",
    ];

    const elements = new Set<HTMLElement>();

    for (const selector of selectors) {
      try {
        doc.querySelectorAll(selector).forEach((el) => {
          if (el instanceof HTMLElement) elements.add(el);
        });
      } catch (e) {
        // Invalid selector, skip
      }
    }

    return Array.from(elements);
  }

  /**
   * Private helper: extract label from element
   */
  private static extractLabel(element: HTMLElement): string {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel;

    const label = element.getAttribute("placeholder") || element.textContent;
    return label?.trim().substring(0, 100) || "Untitled Question";
  }

  /**
   * Private helper: extract data-* attributes
   */
  private static extractDataAttributes(element: HTMLElement): Record<
    string,
    string
  > {
    const attrs: Record<string, string> = {};
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-")) {
        attrs[attr.name] = attr.value;
      }
    });
    return attrs;
  }

  /**
   * Private helper: extract options from choice elements
   */
  private static extractOptions(
    element: HTMLElement,
    type: QuestionType
  ): string[] {
    const options: string[] = [];

    if (type === "dropdown") {
      const optElements = element.querySelectorAll("[role='option']");
      optElements.forEach((opt) => {
        const text = opt.textContent?.trim();
        if (text) options.push(text);
      });
    } else if (type === "radio" || type === "checkbox") {
      const labelElements = element.querySelectorAll(
        "label, [role='option'], span[role='presentation']"
      );
      labelElements.forEach((label) => {
        const text = label.textContent?.trim();
        if (text && !options.includes(text)) options.push(text);
      });
    }

    return options;
  }

  /**
   * Private helper: extract grid structure
   */
  private static extractGridStructure(element: HTMLElement): {
    rows: string[];
    columns: string[];
  } | null {
    const container = element.closest("[role='presentation']");
    if (!container) return null;

    const rows: Set<string> = new Set();
    const columns: Set<string> = new Set();

    // Find row headers
    container.querySelectorAll("[role='rowheader']").forEach((cell) => {
      const text = cell.textContent?.trim();
      if (text) rows.add(text);
    });

    // Find column headers
    container.querySelectorAll("[role='columnheader']").forEach((cell) => {
      const text = cell.textContent?.trim();
      if (text) columns.add(text);
    });

    return {
      rows: Array.from(rows),
      columns: Array.from(columns),
    };
  }

  /**
   * Private helper: escape CSS selector special chars
   */
  private static escapeSelector(str: string): string {
    return str.replace(/["\\]/g, "\\$&");
  }

  /**
   * Private helper: calculate string similarity (Sørensen–Dice coefficient)
   */
  private static stringSimilarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (2.0 * (longer.length - editDistance)) / (2.0 * longer.length);
  }

  /**
   * Private helper: calculate Levenshtein distance
   */
  private static levenshteinDistance(a: string, b: string): number {
    const costs = [];
    for (let i = 0; i <= a.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= b.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (a.charAt(i - 1) !== b.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[b.length] = lastValue;
    }
    return costs[b.length];
  }

  /**
   * Private helper: build relative selector for fallback
   */
  private static buildRelativeSelector(element: HTMLElement): string {
    const parts: string[] = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id && !current.id.includes("tmp")) {
        selector += `#${current.id}`;
        parts.unshift(selector);
        break;
      }

      if (current.className) {
        const classes = current.className
          .split(" ")
          .filter((c) => !c.includes("tmp"));
        if (classes.length > 0) {
          selector += "." + classes.join(".");
        }
      }

      const attrs = current.getAttribute("data-question-id") ||
        current.getAttribute("aria-label") || "";
      if (typeof attrs === "string" && attrs) {
        selector += `[aria-label*="${attrs.substring(0, 20)}"]`;
      }

      parts.unshift(selector);
      current = current.parentElement as HTMLElement;
    }

    return parts.join(" > ");
  }
}
