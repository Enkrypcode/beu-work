import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot, filterWork, metrics, deadlineMatches, isHigh, attentionWork } from '../src/model.js';
const now = new Date(2026,8,14,12);
const tasks = [
  {id:'a',user_id:'one',title:'Shared report',visibility:'company',status:'active',sort_order:0,category:'Report',deadline:'2026-09-13'},
  {id:'b',user_id:'two',title:'Shared meeting',visibility:'company',status:'active',sort_order:4,category:'Meeting',deadline:'2026-09-20'},
  {id:'c',user_id:'one',title:'Completed report',visibility:'company',status:'done',sort_order:1,category:'Report',deadline:'2026-09-14'},
];
const people = [{user_id:'one',full_name:'Test Person',job_title:'Test Role'},{user_id:'two',full_name:'Second Person',job_title:'Second Role'}];
test('rejects private or missing sharing flags, including malformed endpoint data',()=>{
  assert.throws(()=>validateSnapshot({tasks:[{...tasks[0],visibility:'private'}],people}));
  assert.throws(()=>validateSnapshot({tasks:[{...tasks[0],visibility:undefined}],people}));
  assert.throws(()=>validateSnapshot(null));
  assert.equal(validateSnapshot({tasks,people}).tasks.length,3);
});
test('person, category, priority, deadline, and status filters compose',()=>{
  assert.deepEqual(filterWork(tasks,people,{search:'Test Role',person:'one',category:'Report',priority:'high',deadline:'overdue',status:'active'},now).map(t=>t.id),['a']);
  assert.deepEqual(filterWork(tasks,people,{person:'two'},now).map(t=>t.id),['b']);
  assert.deepEqual(filterWork(tasks,people,{search:'Completed',status:'done'},now).map(t=>t.id),['c']);
});
test('completed deadlines never inflate overdue, upcoming, or high priority counts',()=>{
  assert.deepEqual(metrics(tasks,now),{shared:3,high:1,week:1,upcoming:1,overdue:1});
  assert.equal(deadlineMatches(tasks[2],'today',now),false);
  assert.equal(isHigh(tasks[2]),false);
});
test('week boundary uses the local calendar and includes Sunday',()=>{
  assert.equal(deadlineMatches(tasks[1],'week',now),true);
  assert.equal(deadlineMatches({...tasks[1],deadline:'2026-09-21'},'week',now),false);
  assert.equal(isHigh({...tasks[0],sort_order:2}),true);
  assert.equal(isHigh({...tasks[0],sort_order:3}),false);
});
test('attention includes only active overdue, today, and next-three-day work',()=>{
  const attention = attentionWork([
    {...tasks[0], deadline:'2026-09-13'},
    {...tasks[1], deadline:'2026-09-14'},
    {...tasks[0], id:'d', deadline:'2026-09-17'},
    {...tasks[0], id:'e', deadline:'2026-09-18'},
    {...tasks[2], id:'f', deadline:'2026-09-13'},
  ], now);
  assert.deepEqual(attention.overdue.map(t=>t.id),['a']);
  assert.deepEqual(attention.today.map(t=>t.id),['b']);
  assert.deepEqual(attention.soon.map(t=>t.id),['d']);
});
