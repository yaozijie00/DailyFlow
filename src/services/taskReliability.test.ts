import { beforeEach, afterEach, it, expect } from 'vitest';
import { createTestDb } from '../db/test-helpers';
import { TaskRepository } from '../db/repositories/taskRepository';
import { ProjectRepository } from '../db/repositories/projectRepository';
import { FocusSessionRepository } from '../db/repositories/focusSessionRepository';
import { TaskService } from './taskService';
import { undoManager } from '../lib/undoManager';
let ctx: Awaited<ReturnType<typeof createTestDb>>;
let tasks: TaskRepository;
let svc: TaskService;
beforeEach(async()=>{ctx=await createTestDb();tasks=new TaskRepository(ctx.db);svc=new TaskService(tasks,new FocusSessionRepository(ctx.db));undoManager.clear();});
afterEach(()=>ctx.close());
it('project-only edit should be undoable',async()=>{
 const p=await new ProjectRepository(ctx.db).create({title:'Audit project'});
 const t=await tasks.create({title:'Audit task',scheduledDate:'2026-09-08'});
 await svc.updateTask(t.id,{projectId:p.id});
 expect(await undoManager.undo()).toBe(true);
 expect((await tasks.findById(t.id))?.projectId).toBe(null);
});
it('re-completing a reopened repeat task should not duplicate its next occurrence',async()=>{
 const t=await tasks.create({title:'Repeat audit',scheduledDate:'2026-09-08',repeatRule:'daily'});
 await svc.toggleComplete(t.id); await svc.toggleComplete(t.id); await svc.toggleComplete(t.id);
 expect(await tasks.findByDate('2026-09-09')).toHaveLength(1);
});
it('next occurrence should retain project membership',async()=>{
 const p=await new ProjectRepository(ctx.db).create({title:'Audit project'});
 const t=await tasks.create({title:'Repeat audit',scheduledDate:'2026-09-08',repeatRule:'daily',projectId:p.id});
 await svc.completeTask(t.id);
 expect((await tasks.findByDate('2026-09-09'))[0].projectId).toBe(p.id);
});
