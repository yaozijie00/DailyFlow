import { WorkflowNodeRegistry } from "../domain/nodeRegistry";
import { CORE_NODE_DEFINITIONS } from "./coreNodes";

export function createBuiltInNodeRegistry(): WorkflowNodeRegistry {
  const registry = new WorkflowNodeRegistry();
  for (const definition of CORE_NODE_DEFINITIONS) registry.register(definition);
  return registry;
}
