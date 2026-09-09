import { it, expect, vi } from 'vitest';
vi.mock('../db/db',()=>({getDb:()=>({})}));
vi.mock('../services/achievementRuntime',()=>({evaluateAndNotify:vi.fn()}));
import { useTaskStore, taskService } from './taskStore';
import { convertNoteToTask } from '../lib/noteConvert';
it('failed task persistence must not mark the note arranged',async()=>{
 vi.spyOn(taskService,'createTask').mockRejectedValueOnce(new Error('audit simulated database write failure'));
 const updateNote=vi.fn().mockResolvedValue(undefined);
 const note={id:1,title:'Audit note',status:'active' as const,categoryId:null,sortOrder:0,createdAt:0,updatedAt:0,completedAt:null};
 const result=await convertNoteToTask(1,[note],useTaskStore.getState().createTask,updateNote);
 expect({result,arrangedCalls:updateNote.mock.calls.length}).toEqual({result:false,arrangedCalls:0});
});
