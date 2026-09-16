import './style.css';
import { supabase, loadSnapshot } from './data.js';
import { isHigh, metrics, priorityFeed, filterWork, deadlineMatches, attentionWork } from './model.js';

const root = document.querySelector('#app');
const THEME_KEY = 'beu-work-theme';
let selectedTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const formatDate = date => date ? new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric'}).format(new Date(`${date}T12:00:00`)) : 'No deadline';
const initialFilters = () => ({search:'', person:'', category:'', priority:'', deadline:'', status:''});
let user = null, people = [], tasks = [], page = 'dashboard', selectedPersonId = null;
function syncRoute() {
  const route = location.hash.slice(1);
  const personRoute = route.match(/^people\/([^/]+)$/);
  if (personRoute) { page = 'person'; selectedPersonId = decodeURIComponent(personRoute[1]); return; }
  page = ['dashboard','work','people'].includes(route) ? route : 'dashboard';
  selectedPersonId = null;
}
syncRoute();
let filters = initialFilters(), loaded = false, refreshing = false, error = '', lastRefresh = null, controller = null, generation = 0;
let authMessage = '', signingIn = false, authStarting = true, profileOpen = false;
const iconPaths = {work:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3"/>',people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/>',flag:'<path d="M5 21V3h14l-3 5 3 5H5"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>',arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',refresh:'<path d="M21 12a9 9 0 0 0-15.5-6.2L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.2L21 16"/><path d="M21 21v-5h-5"/>',moon:'<path d="M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z"/>',logout:'<path d="M9 4H4v16h5M10 12h11M16 7l5 5-5 5"/>',check:'<path d="m5 12 4 4L19 6"/>'};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || iconPaths.work}</svg>`;
const brand = () => `<a class="brand" href="#dashboard"><img src="/assets/logo-mark.svg" width="36" height="36" alt=""><span>BEU Work<small>Our work. One shared view.</small></span></a>`;
const personFor = id => people.find(p => p.user_id === id);
const initials = p => (p?.full_name || '?').split(/\s+/).slice(0,2).map(v => v[0]).join('').toUpperCase();
const personName = p => p?.full_name || 'Profile not set';
function avatar(p, className = 'avatar') { return `<span class="${className}${p?.avatar_url ? ' has-photo' : ''}">${p?.avatar_url ? `<img src="${escape(p.avatar_url)}" alt="" onerror="this.remove();this.parentElement.classList.remove('has-photo')">` : ''}<span class="avatar-initials">${escape(initials(p))}</span></span>`; }
function profileControl(profile) {
  const name = personName(profile), title = profile?.job_title || 'BEU Work account', email = user?.email || '';
  return `<div class="profile-menu"><button class="profile-button" data-profile aria-label="View account" aria-expanded="${profileOpen}">${avatar(profile || {full_name:email}, 'profile-avatar')}<span class="profile-summary"><strong>${escape(name)}</strong><small>${escape(title)}</small></span></button>${profileOpen ? `<section class="profile-popover" role="dialog" aria-label="Account"><div>${avatar(profile || {full_name:email}, 'profile-avatar profile-avatar-large')}<p class="eyebrow">ACCOUNT</p><strong>${escape(name)}</strong><small>${escape(title)}</small>${email ? `<small>${escape(email)}</small>` : ''}</div><button class="icon-button" data-close-profile aria-label="Close account">×</button></section>` : ''}</div>`;
}
function personLabel(p, clickable = true) {
  return `<${clickable ? 'button' : 'div'} class="person-label" ${clickable ? `data-person="${escape(p?.user_id || '')}"` : ''}>${avatar(p)}<span><strong>${escape(personName(p))}</strong><small>${escape(p?.job_title || 'Job title not set')}</small></span></${clickable ? 'button' : 'div'}>`;
}
function priority(t) { return t.status === 'done' ? '<span class="pill neutral">Completed</span>' : `<span class="pill ${isHigh(t) ? 'red' : 'blue'}">${icon('flag')}${isHigh(t) ? 'High · ' : 'Priority '}${Number.isInteger(t.sort_order) ? String(t.sort_order + 1).padStart(2,'0') : 'Unranked'}</span>`; }
function status(t) { return `<span class="pill ${t.status === 'done' ? 'green' : 'blue'}"><span class="dot"></span>${t.status === 'done' ? 'Done' : 'Active'}</span>`; }
function due(t) { return `<span class="due ${deadlineMatches(t, 'overdue') ? 'overdue' : ''}">${escape(formatDate(t.deadline))}${deadlineMatches(t,'overdue') ? '<small>Overdue</small>' : ''}</span>`; }
const empty = (title, copy) => `<div class="empty">${icon('work')}<h3>${title}</h3><p>${copy}</p></div>`;
function workCard(t) {
  return `<article class="work-card" data-detail="${escape(t.id)}" tabindex="0"><div class="work-card-top"><button class="task-title" data-detail="${escape(t.id)}">${escape(t.title)}</button>${priority(t)}</div>${personLabel(personFor(t.user_id))}<div class="work-card-bottom"><span class="pill neutral">${escape(t.category || 'Other')}</span>${due(t)}${status(t)}</div></article>`;
}
function panel(title, subtitle, content, action = '', symbol = 'work') {
  return `<section class="panel"><div class="panel-heading"><span class="panel-icon">${icon(symbol)}</span><div><h2>${title}</h2><p>${subtitle}</p></div>${action}</div>${content}</section>`;
}
const allWork = '<button class="text-button" data-page="work">View all '+icon('arrow')+'</button>';
const dateTime = value => value ? new Date(value).toLocaleString('en-GB', {dateStyle:'medium', timeStyle:'short'}) : 'Not available';
function relativeUpdated(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'Updated just now';
  if (seconds < 3600) return `Updated ${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `Updated ${Math.floor(seconds / 3600)} hours ago`;
  return `Updated ${Math.floor(seconds / 86400)} days ago`;
}
function attentionPanel() {
  const attention = attentionWork(tasks);
  const entries = [['Overdue', attention.overdue, 'red'], ['Due Today', attention.today, 'violet'], ['Due Soon', attention.soon, 'blue']];
  const urgent = entries.flatMap(([, list]) => list).slice(0, 5);
  const content = `<div class="attention-summary">${entries.map(([label,list,tone])=>`<div class="attention-count ${tone}"><strong>${list.length}</strong><span>${label}</span></div>`).join('')}</div>${urgent.length ? `<div class="attention-list">${urgent.map(t=>`<button class="attention-item" data-detail="${escape(t.id)}"><span><strong>${escape(t.title)}</strong><small>${escape(personName(personFor(t.user_id)))} · ${escape(t.category || 'Other')}</small></span><span>${due(t)}${priority(t)}</span></button>`).join('')}</div>` : '<p class="quiet">No active shared work needs attention in the next three days.</p>'}`;
  return panel('Needs Attention','Overdue, due today, and due within the next 3 days.',content,'','flag');
}
function recentUpdatesPanel() {
  const recent = [...tasks].sort((a,b)=>new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()).slice(0,5);
  return panel('Recent Updates','Recently updated company-shared work.',recent.length ? `<div class="recent-list">${recent.map(t=>`<button class="recent-item" data-detail="${escape(t.id)}"><span><strong>${escape(t.title)}</strong><small>${escape(personName(personFor(t.user_id)))}</small></span><time datetime="${escape(t.updated_at || '')}">${escape(relativeUpdated(t.updated_at))}</time></button>`).join('')}</div>` : '<p class="quiet">No shared work has been updated yet.</p>','','calendar');
}
function dashboard() {
  const m = metrics(tasks), feed = priorityFeed(tasks).slice(0,6);
  const contributors = people.map(p => ({...p, count: tasks.filter(t=>t.user_id===p.user_id).length})).filter(p=>p.count).sort((a,b)=>b.count-a.count);
  const categories = [...new Set(tasks.map(t=>t.category || 'Other'))].map(name=>({name,count:tasks.filter(t=>(t.category||'Other')===name && t.status==='active').length})).filter(c=>c.count).sort((a,b)=>b.count-a.count);
  const upcoming = tasks.filter(t=>deadlineMatches(t,'soon')).sort((a,b)=>a.deadline.localeCompare(b.deadline)).slice(0,5);
  const stats = [['Shared Works',m.shared,'Explicitly shared from BEU Priority','work','blue'],['Connected Accounts',contributors.length,'Accounts contributing shared work','people','teal'],['High Priority',m.high,'Active work in owner positions 1–3','flag','red'],['Upcoming Deadlines',m.upcoming,'Active work due in the next 7 days','calendar','violet']];
  return `<div class="stats">${stats.map(([label,count,hint,symbol,tone])=>`<section class="stat"><span class="stat-icon ${tone}">${icon(symbol)}</span><div><p>${label}</p><strong>${loaded ? count : '—'}</strong><small>${hint}</small></div></section>`).join('')}</div><div class="dashboard-grid"><div class="feed-col">${panel('Combined Priority Feed','The priorities your team chose to share.',feed.length ? feed.map(workCard).join('') : empty('No active shared work','Work appears here after its owner shares it from BEU Priority.'),allWork,'flag')}${attentionPanel()}${recentUpdatesPanel()}</div><div class="side-col">${panel('Priority Sources','People contributing to our shared view.',contributors.length ? `<div class="sources">${contributors.map(p=>`<div class="source">${personLabel(p)}<span class="source-count">${p.count}<small>shared</small></span></div>`).join('')}</div>` : empty('No sources yet','Only accounts with company-shared work appear here.'),'<button class="text-button" data-page="people">People '+icon('arrow')+'</button>','people')}${panel('Upcoming Deadlines','Active shared work due in the next 7 days.',upcoming.length ? upcoming.map(t=>`<div class="deadline-row"><span class="date-tile">${Number(t.deadline.slice(8))}<small>${new Intl.DateTimeFormat('en',{month:'short'}).format(new Date(t.deadline+'T12:00:00'))}</small></span><div><button class="task-title" data-detail="${escape(t.id)}">${escape(t.title)}</button><small>${escape(personName(personFor(t.user_id)))}</small></div></div>`).join('') : empty('No upcoming deadlines','There is no active shared work due in the next 7 days.'),'','calendar')}${panel('Shared by Category','Distribution of active shared work.',categories.length ? `<div class="category-bars">${categories.map(c=>`<div><span>${escape(c.name)}</span><meter min="0" max="${Math.max(...categories.map(v=>v.count))}" value="${c.count}">${c.count}</meter><strong>${c.count}</strong></div>`).join('')}</div>` : '<p class="quiet">No active shared work to group.</p>')}</div></div>`;
}
function selectFilter(name, label, options) {
  return `<label class="filter"><span>${label}</span><select name="${name}" aria-label="Filter by ${label}"><option value="">All ${label.toLowerCase()}</option>${options.map(([value,text])=>`<option value="${escape(value)}" ${filters[name]===value?'selected':''}>${escape(text)}</option>`).join('')}</select></label>`;
}
function work() {
  const list = filterWork(tasks,people,filters);
  return `<section aria-label="Work filters" class="filters"><label class="search-filter"><span>Search work</span><input id="search" type="search" placeholder="Search work, PIC or category…" value="${escape(filters.search)}"></label>${selectFilter('person','PIC',people.map(p=>[p.user_id,personName(p)]))}${selectFilter('category','Category',[...new Set(tasks.map(t=>t.category).filter(Boolean))].sort().map(c=>[c,c]))}${selectFilter('priority','Priority',[['high','High · positions 1–3'],['other','Other active priorities']])}${selectFilter('deadline','Deadline',[['overdue','Overdue'],['today','Due today'],['week','Due this week'],['soon','Next 7 days'],['none','No deadline']])}${selectFilter('status','Status',[['active','Active'],['done','Done']])}<button class="secondary reset" data-reset>Reset</button></section><div class="results-caption"><span>${loaded ? `${list.length} shared ${list.length===1?'work':'works'}` : 'Waiting for shared work'}</span><span>Read-only monitoring</span></div>${list.length ? `<section class="panel work-table"><table><caption class="sr-only">Company-shared work</caption><thead><tr><th>Work</th><th>PIC / Job Title</th><th>Category</th><th>Priority</th><th>Deadline</th><th>Status</th></tr></thead><tbody>${list.map(t=>`<tr data-detail="${escape(t.id)}" tabindex="0"><td><button class="task-title" data-detail="${escape(t.id)}">${escape(t.title)}</button></td><td>${personLabel(personFor(t.user_id))}</td><td><span class="pill neutral">${escape(t.category || 'Other')}</span></td><td>${priority(t)}</td><td>${due(t)}</td><td>${status(t)}</td></tr>`).join('')}</tbody></table></section><section class="mobile-work" aria-label="Shared work cards">${list.map(workCard).join('')}</section>` : `<section class="panel">${empty(tasks.length?'No matching shared work':'No shared work yet',tasks.length?'Adjust your search or filters to see more work.':'Personal work stays private until its owner chooses to share it.')}</section>`}`;
}
function peoplePage() {
  return people.length ? `<div class="people-grid">${people.map(p=>{const m=metrics(tasks.filter(t=>t.user_id===p.user_id));return `<article class="panel person-card"><button class="person-open" data-person-detail="${escape(p.user_id)}">${personLabel(p,false)}</button><div class="person-metrics"><div><strong>${m.shared}</strong><span>Shared Works</span></div><div><strong>${m.high}</strong><span>High Priority</span></div><div><strong>${m.week}</strong><span>Due This Week</span></div></div><button class="person-link text-button" data-person-detail="${escape(p.user_id)}">View details ${icon('arrow')}</button></article>`}).join('')}</div>` : `<section class="panel">${empty('No people to display','Approved monitoring accounts and people sharing company work appear here.')}</section>`;
}
function personDetailPage() {
  const person = personFor(selectedPersonId);
  if (!person) return `<section class="panel">${empty('Person unavailable','This person is not available in the current shared-work view.')}<button class="text-button" data-page="people">${icon('arrow')} Back to People</button></section>`;
  const personTasks = tasks.filter(t=>t.user_id===person.user_id);
  const active = personTasks.filter(t=>t.status==='active');
  const completed = personTasks.filter(t=>t.status==='done');
  const m = metrics(personTasks);
  const list = (title, subtitle, entries) => panel(title, subtitle, entries.length ? `<div class="person-work-list">${entries.map(workCard).join('')}</div>` : '<p class="quiet">No company-shared work in this section.</p>','','work');
  return `<div class="person-detail"><button class="back-button text-button" data-page="people">← Back to People</button><section class="panel person-detail-head">${personLabel(person,false)}<div class="person-detail-metrics"><div><strong>${m.shared}</strong><span>Shared Works</span></div><div><strong>${m.high}</strong><span>High Priority</span></div><div><strong>${m.week}</strong><span>Due This Week</span></div><div><strong>${completed.length}</strong><span>Completed</span></div></div></section>${list('Active Work','Company-shared work that is still active.',active)}${list('Completed Work','Company-shared work that has been completed.',completed)}</div>`;
}
function render() {
  if (!user) return renderAuth();
  const focused=document.activeElement;
  const focusKey=focused?.id==='search'?'#search':focused?.closest('.filters')&&focused.name?`.filters [name="${focused.name}"]`:null;
  const openDetail=document.querySelector('#detail')?.open ? document.querySelector('#detail').dataset.taskId : null;
  const own = personFor(user.id);
  const titles = {dashboard:['OUR WORK','Company work, at a glance','A shared view of priorities at PT Banggai Energi Utama.'],work:['WORK MONITORING','All shared work','See what is being handled, who owns it, and what needs attention.'],people:['OUR PEOPLE','People & shared priorities','A work-focused view of the people behind our shared work.'],person:['OUR PEOPLE','Person detail','Company-shared work only. Personal BEU Priority work remains private.']};
  const [eyebrow,title,copy] = titles[page];
  root.innerHTML = `<div class="shell"><header>${brand()}<nav aria-label="Main navigation">${['dashboard','work','people'].map(n=>`<a href="#${n}" ${(page===n || page==='person'&&n==='people')?'aria-current="page"':''}>${n[0].toUpperCase()+n.slice(1)}</a>`).join('')}</nav><div class="header-actions">${profileControl(own)}<button class="icon-button" id="theme-toggle" type="button" aria-label="Toggle light or dark mode">${icon('moon')}</button><button class="icon-button" data-signout aria-label="Sign out">${icon('logout')}</button></div></header><main><div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${copy}</p></div><div class="refresh"><button class="secondary" data-refresh ${refreshing?'disabled':''}>${icon('refresh')}${refreshing?'Refreshing…':'Refresh'}</button><small>${lastRefresh?'Updated '+lastRefresh.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'Company-shared work only'}</small></div></div>${error?`<div class="notice error" role="alert"><strong>Shared work is unavailable</strong><p>${escape(error)}</p>${loaded?'<small>The last shared view is hidden until access and sharing are verified again.</small>':''}</div>`:''}${refreshing&&!loaded?'<div class="loading" role="status"><span class="spinner"></span>Loading shared work and profiles…</div>':''}${page==='dashboard'?dashboard():page==='work'?work():page==='people'?peoplePage():personDetailPage()}<footer>${icon('check')} Only intentionally shared work. Personal tasks stay in BEU Priority.</footer></main></div><dialog id="detail"></dialog>`;
  bind();
  if(focusKey)document.querySelector(focusKey)?.focus({preventScroll:true});
  if(openDetail)showDetail(openDetail);
}
function renderAuth() {
  root.innerHTML = `<main class="auth-page"><section class="auth-card">${brand()}<div><p class="eyebrow">PT BANGGAI ENERGI UTAMA</p><h1>${authStarting?'Opening BEU Work…':'Sign in to BEU Work'}</h1><p>Use your existing BEU Priority account to view company-shared work.</p></div>${authMessage?`<div class="notice error" role="alert">${escape(authMessage)}</div>`:''}${!supabase?'<div class="notice">Supabase is not configured. Set the existing BEU project URL and browser-safe key in .env.local.</div>':authStarting?'<div class="loading" role="status"><span class="spinner"></span>Checking your session…</div>':`<form id="auth-form"><label>Email<input type="email" name="email" required autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button class="primary" ${signingIn?'disabled':''}>${signingIn?'Signing in…':'Sign in'}</button></form>`}<div class="auth-foot"><span>Our Work · Shared intentionally</span><button class="icon-button" id="theme-toggle" type="button" aria-label="Toggle light or dark mode">${icon('moon')}</button></div></section></main>`;
  bindThemeToggle();
  document.querySelector('#auth-form')?.addEventListener('submit',async event=>{
    event.preventDefault(); if(signingIn)return; const data=new FormData(event.target); signingIn=true; authMessage=''; const button=event.target.querySelector('button');button.disabled=true;button.textContent='Signing in…';
    try {const result=await supabase.auth.signInWithPassword({email:data.get('email').trim(),password:data.get('password')});if(result.error){authMessage='Could not sign in. Check your email and password, then try again.';}}catch{authMessage='Could not connect. Check your connection and try again.';}
    signingIn=false; if(!user)renderAuth();
  });
}
function applyTheme(theme) { selectedTheme = theme === 'dark' ? 'dark' : 'light'; document.documentElement.dataset.theme = selectedTheme; try { localStorage.setItem(THEME_KEY, selectedTheme); } catch {} }
function toggleTheme(event) { event.preventDefault(); event.stopPropagation(); applyTheme(selectedTheme === 'dark' ? 'light' : 'dark'); }
function bindThemeToggle() { const button = document.querySelector('#theme-toggle'); button?.addEventListener('click', toggleTheme); }
function navigate(next) { location.hash=next; }
function bind() {
  bindThemeToggle();
  document.querySelector('[data-profile]')?.addEventListener('click',()=>{profileOpen=!profileOpen;render();});
  document.querySelector('[data-close-profile]')?.addEventListener('click',()=>{profileOpen=false;render();});
  document.querySelector('[data-signout]').onclick=async()=>{const result=await supabase.auth.signOut({scope:'local'});if(result.error){error='Could not sign out. Try again.';render();}};
  document.querySelector('[data-refresh]').onclick=refresh;
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
  document.querySelectorAll('[data-person-detail]').forEach(b=>b.onclick=()=>navigate(`people/${encodeURIComponent(b.dataset.personDetail)}`));
  document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{filters=initialFilters();filters.person=b.dataset.person;if(page==='work')render();else navigate('work');});
  document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=event=>{if(event.target.closest('[data-person]')) return; showDetail(b.dataset.detail);});
  document.querySelectorAll('.work-card[data-detail], tr[data-detail]').forEach(node=>node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();showDetail(node.dataset.detail);}});
  document.querySelectorAll('.filters select').forEach(input=>input.onchange=()=>{filters[input.name]=input.value;render();});
  document.querySelector('[data-reset]')?.addEventListener('click',()=>{filters=initialFilters();render();});
  document.querySelector('#search')?.addEventListener('input',event=>{const cursor=event.target.selectionStart;filters.search=event.target.value;render();const input=document.querySelector('#search');input.focus();if(input.type!=='search')input.setSelectionRange(cursor,cursor);});
}
function showDetail(id) {
  const t=tasks.find(v=>v.id===id);if(!t)return;const dialog=document.querySelector('#detail');
  dialog.dataset.taskId=id;
  dialog.innerHTML=`<div class="detail-heading"><p class="eyebrow">COMPANY-SHARED WORK</p><button class="icon-button" data-close aria-label="Close detail">×</button></div><h2>${escape(t.title)}</h2>${personLabel(personFor(t.user_id),false)}<dl><div><dt>Category</dt><dd>${escape(t.category||'Other')}</dd></div><div><dt>Priority</dt><dd>${priority(t)}</dd></div><div><dt>Deadline</dt><dd>${due(t)}</dd></div><div><dt>Status</dt><dd>${status(t)}</dd></div><div><dt>Created</dt><dd>${escape(dateTime(t.created_at))}</dd></div><div><dt>Last Updated</dt><dd>${escape(dateTime(t.updated_at))}</dd></div>${t.completed_at?`<div><dt>Completed</dt><dd>${escape(dateTime(t.completed_at))}</dd></div>`:''}</dl><p class="quiet">This work is maintained by its owner in BEU Priority.</p>`;
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}};dialog.showModal();
}
async function refresh() {
  if(!user||refreshing)return;
  const thisGeneration=generation, id=user.id;controller=new AbortController();refreshing=true;error='';render();
  try{const snapshot=await loadSnapshot(controller.signal);if(thisGeneration!==generation||user?.id!==id)return;tasks=snapshot.tasks;people=snapshot.people;loaded=true;lastRefresh=new Date();}
  catch(e){if(thisGeneration!==generation||controller.signal.aborted)return;error=e.message;tasks=[];people=[];}
  finally{if(thisGeneration===generation){refreshing=false;render();}}
}
function setUser(next) {
  authStarting=false;
  if(next?.id===user?.id){user=next;render();return;}
  generation++;controller?.abort();user=next;tasks=[];people=[];loaded=false;refreshing=false;lastRefresh=null;error='';filters=initialFilters();authMessage='';render();if(user)void refresh();
}
window.addEventListener('hashchange',()=>{syncRoute();render();});
window.addEventListener('focus',()=>{if(user&&(!lastRefresh||Date.now()-lastRefresh>15000))void refresh();});
// Poll only the safe endpoint: unsharing/deleting work may not deliver realtime events to every reader.
setInterval(()=>{if(user&&document.visibilityState==='visible')void refresh();},30000);
render();
if(supabase){
  // Callback stays synchronous; defer queries until the auth lock is released.
  supabase.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>setUser(session?.user||null),0);});
  supabase.auth.getSession().then(({data,error:sessionError})=>{if(sessionError)authMessage='Could not restore your session. Please sign in again.';setUser(data.session?.user||null);}).catch(()=>{authStarting=false;authMessage='Could not connect. Please try again.';render();});
}else{authStarting=false;render();}
