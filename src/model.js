export const isHigh = task => task.status === 'active' && Number.isInteger(task.sort_order) && task.sort_order >= 0 && task.sort_order < 3;
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dates(now = new Date()) {
  const today = localDate(now), weekEnd = new Date(now), soon = new Date(now);
  weekEnd.setDate(now.getDate() + (7 - now.getDay()) % 7);
  soon.setDate(now.getDate() + 7);
  return { today, weekEnd: localDate(weekEnd), soon: localDate(soon) };
}
export function deadlineMatches(task, filter, now = new Date()) {
  if (!filter) return true;
  const { today, weekEnd, soon } = dates(now);
  if (filter === 'none') return !task.deadline;
  if (!task.deadline || task.status !== 'active') return false;
  if (filter === 'overdue') return task.deadline < today;
  if (filter === 'today') return task.deadline === today;
  if (filter === 'week') return task.deadline >= today && task.deadline <= weekEnd;
  if (filter === 'soon') return task.deadline >= today && task.deadline <= soon;
  return false;
}
export function validateSnapshot(data) {
  if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.people)) throw new Error('The monitoring endpoint returned an invalid response.');
  // Reject the entire response rather than quietly filtering a broken security boundary.
  if (data.tasks.some(t => t.visibility !== 'company' || !t.id || !t.user_id || !['active', 'done'].includes(t.status))) throw new Error('The monitoring endpoint returned work that is not explicitly company-shared.');
  return data;
}
export function filterWork(tasks, people, filters, now = new Date()) {
  const byId = new Map(people.map(p => [p.user_id, p]));
  return tasks.filter(t => {
    const p = byId.get(t.user_id);
    const matches = `${t.title} ${t.category || ''} ${p?.full_name || ''} ${p?.job_title || ''}`.toLowerCase().includes((filters.search || '').toLowerCase());
    return matches && (!filters.person || t.user_id === filters.person) && (!filters.category || t.category === filters.category)
      && (!filters.priority || (filters.priority === 'high' ? isHigh(t) : t.status === 'active' && !isHigh(t)))
      && (!filters.status || t.status === filters.status) && deadlineMatches(t, filters.deadline, now);
  });
}
export function metrics(tasks, now = new Date()) {
  return { shared: tasks.length, high: tasks.filter(isHigh).length, week: tasks.filter(t => deadlineMatches(t, 'week', now)).length,
    upcoming: tasks.filter(t => deadlineMatches(t, 'soon', now)).length, overdue: tasks.filter(t => deadlineMatches(t, 'overdue', now)).length };
}
export function priorityFeed(tasks) {
  return [...tasks].filter(t => t.status === 'active').sort((a,b) => Number(isHigh(b)) - Number(isHigh(a)) || a.sort_order - b.sort_order || (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.id.localeCompare(b.id));
}
export function attentionWork(tasks, now = new Date()) {
  const today = localDate(now), end = new Date(now);
  end.setDate(now.getDate() + 3);
  const dueSoonEnd = localDate(end);
  const groups = { overdue: [], today: [], soon: [] };
  for (const task of tasks) {
    if (task.status !== 'active' || !task.deadline) continue;
    if (task.deadline < today) groups.overdue.push(task);
    else if (task.deadline === today) groups.today.push(task);
    else if (task.deadline <= dueSoonEnd) groups.soon.push(task);
  }
  const sort = (a, b) => a.deadline.localeCompare(b.deadline) || Number(isHigh(b)) - Number(isHigh(a)) || a.sort_order - b.sort_order;
  for (const group of Object.values(groups)) group.sort(sort);
  return groups;
}
