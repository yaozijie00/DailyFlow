import type { ExtensionStorage } from "../../types";

export interface WorkflowPreferences {
  openEditorAfterCreate: boolean;
  enableCommandNodes: boolean;
  rememberNonSensitiveVariables: boolean;
  defaultFileConflict: "fail" | "skip" | "overwrite" | "rename";
}

const DEFAULT_PREFERENCES: WorkflowPreferences = {
  openEditorAfterCreate: true,
  enableCommandNodes: false,
  rememberNonSensitiveVariables: true,
  defaultFileConflict: "fail",
};

let storageRef: ExtensionStorage | null = null;
let snapshot: WorkflowPreferences = { ...DEFAULT_PREFERENCES };

function parsePreferences(value: unknown): WorkflowPreferences {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_PREFERENCES };
  const input = value as Partial<Record<keyof WorkflowPreferences, unknown>>;
  const conflict = input.defaultFileConflict;
  return {
    openEditorAfterCreate:
      typeof input.openEditorAfterCreate === "boolean"
        ? input.openEditorAfterCreate
        : DEFAULT_PREFERENCES.openEditorAfterCreate,
    enableCommandNodes:
      typeof input.enableCommandNodes === "boolean"
        ? input.enableCommandNodes
        : DEFAULT_PREFERENCES.enableCommandNodes,
    rememberNonSensitiveVariables:
      typeof input.rememberNonSensitiveVariables === "boolean"
        ? input.rememberNonSensitiveVariables
        : DEFAULT_PREFERENCES.rememberNonSensitiveVariables,
    defaultFileConflict:
      conflict === "skip" || conflict === "overwrite" || conflict === "rename" || conflict === "fail"
        ? conflict
        : DEFAULT_PREFERENCES.defaultFileConflict,
  };
}

export async function initializeWorkflowPreferences(storage: ExtensionStorage): Promise<void> {
  await storage.migrate(3, [
    {
      version: 1,
      migrate: async (target) => {
        if ((await target.get("open-created")) === null) {
          await target.set("open-created", true);
        }
      },
    },
    {
      version: 2,
      migrate: async (target) => {
        const legacy = await target.get<boolean>("open-created");
        await target.set("preferences", {
          openEditorAfterCreate:
            typeof legacy === "boolean" ? legacy : DEFAULT_PREFERENCES.openEditorAfterCreate,
        });
        await target.delete("open-created");
      },
    },
    {
      version: 3,
      migrate: async (target) => {
        const next = parsePreferences(await target.get("preferences"));
        await target.set("preferences", {
          openEditorAfterCreate: next.openEditorAfterCreate,
          enableCommandNodes: next.enableCommandNodes,
          rememberNonSensitiveVariables: next.rememberNonSensitiveVariables,
          defaultFileConflict: next.defaultFileConflict,
        });
      },
    },
  ]);
  const stored = await storage.get("preferences");
  snapshot = parsePreferences(stored);
  storageRef = storage;
}

export function getWorkflowPreferences(): WorkflowPreferences {
  return { ...snapshot };
}

export async function saveWorkflowPreferences(next: Partial<WorkflowPreferences>): Promise<void> {
  if (!storageRef) throw new Error("Workflow 偏好存储尚未初始化");
  const normalized = parsePreferences({ ...snapshot, ...next });
  await storageRef.set("preferences", {
    openEditorAfterCreate: normalized.openEditorAfterCreate,
    enableCommandNodes: normalized.enableCommandNodes,
    rememberNonSensitiveVariables: normalized.rememberNonSensitiveVariables,
    defaultFileConflict: normalized.defaultFileConflict,
  });
  snapshot = normalized;
}

export function disposeWorkflowPreferences(): void {
  storageRef = null;
  snapshot = { ...DEFAULT_PREFERENCES };
}
