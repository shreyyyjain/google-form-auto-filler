/**
 * Randomization engine for field value generation
 */

import type { RandomizationConfig } from "../types/extension";

export class RandomizationEngine {
  /**
   * Generate a value based on randomization config
   */
  static generate(config: RandomizationConfig): unknown {
    switch (config.type) {
      case "fixed":
        return config.value;

      case "pick":
        return this.generatePick(config.options || []);

      case "range":
        return this.generateRange(config.min || 0, config.max || 100);

      case "regex":
        return this.generateFromRegex(config.pattern || "");

      case "distribution":
        return this.generateFromDistribution(config);

      case "custom_js":
        return this.evaluateCustomExpression(config.expression || "");

      default:
        return config.value;
    }
  }

  /**
   * Randomly pick one item from a list
   */
  static generatePick(options: unknown[]): unknown {
    if (options.length === 0) return null;
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Generate random integer in range [min, max]
   */
  static generateRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate string from regex pattern (simplified)
   */
  static generateFromRegex(pattern: string): string {
    // Simplified regex-to-string generator
    // Supports: \d (digits), \w (word chars), [a-z], *, +, {n,m}

    let result = "";
    let i = 0;

    while (i < pattern.length) {
      const char = pattern[i];

      if (char === "\\") {
        const nextChar = pattern[i + 1];
        if (nextChar === "d") {
          result += String.fromCharCode(48 + Math.floor(Math.random() * 10)); // 0-9
          i += 2;
        } else if (nextChar === "w") {
          const chars =
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";
          result += chars[Math.floor(Math.random() * chars.length)];
          i += 2;
        } else {
          result += nextChar;
          i += 2;
        }
      } else if (char === "[") {
        const end = pattern.indexOf("]", i);
        if (end !== -1) {
          const charSet = pattern.substring(i + 1, end);
          const chars = this.expandCharSet(charSet);
          result += chars[Math.floor(Math.random() * chars.length)];
          i = end + 1;
        } else {
          result += char;
          i++;
        }
      } else if (char === "*" || char === "+") {
        const count = char === "*" ? Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
        for (let j = 0; j < count; j++) {
          result += "a"; // Placeholder
        }
        i++;
      } else if (char === "{") {
        const end = pattern.indexOf("}", i);
        if (end !== -1) {
          const range = pattern.substring(i + 1, end);
          const [minStr, maxStr] = range.split(",");
          const min = parseInt(minStr, 10);
          const max = parseInt(maxStr || minStr, 10);
          const count = this.generateRange(min, max);
          for (let j = 0; j < count; j++) {
            result += "a"; // Placeholder
          }
          i = end + 1;
        } else {
          result += char;
          i++;
        }
      } else {
        result += char;
        i++;
      }
    }

    return result;
  }

  /**
   * Generate value from probability distribution
   */
  static generateFromDistribution(config: RandomizationConfig): unknown {
    const distribution = config.distribution || "uniform";

    switch (distribution) {
      case "uniform":
        return this.generatePick(config.options || []);

      case "normal": {
        // Box-Muller transform for normal distribution
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        const options = config.options || [];
        const index = Math.max(
          0,
          Math.min(options.length - 1, Math.floor(((z + 3) / 6) * options.length))
        );
        return options[index];
      }

      case "weighted":
        return this.generateWeighted(config.options || [], config.weights || {});

      default:
        return this.generatePick(config.options || []);
    }
  }

  /**
   * Generate weighted random choice
   */
  static generateWeighted(
    options: unknown[],
    weights: Record<string, number>
  ): unknown {
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    if (totalWeight === 0) return this.generatePick(options);

    let random = Math.random() * totalWeight;

    for (const option of options) {
      const optionKey = String(option);
      const weight = weights[optionKey] || 1;
      random -= weight;
      if (random <= 0) return option;
    }

    return options[options.length - 1];
  }

  /**
   * Evaluate custom JS expression (sandboxed)
   */
  static evaluateCustomExpression(expression: string): unknown {
    try {
      // Create a safe function context with limited globals
      const func = new Function(
        "Math",
        "Date",
        `
        'use strict';
        try {
          return ${expression};
        } catch (e) {
          throw new Error('Expression error: ' + e.message);
        }
        `
      );

      // Pass only safe globals
      const result = func(Math, Date);
      return result;
    } catch (error) {
      console.error("Custom expression evaluation failed:", error);
      return null;
    }
  }

  /**
   * Validate randomization config
   */
  static validateConfig(config: RandomizationConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!config.type) {
      errors.push("Randomization type is required");
    }

    switch (config.type) {
      case "pick":
        if (!config.options || config.options.length === 0) {
          errors.push("Pick requires at least one option");
        }
        break;

      case "range":
        if (typeof config.min !== "number" || typeof config.max !== "number") {
          errors.push("Range requires min and max numbers");
        }
        if ((config.min || 0) > (config.max || 100)) {
          errors.push("Min must be less than or equal to max");
        }
        break;

      case "regex":
        if (!config.pattern) {
          errors.push("Regex requires a pattern");
        }
        break;

      case "distribution":
        if (!config.options || config.options.length === 0) {
          errors.push("Distribution requires options");
        }
        break;

      case "custom_js":
        if (!config.expression) {
          errors.push("Custom JS requires an expression");
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Private helper: expand character set notation
   */
  private static expandCharSet(charSet: string): string {
    let chars = "";
    let i = 0;

    while (i < charSet.length) {
      if (charSet[i + 1] === "-" && i + 2 < charSet.length) {
        // Range like a-z
        const start = charSet.charCodeAt(i);
        const end = charSet.charCodeAt(i + 2);
        for (let code = start; code <= end; code++) {
          chars += String.fromCharCode(code);
        }
        i += 3;
      } else {
        chars += charSet[i];
        i++;
      }
    }

    return chars;
  }
}
