# GFormTasker-Clone

A production-ready Chrome extension (Manifest V3) for automating Google Forms submissions with advanced features like preset management, randomization, batch processing, and detailed logging.

## Overview

**GFormTasker-Clone** enables efficient batch automation of Google Forms with the following capabilities:

- **Record Mode**: Capture question mappings and answers from a form by filling it once
- **Presets**: Save and manage named answer presets with randomization rules
- **Batch Submission**: Submit forms multiple times with configurable delays and jitter
- **Randomization**: Support for fixed values, random picks, numeric ranges, regex patterns, probability distributions, and custom JS expressions
- **Multiple Question Types**: Handles text, email, paragraphs, radio buttons, checkboxes, dropdowns, linear scales, dates, and more
- **Live Progress**: Real-time submission tracking with progress bar and activity logs
- **Import/Export**: Backup and restore presets and settings as JSON
- **Advanced Settings**: Configure global rate limits, delays, confirmation requirements, and log levels

## Features

### Core Functionality

1. **Question Detection and Mapping**
   - Robust DOM selector generation using data attributes, aria-labels, and element IDs
   - Fuzzy-matching for question labels (case-insensitive substring and Levenshtein distance)
   - Support for all major Google Forms question types
   - Grid/matrix questions with row and column detection

2. **Answer Presets**
   - Save structured answer templates with question mappings
   - Edit, delete, and organize presets
   - Store metadata (form URL, recording timestamp)
   - Full import/export capabilities

3. **Randomization Engine**
   - **Fixed**: Use the same value every submission
   - **Pick**: Randomly select from a list of options
   - **Range**: Generate random integers within a range
   - **Regex**: Generate strings matching regex patterns (\d, \w, [a-z], *, +, {n,m})
   - **Distribution**: Uniform, normal (Box-Muller), or weighted distribution
   - **Custom JS**: Evaluate custom JavaScript expressions in a sandboxed environment with access to Math and Date

4. **Submission Control**
   - Configurable per-submission delays (min/max) with random jitter
   - Global rate limiting between submissions
   - Stop/cancel buttons with confirmation dialogs
   - Automatic "Submit another response" handling
   - Form reload fallback if confirmation page unavailable

5. **User Interface**
   - **Popup**: Quick preset selection, record button, live progress, activity logs
   - **Options Page**: Preset editor, advanced settings, selector overrides, activity log viewer, import/export
   - **Floating Recorder**: Inject UI button on Google Forms pages for recording

6. **Storage & Sync**
   - Uses `chrome.storage.sync` with automatic fallback to `chrome.storage.local` on quota exceed
   - Activity logging with configurable retention (default 1000 entries)
   - Settings persistence with sensible defaults

## Installation

### Prerequisites

- Node.js 20.x or later
- Chrome 120+ (MV3 support)
- npm or yarn

### Setup

```bash
# Clone or download the repository
cd "Google Forms Auto Filler"

# Install dependencies
npm install

# Build the extension
npm run build

# The built extension is in ./dist
```

### Load Unpacked Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `dist` folder from this project
5. GFormTasker-Clone should now appear in your extensions list

## Testing

### Unit Tests

Run all unit tests (mapping, randomization, storage logic):

```bash
npm run test
```

Run tests in watch mode:

```bash
npm run test:watch
```

View test UI:

```bash
npm run test:ui
```

### End-to-End Tests (Playwright)

The project includes a mock Google Form (`tests/fixtures/test-form.html`) covering all question types.

Run Playwright tests:

```bash
npm run test:e2e
```

This will:
1. Start a local HTTP server serving the test fixtures
2. Run Playwright against the mock form
3. Generate an HTML report in `playwright-report/`

### Manual Testing Checklist

1. **Extension Installation**
   - Load unpacked extension
   - Verify icon appears in toolbar
   - Options page opens without errors

2. **Recording Mode**
   - Navigate to a Google Form (or test form)
   - Click "Record Preset" button (floating UI or popup)
   - Fill form fields with sample data
   - Stop recording
   - Verify preset saved with correct mappings

3. **Preset Management**
   - Create multiple presets via options page
   - Edit preset name, description, and answers
   - Delete presets with confirmation
   - Export presets to JSON
   - Import presets from JSON

4. **Single Submission**
   - Select a preset from popup
   - Click "Run"
   - Verify form fills with preset answers
   - Confirm form submits and confirmation page appears

5. **Batch Submissions**
   - Configure delay (e.g., 1-2 seconds)
   - Start 3-5 submissions
   - Verify progress updates in real-time
   - Check activity log shows each submission
   - Verify "Submit another response" is clicked automatically

6. **Randomization**
   - Create preset with randomization rules:
     - Fixed value (e.g., name = "Test User")
     - Pick from list (e.g., colors = ["red", "blue"])
     - Range (e.g., count = 1-100)
     - Regex (e.g., code = "\d\d\d-\d\d\d")
   - Run multiple submissions and verify different values

7. **Settings**
   - Adjust delay min/max, jitter, rate limit
   - Toggle "Require Confirmation"
   - Change log level
   - Export activity log
   - Reset to defaults

8. **Error Handling**
   - Test stopping submission mid-run
   - Verify error logging on malformed answers
   - Check console for debug messages

## Project Structure

```
├── manifest.json              # Chrome Manifest V3
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── esbuild.config.js          # Build configuration
├── playwright.config.ts       # E2E test configuration
├── vitest.config.ts           # Unit test configuration
│
├── src/
│   ├── types/
│   │   └── extension.ts       # TypeScript types for extension state, messages, presets
│   │
│   ├── lib/
│   │   ├── mapping.ts         # DOM element detection and selector generation
│   │   ├── randomization.ts   # Value generation engine (fixed, pick, range, regex, distribution, custom JS)
│   │   ├── storage.ts         # Chrome storage management (sync + fallback)
│   │   └── run-engine.ts      # Submission orchestration and rate limiting
│   │
│   ├── background/
│   │   └── service-worker.ts  # Service worker for background operations
│   │
│   ├── content-scripts/
│   │   └── injector.ts        # Content script for form interaction (record, fill, submit)
│   │
│   ├── popup/
│   │   └── popup.ts           # Popup UI controller
│   │
│   └── options/
│       └── options.ts         # Options page controller
│
├── public/
│   ├── manifest.json          # Copied to dist/
│   ├── icons/                 # Extension icons (48x48, 128x128)
│   ├── popup/
│   │   └── popup.html         # Popup UI template
│   └── options/
│       └── options.html       # Options page template
│
├── tests/
│   ├── unit/
│   │   ├── mapping.test.ts    # Tests for MappingEngine
│   │   └── randomization.test.ts # Tests for RandomizationEngine
│   │
│   ├── e2e/
│   │   └── form-interactions.spec.ts # Playwright tests
│   │
│   └── fixtures/
│       └── test-form.html     # Mock Google Form with all question types
│
└── dist/                      # Build output (gitignored)
```

## Building for Production

1. Build the extension:

```bash
npm run build
```

2. Run tests to verify:

```bash
npm run test && npm run test:e2e
```

3. Create a zip file for submission:

```bash
# Manually: zip dist/* -r gformtasker-clone.zip
# Or use your preferred tool
```

4. Upload to Chrome Web Store (manual process, not automated)

## API & Permissions

### Manifest Permissions

- `storage`: For saving presets and settings (sync + local)
- `activeTab`: For accessing the active tab ID (not explicitly used but good practice)

### Host Permissions

- `https://docs.google.com/forms/*`: Required to interact with Google Forms

### No Remote Code Execution

This extension does NOT:
- Fetch remote code or scripts
- Make external API calls (except Chrome APIs)
- Access user accounts or credentials
- Track user behavior or analytics
- Require any external service

All code is bundled and executed locally.

## Security & Privacy

### Sandbox for Custom Expressions

Custom JS expressions are evaluated using `new Function()` with a restricted global scope:
- `Math` object available (for calculations)
- `Date` object available (for timestamps)
- No access to network, file system, or DOM
- Syntax errors are caught and logged

### Data Storage

- All data stored locally in `chrome.storage`
- No cloud sync or external services
- Users can export/import data as JSON for portability
- Users can clear all data from options page

### Permissions Justification

| Permission | Reason |
|-----------|--------|
| `storage` | Store presets, settings, and activity logs locally |
| `activeTab` | Potential future feature to read form metadata (currently unused) |
| `docs.google.com/forms/*` | Inject recording UI and fill/submit forms |

## Known Limitations

1. **File Upload Questions**
   - Cannot automatically upload files (browser security restriction)
   - Workaround: Use pattern generator to suggest filenames for manual upload

2. **Google Form DOM Changes**
   - If Google updates form HTML structure, selectors may break
   - Fallback: Use "Selector Override" in options to manually specify selectors

3. **Rate Limiting**
   - No per-IP throttling detection; use conservative delay settings
   - Google Forms may rate-limit or block rapid submissions

4. **Authentication**
   - Must be logged into Google account to view/submit forms
   - Extension cannot bypass login requirements

5. **Confirmation Page Detection**
   - Simple text matching; may fail if Google changes message text
   - Fallback: Manual "Submit another response" or page reload

6. **Grid/Matrix Questions**
   - Basic support for row/column detection
   - Complex nested grids may not parse correctly

## Ethical Use

**Important**: This extension is designed for **legitimate testing and automation** of your own forms or forms you have permission to submit.

**Do NOT use this extension to:**
- Spam or abuse Google Forms
- Circumvent form access controls
- Violate any platform's terms of service
- Impersonate users or submit fraudulent responses

**Recommended uses:**
- Testing your own survey forms
- Load testing with consent
- Bulk data entry for personal records
- Automating repetitive legitimate tasks

## Development

### Project Conventions

- **TypeScript**: Strict mode, ES2020 target
- **Code Style**: Prettier formatted, ESLint checked
- **Testing**: Vitest (unit) + Playwright (e2e)
- **Build**: esbuild for fast bundling

### Available Scripts

```bash
npm run build           # Build extension (optimized)
npm run build:watch    # Build with file watching
npm run test           # Run unit tests
npm run test:watch     # Run tests in watch mode
npm run test:ui        # View test UI dashboard
npm run test:e2e       # Run Playwright e2e tests
npm run test:all       # Run all tests
npm run lint           # Run ESLint
npm run format         # Format code with Prettier
npm run type-check     # Check TypeScript types
```

### Contributing

To add new features:

1. Create a branch: `git checkout -b feature/my-feature`
2. Make changes and add tests
3. Run `npm run test && npm run test:e2e` to verify
4. Commit with descriptive messages
5. Create a PR with a detailed description

## Troubleshooting

### Extension doesn't appear in Chrome

- Ensure you built with `npm run build`
- Check that you selected the `dist` folder when loading unpacked
- Reload the extension from `chrome://extensions/`

### Recording mode not working

- Verify you are on a Google Forms page (`docs.google.com/forms/...`)
- Check console for errors (right-click → Inspect)
- Ensure content script is injected (should see floating "Record" button)

### Submissions not filling correctly

- Check the selectors in the preset (edit → view question mappings)
- Use "Selector Override" in options to manually specify CSS selectors
- Check activity log for error messages

### Tests fail to run

- Ensure jsdom is installed: `npm install -D jsdom`
- Clear cache: `rm -rf node_modules dist; npm install`
- Rebuild: `npm run build`

## License

MIT

## Disclaimer

This extension is provided as-is for educational and personal use. Users are responsible for ensuring they have proper authorization to submit forms and comply with all applicable laws and platform terms of service. The creators assume no liability for misuse.

---

**Version**: 1.0.0  
**Last Updated**: December 2025  
**Manifest Version**: 3
