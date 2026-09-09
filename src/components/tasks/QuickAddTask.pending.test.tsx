// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import QuickAddTask from './QuickAddTask';
const state=vi.hoisted(()=>({createTask:vi.fn(()=>new Promise<void>(()=>{}))}));
vi.mock('../../stores/taskStore',()=>({useTaskStore:(selector:any)=>selector(state)}));
afterEach(cleanup);
it('rapid Enter while pending should create only once',()=>{
 render(<QuickAddTask/>);
 const input=screen.getByPlaceholderText('快速添加任务，回车创建');
 fireEvent.change(input,{target:{value:'Audit task'}});
 fireEvent.keyDown(input,{key:'Enter'}); fireEvent.keyDown(input,{key:'Enter'});
 expect(state.createTask).toHaveBeenCalledTimes(1);
});
