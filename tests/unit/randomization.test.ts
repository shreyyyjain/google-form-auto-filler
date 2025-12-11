/**
 * Unit tests for randomization engine
 */

import { describe, it, expect } from "vitest";
import { RandomizationEngine } from "../../src/lib/randomization";
import type { RandomizationConfig } from "../../src/types/extension";

describe("RandomizationEngine", () => {
  describe("generate", () => {
    it("should generate fixed values", () => {
      const config: RandomizationConfig = {
        type: "fixed",
        value: "test value",
      };

      const result = RandomizationEngine.generate(config);
      expect(result).toBe("test value");
    });

    it("should pick from list", () => {
      const options = ["a", "b", "c"];
      const config: RandomizationConfig = {
        type: "pick",
        options,
      };

      const result = RandomizationEngine.generate(config);
      expect(options).toContain(result);
    });

    it("should generate range", () => {
      const config: RandomizationConfig = {
        type: "range",
        min: 1,
        max: 10,
      };

      const result = RandomizationEngine.generate(config);
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(10);
    });
  });

  describe("generatePick", () => {
    it("should pick a single item from list", () => {
      const options = ["x", "y", "z"];
      const result = RandomizationEngine.generatePick(options);

      expect(options).toContain(result);
    });

    it("should return null for empty list", () => {
      const result = RandomizationEngine.generatePick([]);
      expect(result).toBeNull();
    });

    it("should work with different types", () => {
      const options: unknown[] = [1, "two", true, null];
      const result = RandomizationEngine.generatePick(options);

      expect(options).toContain(result);
    });
  });

  describe("generateRange", () => {
    it("should generate number in range", () => {
      for (let i = 0; i < 10; i++) {
        const result = RandomizationEngine.generateRange(5, 15);
        expect(result).toBeGreaterThanOrEqual(5);
        expect(result).toBeLessThanOrEqual(15);
      }
    });

    it("should work with same min and max", () => {
      const result = RandomizationEngine.generateRange(5, 5);
      expect(result).toBe(5);
    });

    it("should work with negative numbers", () => {
      const result = RandomizationEngine.generateRange(-10, -5);
      expect(result).toBeGreaterThanOrEqual(-10);
      expect(result).toBeLessThanOrEqual(-5);
    });
  });

  describe("generateFromRegex", () => {
    it("should generate digits with \\d", () => {
      const result = RandomizationEngine.generateFromRegex("\\d\\d\\d");
      expect(result).toHaveLength(3);
      expect(/^\d{3}$/.test(result)).toBe(true);
    });

    it("should generate from character set", () => {
      const result = RandomizationEngine.generateFromRegex("[a-z]");
      expect(/^[a-z]$/.test(result)).toBe(true);
    });

    it("should handle mixed patterns", () => {
      const result = RandomizationEngine.generateFromRegex("id-\\d\\d\\d");
      expect(result.startsWith("id-")).toBe(true);
    });
  });

  describe("generateFromDistribution", () => {
    it("should use uniform distribution by default", () => {
      const config: RandomizationConfig = {
        type: "distribution",
        options: ["a", "b", "c"],
        distribution: "uniform",
      };

      const result = RandomizationEngine.generateFromDistribution(config);
      expect(["a", "b", "c"]).toContain(result);
    });

    it("should handle normal distribution", () => {
      const options = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const results = [];

      for (let i = 0; i < 30; i++) {
        const config: RandomizationConfig = {
          type: "distribution",
          options,
          distribution: "normal",
        };
        results.push(RandomizationEngine.generateFromDistribution(config));
      }

      // Should have variety of values
      expect(new Set(results).size).toBeGreaterThan(1);
    });

    it("should use weighted distribution", () => {
      const config: RandomizationConfig = {
        type: "distribution",
        options: ["rare", "common"],
        distribution: "weighted",
        weights: {
          rare: 0.1,
          common: 0.9,
        },
      };

      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(
          RandomizationEngine.generateFromDistribution(config)
        );
      }

      const commonCount = results.filter((r) => r === "common").length;
      expect(commonCount).toBeGreaterThan(results.length * 0.7);
    });
  });

  describe("evaluateCustomExpression", () => {
    it("should evaluate simple JS expression", () => {
      const result = RandomizationEngine.evaluateCustomExpression("1 + 2");
      expect(result).toBe(3);
    });

    it("should support Math functions", () => {
      const result = RandomizationEngine.evaluateCustomExpression(
        "Math.floor(Math.random() * 10)"
      );
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(10);
    });

    it("should support string expressions", () => {
      const result = RandomizationEngine.evaluateCustomExpression(
        "'prefix-' + Math.random().toString().substring(2, 5)"
      ) as string;
      expect(typeof result).toBe("string");
      expect(result.startsWith("prefix-")).toBe(true);
    });

    it("should return null on error", () => {
      const result = RandomizationEngine.evaluateCustomExpression(
        "undefined_variable"
      );
      expect(result).toBeNull();
    });
  });

  describe("validateConfig", () => {
    it("should validate fixed config", () => {
      const config: RandomizationConfig = {
        type: "fixed",
        value: "test",
      };

      const result = RandomizationEngine.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject pick without options", () => {
      const config: RandomizationConfig = {
        type: "pick",
        options: [],
      };

      const result = RandomizationEngine.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject range with invalid bounds", () => {
      const config: RandomizationConfig = {
        type: "range",
        min: 10,
        max: 5,
      };

      const result = RandomizationEngine.validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("should validate regex pattern", () => {
      const config: RandomizationConfig = {
        type: "regex",
        pattern: "\\d+",
      };

      const result = RandomizationEngine.validateConfig(config);
      expect(result.valid).toBe(true);
    });
  });
});
