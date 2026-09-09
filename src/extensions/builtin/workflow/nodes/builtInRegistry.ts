import { WorkflowNodeRegistry } from "../domain/nodeRegistry";
import { CORE_NODE_DEFINITIONS } from "./coreNodes";
import { createFileSystemNodeDefinitions } from "./fileSystemNodes";
import { createSystemNodeDefinitions } from "./systemNodes";
import { createDailyFlowNodeDefinitions, type WorkflowTaskOps } from "./dailyFlowNodes";

export function createBuiltInNodeRegistry(options: {
  allowCommandExecution?: boolean;
  tasks?: WorkflowTaskOps;
} = {}): WorkflowNodeRegistry {
  const registry = new WorkflowNodeRegistry();
  const definitions = [
    ...CORE_NODE_DEFINITIONS,
    ...createFileSystemNodeDefinitions(),
    ...createSystemNodeDefinitions(undefined, { allowCommandExecution: options.allowCommandExecution }),
    ...(options.tasks ? createDailyFlowNodeDefinitions(options.tasks) : []),
  ];
  for (const definition of definitions) {
    registry.register(definition);
  }
  return registry;
}
