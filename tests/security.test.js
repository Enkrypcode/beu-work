import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('migration keeps private work hidden, live updates shared, and owner RLS intact',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    `);
    // Isolated fixture matching the audited Priority schema; no runtime or test dependency on Priority.
    await db.exec(`create table public.tasks (
      id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) default auth.uid(),
      title text not null, notes text not null default '', category text, deadline date,
      sort_order integer not null default 0, status text not null default 'active' check(status in ('active','done')),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
    ); alter table tasks enable row level security;
    create policy "Users can read their own tasks" on tasks for select using(auth.uid()=user_id);
    create policy "Users can create their own tasks" on tasks for insert with check(auth.uid()=user_id);
    create policy "Users can update their own tasks" on tasks for update using(auth.uid()=user_id) with check(auth.uid()=user_id);
    create policy "Users can delete their own tasks" on tasks for delete using(auth.uid()=user_id);`);
    await db.exec(`
      create table public.profiles(user_id uuid primary key references auth.users(id),full_name text,job_title text,is_super_admin boolean default false);
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
      insert into profiles values ('00000000-0000-0000-0000-000000000001','Test Monitor','Test Role',true),('00000000-0000-0000-0000-000000000002','Test Owner','Owner Role',false),('00000000-0000-0000-0000-000000000003','Private Person','Private Role',false);
      create function public.is_beu_priority_super_admin() returns boolean language sql stable security definer set search_path = public as $$
        select coalesce((select is_super_admin from public.profiles where user_id = auth.uid()), false)
      $$;
      grant select,insert,update,delete on tasks to authenticated;
      insert into tasks(id,user_id,title,sort_order) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Private task',0),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','Other private task',0);
    `);
    await db.exec(await readFile(new URL('../supabase/proposals/20260914_company_work.sql',import.meta.url),'utf8'));
    assert.equal((await db.query("select visibility from tasks limit 1")).rows[0].visibility,'private');
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`);
    let snapshot=(await db.query('select beu_work_snapshot() as snapshot')).rows[0].snapshot;
    assert.equal(snapshot.tasks.length,0);assert.equal(snapshot.people.length,0);
    await db.exec(`reset role; update tasks set visibility='company' where id='10000000-0000-0000-0000-000000000001'; set role authenticated;`);
    snapshot=(await db.query('select beu_work_snapshot() as snapshot')).rows[0].snapshot;
    assert.equal(snapshot.tasks.length,1);assert.equal(snapshot.people.length,1);
    assert.equal(snapshot.tasks[0].title,'Private task');assert.equal('notes' in snapshot.tasks[0],false);
    assert.equal((await db.query('select * from tasks')).rows.length,0); // Monitor cannot directly read others' tasks.
    assert.equal((await db.query("update tasks set title='Hijacked' returning id")).rows.length,0);
    assert.equal((await db.query('delete from tasks returning id')).rows.length,0);
    await assert.rejects(db.exec("insert into beu_work_members(user_id) values ('00000000-0000-0000-0000-000000000003')"));
    await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);");
    assert.equal((await db.query('select * from tasks')).rows.length,1); // Priority owner behavior preserved.
    await assert.rejects(db.query('select beu_work_snapshot()')); // Owner is not implicitly a monitor.
    await db.exec("update tasks set title='Updated shared work' where id='10000000-0000-0000-0000-000000000001';");
    await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);");
    snapshot=(await db.query('select beu_work_snapshot() as snapshot')).rows[0].snapshot;
    assert.equal(snapshot.tasks[0].title,'Updated shared work');
    await db.exec("reset role; update tasks set visibility='private'; set role authenticated;");
    assert.equal((await db.query('select beu_work_snapshot() as snapshot')).rows[0].snapshot.tasks.length,0);
    await db.exec("reset role; update profiles set is_super_admin=false where user_id='00000000-0000-0000-0000-000000000001'; set role authenticated;");
    await assert.rejects(db.query('select beu_work_snapshot()')); // Runtime helper reflects role removal; no copied membership remains.
    await db.exec("reset role; set role anon;");await assert.rejects(db.query('select beu_work_snapshot()'));
    await db.exec("reset role; set role authenticated; select set_config('request.jwt.claim.sub','',false);");await assert.rejects(db.query('select beu_work_snapshot()'));
  } finally {await db.close();}
});
