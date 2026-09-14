// Isolated browser fixtures. No requests to production are allowed during this check.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const url=process.env.BEU_TEST_URL || 'http://127.0.0.1:5174';
const widths=(process.env.BEU_TEST_WIDTHS || '1440,1024,820,390,320').split(',').map(Number).filter(Number.isFinite);
const initialTheme=process.env.BEU_TEST_THEME === 'dark' ? 'dark' : 'light';
const browser=await chromium.launch({channel:process.env.BEU_TEST_BROWSER || 'chrome',headless:true});
const person={user_id:'00000000-0000-0000-0000-000000000001',full_name:'Test Monitor',job_title:'Monitoring Role'};
const owner={user_id:'00000000-0000-0000-0000-000000000002',full_name:'Test Contributor',job_title:'Contributor Role'};
const dateAt = offset => { const date = new Date(); date.setHours(12,0,0,0); date.setDate(date.getDate()+offset); return date.toISOString().slice(0,10); };
const task={id:'10000000-0000-0000-0000-000000000001',user_id:owner.user_id,title:'Shared test report',category:'Report',sort_order:0,deadline:dateAt(-1),status:'active',visibility:'company',created_at:'2026-09-01T05:00:00Z',updated_at:new Date(Date.now()-12*60*1000).toISOString()};
const secondTask={id:'10000000-0000-0000-0000-000000000003',user_id:owner.user_id,title:'Due today shared work',category:'Tender',sort_order:1,deadline:dateAt(0),status:'active',visibility:'company',created_at:'2026-09-02T05:00:00Z',updated_at:new Date(Date.now()-60*60*1000).toISOString()};
const doneTask={id:'10000000-0000-0000-0000-000000000004',user_id:owner.user_id,title:'Completed shared work',category:'Report',sort_order:2,deadline:dateAt(-2),status:'done',visibility:'company',created_at:'2026-09-03T05:00:00Z',updated_at:new Date(Date.now()-2*60*60*1000).toISOString(),completed_at:new Date(Date.now()-2*60*60*1000).toISOString()};
const session={access_token:'test-access-token',refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:person.user_id,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-01T00:00:00Z'}};
const themeState=page=>page.evaluate(()=>({theme:document.documentElement.dataset.theme,stored:localStorage.getItem('beu-work-theme')}));
async function expectThemeStable(page,label,action){const before=await themeState(page);await action();await page.waitForTimeout(80);assert.deepEqual(await themeState(page),before,`${label} changed the theme`);}
await mkdir('test-results',{recursive:true});
try {
  for(const width of widths){
    const context=await browser.newContext({viewport:{width,height:1000},colorScheme:initialTheme});
    await context.addInitScript(value=>{localStorage.setItem('beu-work-auth',JSON.stringify(value.session));if(!localStorage.getItem('beu-work-theme'))localStorage.setItem('beu-work-theme',value.theme);},{session,theme:initialTheme});
    let bad=false;
    await context.route('**/*',async route=>{
      const request=route.request();const requestUrl=new URL(request.url());
      if(requestUrl.origin===url)return route.continue();
      if(requestUrl.pathname==='/rest/v1/rpc/beu_work_snapshot')return route.fulfill({json:{tasks:bad?[{...task,visibility:'private'}]:[task,secondTask,doneTask],people:[person,owner]}});
      if(requestUrl.pathname.startsWith('/auth/v1/'))return route.fulfill({json:{user:session.user}});
      return route.abort();
    });
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.getByText('Shared test report',{exact:true}).first().waitFor();
    assert.equal(await page.getByText('Needs Attention',{exact:true}).count(),1);
    assert.equal(await page.getByText('Recent Updates',{exact:true}).count(),1);
    await expectThemeStable(page,'empty space',()=>page.mouse.click(10,900));
    if(await page.locator('.account-name').isVisible())await expectThemeStable(page,'profile area',()=>page.locator('.account-name').click());
    for(const tab of ['Dashboard','Work','People']){
      await expectThemeStable(page,`${tab} navigation`,()=>page.getByRole('link',{name:tab,exact:true}).click());
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${tab} overflows at ${width}`);
      if(width<=900)assert.equal(await page.evaluate(()=>[...document.querySelectorAll('header nav a,#theme-toggle,[data-refresh]')].every(node=>{const box=node.getBoundingClientRect();return box.width>=40&&box.height>=40;})),true,`compact controls are too small at ${width}`);
      if(tab==='Dashboard')await page.screenshot({path:`test-results/dashboard-${width}.png`,fullPage:true});
      if(tab==='Work'){
        await expectThemeStable(page,'search filter',()=>page.getByRole('searchbox').fill('not present'));assert.equal(await page.getByText('No matching shared work',{exact:true}).count(),1);
        await expectThemeStable(page,'reset button',()=>page.getByRole('button',{name:'Reset',exact:true}).click());
        await expectThemeStable(page,'PIC filter',()=>page.getByLabel('Filter by PIC').selectOption(owner.user_id));
        await expectThemeStable(page,'category filter',()=>page.getByLabel('Filter by Category').selectOption('Report'));
        await expectThemeStable(page,'priority filter',()=>page.getByLabel('Filter by Priority').selectOption('high'));
        await expectThemeStable(page,'status filter',()=>page.getByLabel('Filter by Status').selectOption('active'));
        await expectThemeStable(page,'task card',()=>page.getByRole('button',{name:'Shared test report',exact:true}).filter({visible:true}).first().click());
        await page.getByRole('dialog').waitFor();assert.equal(await page.getByText('Created',{exact:true}).count(),1);await page.getByRole('button',{name:'Close detail'}).click();
        await page.screenshot({path:`test-results/work-${width}.png`,fullPage:true});
      }
      if(tab==='People'){
        await expectThemeStable(page,'person detail',()=>page.getByRole('button',{name:'View details'}).nth(1).click());
        await page.getByText('Active Work',{exact:true}).waitFor();assert.equal(await page.getByText('Completed Work',{exact:true}).count(),1);
        await expectThemeStable(page,'back to people',()=>page.getByRole('button',{name:'← Back to People',exact:true}).click());
      }
    }
    await expectThemeStable(page,'refresh button',()=>page.getByRole('button',{name:'Refresh',exact:true}).click());
    const beforeToggle=await themeState(page);const expectedTheme=beforeToggle.theme==='dark'?'light':'dark';
    await page.getByRole('button',{name:'Toggle light or dark mode'}).click();
    await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,expectedTheme,{timeout:3000});
    assert.deepEqual(await themeState(page),{theme:expectedTheme,stored:expectedTheme});
    await expectThemeStable(page,'navigation after explicit theme choice',()=>page.getByRole('link',{name:'Dashboard',exact:true}).click());
    await page.reload();await page.getByText('Shared test report',{exact:true}).first().waitFor();
    assert.deepEqual(await themeState(page),{theme:expectedTheme,stored:expectedTheme},'theme did not persist through reload');
    bad=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'Shared test report',exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    await context.close();console.log(`Passed pages, filters, person navigation, detail, dark mode, privacy rejection, and overflow at ${width}px`);
  }
  const context=await browser.newContext({viewport:{width:390,height:844}});await context.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());
  const page=await context.newPage();await page.goto(url);await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();await page.screenshot({path:'test-results/sign-in.png'});await context.close();
  for(const state of ['empty','missing','denied']){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.addInitScript(value=>localStorage.setItem('beu-work-auth',JSON.stringify(value)),session);
    await context.route('**/*',async route=>{
      const p=new URL(route.request().url());if(p.origin===url)return route.continue();
      if(p.pathname==='/rest/v1/rpc/beu_work_snapshot')return state==='empty'?route.fulfill({json:{tasks:[],people:[]}}):route.fulfill({status:state==='missing'?404:403,json:{code:state==='missing'?'PGRST202':'42501',message:'Isolated test failure'}});
      if(p.pathname.startsWith('/auth/v1/'))return route.fulfill({json:{user:session.user}});
      return route.abort();
    });
    const page=await context.newPage();await page.goto(url);
    if(state==='empty')await page.getByText('No active shared work',{exact:true}).waitFor();else await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button',{name:'Shared test report',exact:true}).count(),0);
    await context.close();console.log(`Passed ${state} state without loading private data`);
  }
}finally{await browser.close();}
