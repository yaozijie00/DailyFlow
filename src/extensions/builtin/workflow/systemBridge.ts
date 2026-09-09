import { invoke } from "@tauri-apps/api/core";

export type WorkflowConflictStrategy = "fail" | "skip" | "overwrite" | "rename";

export interface PathInspection {
  path: string;
  exists: boolean;
  kind: "file" | "directory" | "missing";
}

export interface FileWriteInput {
  path: string;
  content: string;
  conflict: WorkflowConflictStrategy;
}

export interface FileWriteResult {
  outcome: "created" | "skipped" | "overwritten" | "renamed";
  actualPath: string;
}

export interface CopyPathInput {
  source: string;
  target: string;
  conflict: WorkflowConflictStrategy;
}

export interface ProcessExecutionInput {
  executable: string;
  arguments: string[];
  workingDirectory?: string;
}

export interface ProcessExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export const workflowSystemBridge = {
  inspectPaths: (paths: string[]) =>
    invoke<PathInspection[]>("workflow_inspect_paths", { paths }),
  createDirectories: (paths: string[]) =>
    invoke<string[]>("workflow_create_directories", { paths }),
  writeTextFile: (input: FileWriteInput) =>
    invoke<FileWriteResult>("workflow_write_text_file", { input }),
  copyPath: (input: CopyPathInput) =>
    invoke<FileWriteResult>("workflow_copy_path", { input }),
  executeProcess: (input: ProcessExecutionInput) =>
    invoke<ProcessExecutionResult>("workflow_execute_process", { input }),
};
