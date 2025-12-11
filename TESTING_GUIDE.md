# Testing Guide for GFormTasker-Clone

## Quick Start Testing

### 1. Build and Load Extension
```bash
npm run build
```

Then:
1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `dist/` folder
6. Look for "GFormTasker-Clone" in the list

### 2. Test on Localhost Form
```bash
npm run test:serve
```

Then open: `http://localhost:4173/test-fixtures/test-form.html`

### 3. What to Test

#### A. Panel Appears
- [ ] GFormTasker panel visible in bottom-right
- [ ] Panel has purple gradient header
- [ ] Panel shows: Submissions, Interval Min, Interval Max fields
- [ ] Minimize button (−) works
- [ ] Panel is draggable by header

#### B. Question Detection
After 1 second, check each question has:
- [ ] Fixed/Random toggle below it
- [ ] Fixed is selected by default
- [ ] Toggle is inside a gray box with purple left border

#### C. Text Questions (Short Answer, Paragraph)
Switch to Random:
- [ ] Text input appears with placeholder "Value1<and>Value2<and>Value3"
- [ ] Can type: `Apple<and>Banana<and>Cherry`
- [ ] Value persists after page refresh (sessionStorage)

#### D. Multiple Choice (Radio)
Switch to Random:
- [ ] Probability sliders appear for each option
- [ ] Sliders show current percentage (e.g., "Option A: 33%")
- [ ] Moving slider updates percentage label
- [ ] Sliders default to equal distribution

#### E. Checkboxes
Switch to Random:
- [ ] Probability sliders appear for each checkbox
- [ ] Same behavior as radio buttons

#### F. Dropdown
Switch to Random:
- [ ] Probability sliders appear for each option
- [ ] Same behavior as radio buttons

#### G. Scale (Linear Scale)
Switch to Random:
- [ ] Probability sliders appear for each scale value (e.g., 1, 2, 3, 4, 5)
- [ ] Can adjust weights for each number

#### H. Date
Switch to Random:
- [ ] Two date inputs appear: Min and Max
- [ ] Can select date range
- [ ] Valid date format (YYYY-MM-DD)

#### I. Panel Configuration
- [ ] Submissions: Can set to 1, 5, 10, etc.
- [ ] Interval Min: Can set to 0, 1, 2, etc. seconds
- [ ] Interval Max: Can set to 1, 5, 10, etc. seconds
- [ ] Values persist after minimize/expand

#### J. Submit Interception
1. Configure some questions to Random
2. Set Submissions to 3
3. Set Interval to 2-3 seconds
4. Click form's **Submit** button
5. Check console (F12):
   - [ ] Logs "Starting 3 submissions..."
   - [ ] Logs each submission: "Submission 1/3", "Submission 2/3", "Submission 3/3"
   - [ ] Logs waiting times
   - [ ] Logs "All submissions complete!"

#### K. Random Value Application
For Random questions:
- [ ] Text: Different value from `<and>` list each time
- [ ] MCQ: Different option based on probabilities
- [ ] Scale: Different number based on probabilities
- [ ] Date: Random date within range

For Fixed questions:
- [ ] Value stays the same across submissions

#### L. Multi-Submission Flow
- [ ] Form submits automatically
- [ ] Waits between submissions
- [ ] Clicks "Submit another response" automatically
- [ ] Form resets and fills again
- [ ] Repeats N times

### 4. Test on Real Google Form

Create a test form at https://docs.google.com/forms:

1. Add questions of each type:
   - Short answer
   - Paragraph
   - Multiple choice
   - Checkboxes
   - Dropdown
   - Linear scale
   - Date

2. Load the extension

3. Open your test form

4. Verify all features work

5. Submit 5 times with 3-5 second intervals

6. Check form responses to verify randomization worked

## Common Issues

### Panel Doesn't Appear
- Check if on Google Forms domain or localhost
- Check console for errors (F12)
- Verify content script loaded: `chrome-extension://...content-script.js`

### Questions Not Detected
- Wait 1-2 seconds after page load
- Check console: "Detected X questions"
- Google Forms may have changed structure

### Submit Button Not Intercepted
- Make sure clicking the actual submit button (not other buttons)
- Check console for intercept logs
- Try clicking directly on button (not icon inside)

### Random Values Not Applied
- Check if question is set to Random (not Fixed)
- For text: verify `<and>` separator syntax
- For MCQ: verify probabilities add up
- For date: verify valid date range

### "Submit Another" Not Working
- Check if link text contains "submit another" or "another response"
- Google Forms may use different text in other languages
- Check console for errors

## Debug Mode

Open console (F12) and look for logs:
- `📝 Detected X questions` - Questions found
- `🚀 Starting N submissions...` - Multi-submit started
- `📝 Submission X/N` - Current submission
- `⏳ Waiting Xs...` - Interval wait
- `✅ All submissions complete!` - Done

## Unit Tests

Run tests:
```bash
npm test
```

Expected:
- ✅ 20 mapping tests pass
- ✅ 23 randomization tests pass
- ✅ Total: 43 tests pass

## E2E Tests (Currently Outdated)

E2E tests need updates for new workflow:
```bash
npm run test:e2e
```

Tests currently check old recording workflow and will fail. They need to be rewritten for inline controls.

## Performance Testing

1. Test with large forms (20+ questions)
   - [ ] Panel loads within 2 seconds
   - [ ] Controls inject within 2 seconds
   - [ ] No lag when toggling Fixed/Random

2. Test with many submissions (50+)
   - [ ] No memory leaks
   - [ ] Consistent timing
   - [ ] No crashes

3. Test with long text values
   - [ ] Handles 100+ character strings
   - [ ] Multiple `<and>` separators (10+ options)

## Accessibility Testing

- [ ] Can navigate with keyboard (Tab)
- [ ] Can toggle Fixed/Random with keyboard
- [ ] Can adjust sliders with arrow keys
- [ ] Screen reader compatible (aria labels)

## Browser Compatibility

Test on:
- [ ] Chrome (latest)
- [ ] Chrome (1-2 versions back)
- [ ] Edge (Chromium-based)

---

**Report Issues**: Any bugs or unexpected behavior should be documented with:
1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Browser version
5. Console errors (if any)
