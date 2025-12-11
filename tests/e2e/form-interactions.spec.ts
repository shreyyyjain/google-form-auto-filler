/**
 * End-to-end tests using Playwright
 * Tests form recording, filling, and submission flows
 */

import { test, expect } from "@playwright/test";

test.describe("GFormTasker-Clone E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to test form
    await page.goto("http://localhost:3000/test-form.html");
  });

  test("should load test form with all question types", async ({ page }) => {
    // Check for form title
    const title = page.locator("text=GFormTasker Test Form");
    await expect(title).toBeVisible();

    // Check for all question types
    const textInput = page.locator('input[data-question-id="q1"]');
    const emailInput = page.locator('input[data-question-id="q2"]');
    const textarea = page.locator('textarea[data-question-id="q3"]');
    const radioGroup = page.locator('div.radio-group[data-question-id="q4"]');
    const checkboxGroup = page.locator('div.checkbox-group[data-question-id="q5"]');
    const dropdown = page.locator('select[data-question-id="q6"]');
    const dateInput = page.locator('input[data-question-id="q8"]');
    const submitBtn = page.locator("button.submit-btn");

    await expect(textInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(textarea).toBeVisible();
    await expect(radioGroup).toBeVisible();
    await expect(checkboxGroup).toBeVisible();
    await expect(dropdown).toBeVisible();
    await expect(dateInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
  });

  test("should fill text input and submit form", async ({ page }) => {
    // Fill short answer
    const textInput = page.locator('input[data-question-id="q1"]');
    await textInput.fill("John Doe");

    // Submit
    const submitBtn = page.locator("button.submit-btn");
    await submitBtn.click();

    // Check for confirmation page
    const confirmation = page.locator("text=Your response has been recorded");
    await expect(confirmation).toBeVisible();
  });

  test("should fill all question types and submit", async ({ page }) => {
    // Short answer
    await page.locator('input[data-question-id="q1"]').fill("Alice Smith");

    // Email
    await page.locator('input[data-question-id="q2"]').fill("alice@example.com");

    // Paragraph
    await page
      .locator('textarea[data-question-id="q3"]')
      .fill("I am a software engineer with 5 years of experience.");

    // Radio button
    await page.locator('input[name="q4"][value="Advanced"]').check();

    // Checkboxes
    await page.locator('input[value="JavaScript"]').check();
    await page.locator('input[value="Python"]').check();

    // Dropdown
    await page.locator('select[data-question-id="q6"]').selectOption("React");

    // Linear scale
    await page.locator('input[name="q7"][value="4"]').check();

    // Date
    await page.locator('input[data-question-id="q8"]').fill("1990-01-15");

    // Submit
    await page.locator("button.submit-btn").click();

    // Verify confirmation
    const confirmation = page.locator("text=Your response has been recorded");
    await expect(confirmation).toBeVisible();
  });

  test("should handle radio button selection", async ({ page }) => {
    const radio = page.locator('input[name="q4"][value="Intermediate"]');
    await radio.check();

    const checked = await radio.isChecked();
    expect(checked).toBe(true);
  });

  test("should handle checkbox multiple selection", async ({ page }) => {
    const js = page.locator('input[value="JavaScript"]');
    const python = page.locator('input[value="Python"]');
    const java = page.locator('input[value="Java"]');

    await js.check();
    await python.check();

    expect(await js.isChecked()).toBe(true);
    expect(await python.isChecked()).toBe(true);
    expect(await java.isChecked()).toBe(false);
  });

  test("should handle dropdown selection", async ({ page }) => {
    const dropdown = page.locator('select[data-question-id="q6"]');
    await dropdown.selectOption("Vue");

    const selected = await dropdown.inputValue();
    expect(selected).toBe("Vue");
  });

  test("should handle date input", async ({ page }) => {
    const dateInput = page.locator('input[data-question-id="q8"]');
    await dateInput.fill("2000-12-25");

    const value = await dateInput.inputValue();
    expect(value).toBe("2000-12-25");
  });

  test("should submit another response from confirmation page", async ({
    page,
  }) => {
    // Fill and submit first
    await page.locator('input[data-question-id="q1"]').fill("Test User");
    await page.locator("button.submit-btn").click();

    // Wait for confirmation
    await expect(
      page.locator("text=Your response has been recorded")
    ).toBeVisible();

    // Click submit another
    const submitAnotherBtn = page.locator("text=Submit another response");
    await submitAnotherBtn.click();

    // Form should be reset and visible
    const formContent = page.locator("#formContent");
    await expect(formContent).toBeVisible();

    const textInput = page.locator('input[data-question-id="q1"]');
    const value = await textInput.inputValue();
    expect(value).toBe("");
  });

  test("should handle form reset on submit another", async ({ page }) => {
    // Fill form
    await page.locator('input[data-question-id="q1"]').fill("First Response");
    await page.locator('input[value="Beginner"]').check();

    // Submit
    await page.locator("button.submit-btn").click();
    await expect(
      page.locator("text=Your response has been recorded")
    ).toBeVisible();

    // Submit another
    await page.locator("text=Submit another response").click();

    // Verify form is cleared
    const nameInput = page.locator('input[data-question-id="q1"]');
    const radioChecked = page.locator('input[value="Beginner"]');

    const nameValue = await nameInput.inputValue();
    const isChecked = await radioChecked.isChecked();

    expect(nameValue).toBe("");
    expect(isChecked).toBe(false);
  });

  test("should preserve form state while filling", async ({ page }) => {
    // Fill multiple fields
    const nameInput = page.locator('input[data-question-id="q1"]');
    const emailInput = page.locator('input[data-question-id="q2"]');

    await nameInput.fill("Bob Johnson");
    await emailInput.fill("bob@example.com");

    // Verify values persist
    let name = await nameInput.inputValue();
    let email = await emailInput.inputValue();

    expect(name).toBe("Bob Johnson");
    expect(email).toBe("bob@example.com");

    // Update one field
    await nameInput.fill("Bob Smith");

    // Verify both still have correct values
    name = await nameInput.inputValue();
    email = await emailInput.inputValue();

    expect(name).toBe("Bob Smith");
    expect(email).toBe("bob@example.com");
  });

  test("should handle scale selection correctly", async ({ page }) => {
    // Select middle value
    await page.locator('input[name="q7"][value="3"]').check();

    const checked = await page
      .locator('input[name="q7"][value="3"]')
      .isChecked();
    expect(checked).toBe(true);

    // Switch to different value
    await page.locator('input[name="q7"][value="5"]').check();

    const prev = await page
      .locator('input[name="q7"][value="3"]')
      .isChecked();
    const current = await page
      .locator('input[name="q7"][value="5"]')
      .isChecked();

    expect(prev).toBe(false);
    expect(current).toBe(true);
  });
});
