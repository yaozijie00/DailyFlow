import type { ExtensionStorage } from "../../types";

export interface WorkflowPreferences {
  openEditorAfterCreate: boolean;
}

const DEFAULT_PREFERENCES: WorkflowPreferences = {
  openEditorAfterCreate: true,
};

let storageRef: ExtensionStorage | null = null;
let snapshot: WorkflowPreferences = { ...DEFAULT_PREFERENCES };

function parsePreferences(value: unknown): WorkflowPreferences {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { openEditorAfterCreate?: unknown }).openEditorAfterCreate === "boolean"
  ) {
    return {
      openEditorAfterCreate: (value as WorkflowPreferences).openEditorAfterCreate,
    };
  }
  return { ...DEFAULT_PREFERENCES };
}

export async function initializeWorkflowPreferences(storage: ExtensionStorage): Promise<void> {
  await storage.migrate(2, [
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
  ]);
  const stored = await storage.get("preferences");
  snapshot = parsePreferences(stored);
  storageRef = storage;
}

export function getWorkflowPreferences(): WorkflowPreferences {
  return { ...snapshot };
}

export async function saveWorkflowPreferences(next: WorkflowPreferences): Promise<void> {
  if (!storageRef) throw new Error("Workflow 偏好存储尚未初始化");
  const normalized = parsePreferences(next);
  await storageRef.set("preferences", {
    openEditorAfterCreate: normalized.openEditorAfterCreate,
  });
  snapshot = normalized;
}

export function disposeWorkflowPreferences(): void {
  storageRef = null;
  snapshot = { ...DEFAULT_PREFERENCES };
}
