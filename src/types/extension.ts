/**
 * Core type definitions for GFormTasker-Clone extension
 */

export type QuestionType =
  | "short_answer"
  | "paragraph"
  | "radio"
  | "checkbox"
  | "dropdown"
  | "linear_scale"
  | "date"
  | "time"
  | "file_upload"
  | "grid_checkbox"
  | "grid_radio";

export type RandomizationType =
  | "fixed"
  | "pick"
  | "range"
  | "regex"
  | "distribution"
  | "custom_js";

export interface RandomizationConfig {
  type: RandomizationType;
  value?: unknown;
  options?: unknown[];
  min?: number;
  max?: number;
  pattern?: string;
  distribution?: "uniform" | "normal" | "weighted";
  weights?: Record<string, number>;
  expression?: string;
}

export interface QuestionMapping {
  id: string;
  label: string;
  type: QuestionType;
  selector?: string;
  elementId?: string;
  ariaLabel?: string;
  dataAttributes?: Record<string, string>;
  textContent?: string;
  options?: string[];
  gridRows?: string[];
  gridColumns?: string[];
}

export interface PresetAnswer {
  questionId: string;
  randomization: RandomizationConfig;
}

export interface Preset {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  answers: PresetAnswer[];
  questionMappings: QuestionMapping[];
  metadata?: {
    formUrl?: string;
    formTitle?: string;
    recordedAt?: number;
  };
}

export interface SubmissionConfig {
  presetId: string;
  count: number;
  delayMin: number;
  delayMax: number;
  jitter: number;
  rateLimit?: number;
  stopOnError?: boolean;
  confirmBeforeStart?: boolean;
}

export interface SubmissionProgress {
  totalSubmissions: number;
  completedSubmissions: number;
  failedSubmissions: number;
  isRunning: boolean;
  currentSubmissionIndex: number;
  lastSubmissionTime?: number;
  estimatedTimeRemaining?: number;
  errors: SubmissionError[];
}

export interface SubmissionError {
  submissionIndex: number;
  questionId: string;
  message: string;
  timestamp: number;
}

export interface ActivityLogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  context?: Record<string, unknown>;
}

export interface ExtensionState {
  presets: Preset[];
  activeSubmissionProgress?: SubmissionProgress;
  activityLog: ActivityLogEntry[];
  settings: ExtensionSettings;
}

export interface ExtensionSettings {
  globalRateLimit: number;
  defaultDelayMin: number;
  defaultDelayMax: number;
  defaultJitter: number;
  requireConfirmation: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  maxActivityLogEntries: number;
  customSelectorOverrides: Record<string, string>;
}

export interface RecordingState {
  isRecording: boolean;
  presetName: string;
  capturedAnswers: Array<{
    questionId: string;
    value: unknown;
    mapping: QuestionMapping;
  }>;
}

export interface ContentScriptMessage {
  type:
    | "start_recording"
    | "stop_recording"
    | "fill_and_submit"
    | "submit_form"
    | "question_detected"
    | "answer_captured"
    | "form_ready";
  payload?: any;
}

export interface BackgroundServiceMessage {
  type:
    | "create_preset"
    | "update_preset"
    | "delete_preset"
    | "start_submission"
    | "stop_submission"
    | "get_presets"
    | "get_progress"
    | "log_activity";
  payload?: any;
}
