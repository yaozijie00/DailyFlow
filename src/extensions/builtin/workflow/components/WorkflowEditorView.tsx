import type { WorkflowV2 } from "../domain/types";
import { createBuiltInNodeRegistry } from "../nodes/builtInRegistry";
import { getWorkflowPreferences } from "../preferences";
import { workflowService } from "../services/workflowService";
import { WorkflowEditor } from "./editor/WorkflowEditor";

export default function WorkflowEditorView({ workflow, onBack, onSaved }: {
  workflow: WorkflowV2;
  onBack: () => void;
  onSaved: () => void;
}) {
  const registry = createBuiltInNodeRegistry({
    allowCommandExecution: getWorkflowPreferences().enableCommandNodes,
  });
  return (
    <WorkflowEditor
      workflow={workflow}
      registry={registry}
      onBack={onBack}
      onPreview={async () => undefined}
      onSave={async (next) => {
        await workflowService.saveTemplate(next);
        onSaved();
      }}
    />
  );
}
