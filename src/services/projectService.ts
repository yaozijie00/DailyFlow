import {
  ProjectRepository,
  type Project,
  type ProjectWithGoal,
  type CreateProjectInput,
} from "../db/repositories/projectRepository";
import { undoManager } from "../lib/undoManager";

/**
 * 项目业务逻辑（v1.8 Goal → Project → Task）。
 * 创建/重命名/删除接入 Undo（undo/redo 应用期间跳过入栈）；
 * 删除项目会解绑其任务 project_id（显式置空，不依赖 FK pragma），
 * 撤销 = 还原项目行 + 恢复任务关联。
 */
export class ProjectService {
  constructor(private readonly projects: ProjectRepository) {}

  /** 全部项目（含所属目标标题，供表单分组与页面管理）。 */
  async listWithGoal(): Promise<ProjectWithGoal[]> {
    return this.projects.findAllWithGoal();
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const p = await this.projects.create(input);
    if (!undoManager.applying) {
      const snapshot = { ...p };
      undoManager.push({
        type: "project.create",
        label: "创建项目",
        undo: async () => {
          await this.projects.delete(snapshot.id);
        },
        redo: async () => {
          await this.projects.insertRestored(snapshot);
        },
      });
    }
    return p;
  }

  async rename(id: number, title: string): Promise<Project | null> {
    const before = await this.projects.findById(id);
    const updated = await this.projects.update(id, { title });
    if (updated && !undoManager.applying && before && before.title !== title) {
      undoManager.push({
        type: "project.rename",
        label: "重命名项目",
        undo: async () => {
          await this.projects.update(id, { title: before.title });
        },
        redo: async () => {
          await this.projects.update(id, { title });
        },
      });
    }
    return updated;
  }

  /** 删除项目：捕获项目行 + 受影响任务 id，撤销时整体还原。 */
  async delete(id: number): Promise<boolean> {
    if (!undoManager.applying) {
      const p = await this.projects.findById(id);
      if (p) {
        const snapshot = { ...p };
        const taskIds = await this.projects.taskIdsByProject(id);
        undoManager.push({
          type: "project.delete",
          label: "删除项目",
          undo: async () => {
            await this.projects.insertRestored(snapshot);
            if (taskIds.length > 0) await this.projects.relinkTasks(taskIds, snapshot.id);
          },
          redo: async () => {
            await this.projects.delete(snapshot.id);
          },
        });
      }
    }
    return this.projects.delete(id);
  }
}
