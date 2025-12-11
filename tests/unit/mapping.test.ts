/**
 * Unit tests for mapping engine
 */

import { describe, it, expect } from "vitest";
import { MappingEngine } from "../../src/lib/mapping";
import type { QuestionType } from "../../src/types/extension";

describe("MappingEngine", () => {
  describe("detectQuestionType", () => {
    it("should detect short answer from data-question-type", () => {
      const el = document.createElement("input");
      el.setAttribute("data-question-type", "short_text");

      const type = MappingEngine.detectQuestionType(el);
      expect(type).toBe("short_answer");
    });

    it("should detect paragraph from textarea", () => {
      const el = document.createElement("textarea");
      const type = MappingEngine.detectQuestionType(el);
      expect(type).toBe("paragraph");
    });

    it("should detect radio from role attribute", () => {
      const el = document.createElement("div");
      el.setAttribute("role", "radio");

      const type = MappingEngine.detectQuestionType(el);
      expect(type).toBe("radio");
    });

    it("should detect checkbox from role attribute", () => {
      const el = document.createElement("div");
      el.setAttribute("role", "checkbox");

      const type = MappingEngine.detectQuestionType(el);
      expect(type).toBe("checkbox");
    });

    it("should detect dropdown from select element", () => {
      const el = document.createElement("select");
      const type = MappingEngine.detectQuestionType(el);
      expect(type).toBe("dropdown");
    });

    it("should detect date from input type", () => {
      const el = document.createElement("input");
      el.setAttribute("type", "date");

      const type = MappingEngine.detectQuestionType(el);
      expect(type).toBe("date");
    });

    it("should detect file upload from input type", () => {
      const el = document.createElement("input");
      el.setAttribute("type", "file");

      const type = MappingEngine.detectQuestionType(el);
      expect(type).toBe("file_upload");
    });

    it("should fallback to short_answer for unknown types", () => {
      const el = document.createElement("div");
      const type = MappingEngine.detectQuestionType(el);
      expect(type).toBe("short_answer");
    });
  });

  describe("generateSelector", () => {
    it("should prefer data-question-id", () => {
      const el = document.createElement("input");
      el.setAttribute("data-question-id", "q123");

      const selector = MappingEngine.generateSelector(el);
      expect(selector).toBe('[data-question-id="q123"]');
    });

    it("should use id as fallback", () => {
      const el = document.createElement("input");
      el.id = "my-input";

      const selector = MappingEngine.generateSelector(el);
      expect(selector).toBe("#my-input");
    });

    it("should use aria-label when no id", () => {
      const el = document.createElement("input");
      el.setAttribute("aria-label", "Name");

      const selector = MappingEngine.generateSelector(el);
      expect(selector).toContain("aria-label");
      expect(selector).toContain("Name");
    });

    it("should use name attribute for form elements", () => {
      const el = document.createElement("input");
      el.name = "username";

      const selector = MappingEngine.generateSelector(el);
      expect(selector).toBe('[name="username"]');
    });
  });

  describe("extractStableAttributes", () => {
    it("should extract all stable attributes", () => {
      const el = document.createElement("input");
      el.id = "q1";
      el.setAttribute("aria-label", "Your name");
      el.setAttribute("data-question-id", "dq1");
      el.name = "name_field";

      const attrs = MappingEngine.extractStableAttributes(el);

      expect(attrs.elementId).toBe("q1");
      expect(attrs.ariaLabel).toBe("Your name");
      expect(attrs.dataQuestionId).toBe("dq1");
      expect(attrs.name).toBe("name_field");
    });
  });

  describe("fuzzyMatchText", () => {
    it("should find exact match", () => {
      const result = MappingEngine.fuzzyMatchText("test", ["test", "other"]);
      expect(result).toBe("test");
    });

    it("should find case-insensitive match", () => {
      const result = MappingEngine.fuzzyMatchText("TEST", ["test", "other"]);
      expect(result).toBe("test");
    });

    it("should find substring match", () => {
      const result = MappingEngine.fuzzyMatchText("name", [
        "What is your name",
        "other",
      ]);
      expect(result).toBe("What is your name");
    });

    it("should return null for no match", () => {
      const result = MappingEngine.fuzzyMatchText("xyz", ["abc", "def"]);
      expect(result).toBeNull();
    });
  });

  describe("createMapping", () => {
    it("should create a basic mapping", () => {
      const el = document.createElement("input");
      el.setAttribute("data-question-id", "q1");
      el.setAttribute("aria-label", "First name");
      el.setAttribute("data-question-type", "short_text");

      const mapping = MappingEngine.createMapping(el, 0);

      expect(mapping.id).toBe("q1");
      expect(mapping.label).toBe("First name");
      expect(mapping.type).toBe("short_answer");
      expect(mapping.selector).toBeDefined();
    });

    it("should extract options for radio questions", () => {
      const container = document.createElement("div");
      container.setAttribute("data-question-id", "q1");
      container.setAttribute("data-question-type", "radio");
      container.setAttribute("role", "radio");

      const opt1 = document.createElement("label");
      opt1.textContent = "Option 1";
      const opt2 = document.createElement("label");
      opt2.textContent = "Option 2";

      container.appendChild(opt1);
      container.appendChild(opt2);

      const mapping = MappingEngine.createMapping(container, 0);

      expect(mapping.options).toContain("Option 1");
      expect(mapping.options).toContain("Option 2");
    });
  });

  describe("findAllQuestions", () => {
    it("should find all question elements", () => {
      const form = document.createElement("form");

      const q1 = document.createElement("input");
      q1.setAttribute("data-question-id", "q1");
      form.appendChild(q1);

      const q2 = document.createElement("textarea");
      q2.setAttribute("role", "textbox");
      form.appendChild(q2);

      const questions = MappingEngine.findAllQuestions(form as any);

      expect(questions.length).toBeGreaterThanOrEqual(2);
    });
  });
});
