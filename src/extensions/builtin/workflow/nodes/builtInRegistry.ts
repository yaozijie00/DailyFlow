import { WorkflowNodeRegistry } from "../domain/nodeRegistry";
import { CORE_NODE_DEFINITIONS } from "./coreNodes";
import { createFileSystemNodeDefinitions } from "./fileSystemNodes";
import { createSystemNodeDefinitions } from "./systemNodes";
import { createDailyFlowNodeDefinitions, type WorkflowTaskOps } from "./dailyFlowNodes";
import type { WorkflowNodeDefinition } from "../domain/nodeDefinition";

export function createBuiltInNodeRegistry(options: {
  allowCommandExecution?: boolean;
  tasks?: WorkflowTaskOps;
  additionalDefinitions?: WorkflowNodeDefinition[];
} = {}): WorkflowNodeRegistry {
  const registry = new WorkflowNodeRegistry();
  const definitions = [
    ...CORE_NODE_DEFINITIONS,
    ...createFileSystemNodeDefinitions(),
    ...createSystemNodeDefinitions(undefined, { allowCommandExecution: options.allowCommandExecution }),
    ...(options.tasks ? createDailyFlowNodeDefinitions(options.tasks) : []),
    ...(options.additionalDefinitions ?? []),
  ];
  for (const definition of definitions) {
    registry.register(definition);
  }
  return registry;
}
