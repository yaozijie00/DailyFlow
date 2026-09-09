import { create } from "zustand";

export type WorkflowTopView = "library" | "editor" | "runs";
export type WorkflowLibrarySource = "all" | "builtin" | "personal" | "favorite";
export type WorkflowRunnerStage = "variables" | "preview" | "executing" | "result";

export interface WorkflowRunnerUiState {
  templateId: string;
  runId: string | null;
  stage: WorkflowRunnerStage;
}

interface PersistedWorkflowUiState {
  view: WorkflowTopView;
  selectedTemplateId: string | null;
}

interface WorkflowUiState extends PersistedWorkflowUiState {
  search: string;
  source: WorkflowLibrarySource;
  tag: string | null;
  runner: WorkflowRunnerUiState | null;
  navigate: (view: WorkflowTopView) => void;
  openEditor: (templateId: string) => void;
  openRunner: (templateId: string) => void;
  setSearch: (search: string) => void;
  setSource: (source: WorkflowLibrarySource) => void;
  setTag: (tag: string | null) => void;
  setRunnerStage: (stage: WorkflowRunnerStage, runId?: string | null) => void;
  closeRunner: () => void;
  reset: () => void;
}

const STORAGE_KEY = "dailyflow.workflow.ui.v2";
const DEFAULT_PERSISTED: PersistedWorkflowUiState = { view: "library", selectedTemplateId: null };

function readPersisted(): PersistedWorkflowUiState {
  if (typeof localStorage === "undefined") return DEFAULT_PERSISTED;
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<PersistedWorkflowUiState> | null;
    const view = value?.view;
    return {
      view: view === "editor" || view === "runs" || view === "library" ? view : "library",
      selectedTemplateId:
        typeof value?.selectedTemplateId === "string" ? value.selectedTemplateId : null,
    };
  } catch {
    return DEFAULT_PERSISTED;
  }
}

function persist(value: PersistedWorkflowUiState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

const initial = readPersisted();

export const useWorkflowUiStore = create<WorkflowUiState>((set, get) => ({
  ...initial,
  search: "",
  source: "all",
  tag: null,
  runner: null,

  navigate: (view) => {
    const next = { view, selectedTemplateId: get().selectedTemplateId };
    persist(next);
    set({ view });
  },
  openEditor: (selectedTemplateId) => {
    persist({ view: "editor", selectedTemplateId });
    set({ view: "editor", selectedTemplateId, runner: null });
  },
  openRunner: (templateId) => {
    set({ runner: { templateId, runId: null, stage: "variables" } });
  },
  setSearch: (search) => set({ search }),
  setSource: (source) => set({ source }),
  setTag: (tag) => set({ tag }),
  setRunnerStage: (stage, runId) => {
    const runner = get().runner;
    if (!runner) return;
    set({ runner: { ...runner, stage, ...(runId !== undefined ? { runId } : {}) } });
  },
  closeRunner: () => set({ runner: null }),
  reset: () => {
    persist(DEFAULT_PERSISTED);
    set({
      ...DEFAULT_PERSISTED,
      search: "",
      source: "all",
      tag: null,
      runner: null,
    });
  },
}));

export const workflowUiStorageKey = STORAGE_KEY;
