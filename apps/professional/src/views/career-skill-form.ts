import { createAchievement } from '@/api/career';

export function openAddSkillSheet(root: HTMLElement, onSaved: () => void): void {
  if (root.querySelector('[aria-label="Add skill card"]')) return;
  const previousFocus = document.activeElement as HTMLElement | null;
  const sheet = document.createElement('div');
  sheet.className = 'career-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Add skill card');
  const form = document.createElement('form');
  form.className = 'career-sheet__inner';
  const heading = document.createElement('h2');
  heading.className = 'career-page__heading';
  heading.textContent = 'Add skill card';
  form.append(heading);
  function field(name: string, label: string, multiline = false) {
    const wrapper = document.createElement('label');
    wrapper.className = 'career-sheet__field';
    wrapper.append(label);
    const input = multiline ? document.createElement('textarea') : document.createElement('input');
    input.name = name;
    if (input instanceof HTMLTextAreaElement) { input.rows = 3; input.maxLength = 2000; }
    wrapper.append(input);
    form.append(wrapper);
    return input;
  }
  const title = field('title', 'Title');
  title.required = true;
  title.maxLength = 300;
  const date = field('occurred_on', 'Date') as HTMLInputElement;
  date.type = 'date';
  date.required = true;
  const today = new Date();
  date.value = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  const skills = field('skills', 'Skills (comma-separated)');
  const star = {
    situation: field('situation', 'Situation (optional)', true),
    task: field('task', 'Task (optional)', true),
    action: field('action', 'Action (optional)', true),
    result: field('result', 'Result (optional)', true)
  };
  const status = document.createElement('p');
  status.className = 'career-page__meta';
  status.setAttribute('role', 'status');
  const actions = document.createElement('div');
  actions.className = 'career-sheet__actions';
  const save = document.createElement('button');
  save.className = 'btn btn--primary';
  save.type = 'submit';
  save.textContent = 'Save card';
  const cancel = document.createElement('button');
  cancel.className = 'btn btn--ghost';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  let saving = false;
  function close() {
    if (saving) return;
    sheet.remove();
    previousFocus?.focus();
  }
  cancel.addEventListener('click', close);
  sheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const controls = [...form.querySelectorAll<HTMLElement>('input, textarea, button')]
        .filter(node => !(node as HTMLInputElement).disabled);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (saving) return;
    if (!title.value.trim()) { status.textContent = 'Enter a title.'; title.focus(); return; }
    if (!form.reportValidity()) return;
    const skillNames = [...new Set(skills.value.split(',').map(s => s.trim()).filter(Boolean))];
    if (skillNames.length > 12 || skillNames.some(s => s.length > 60)) {
      status.textContent = 'Enter up to 12 skills, each 60 characters or fewer.';
      skills.focus();
      return;
    }
    saving = true;
    save.disabled = true;
    cancel.disabled = true;
    status.textContent = 'Saving…';
    void (async () => {
      try {
        await createAchievement({ title: title.value.trim(), occurred_on: date.value,
          date_precision: 'day', origin: 'manual', skills: skillNames,
          star: Object.fromEntries(Object.entries(star).map(([key, input]) => [key, input.value.trim() || null])) });
        saving = false;
        close();
        onSaved();
      } catch (error) {
        saving = false;
        save.disabled = false;
        cancel.disabled = false;
        status.textContent = error instanceof Error ? error.message : 'Could not save. Try again.';
      }
    })();
  });
  actions.append(save, cancel);
  form.append(actions, status);
  sheet.append(form);
  root.append(sheet);
  title.focus();
}
