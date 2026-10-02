import { getAchievement, updateAchievement } from '@/api/career';
import { openAddSkillSheet } from '@/views/career-skill-form';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export async function renderSkillCardDetail(canvas: HTMLElement, id: string): Promise<void> {
  showViewLoading(canvas, 'Loading skill card…');
  try {
    const { achievement: card } = await getAchievement(id);
    const panel = document.createElement('section');
    panel.className = 'career-page__panel';
    const back = document.createElement('a'); back.className = 'btn btn--ghost';
    back.href = '#/career'; back.textContent = 'Back to skills ledger';
    const heading = document.createElement('h2'); heading.className = 'career-page__heading'; heading.textContent = card.title;
    const date = document.createElement('p'); date.className = 'career-page__meta';
    date.textContent = card.date_precision === 'year' ? card.occurred_on.slice(0, 4)
      : card.date_precision === 'month' ? (formatDisplayDate(card.occurred_on) ?? '').slice(3)
      : formatDisplayDate(card.occurred_on) ?? card.occurred_on;
    panel.append(back, heading, date);
    if (card.skills.length) {
      const skills = document.createElement('p'); skills.textContent = 'Skills: ' + card.skills.join(', '); panel.append(skills);
    }
    if (card.apst?.length) {
      const apst = document.createElement('p'); apst.textContent = 'APST: ' + card.apst.join(', '); panel.append(apst);
    }
    for (const key of ['situation', 'task', 'action', 'result'] as const) {
      if (!card.star[key]) continue;
      const label = document.createElement('h3'); label.textContent = key[0].toUpperCase() + key.slice(1);
      const evidence = document.createElement('p'); evidence.style.whiteSpace = 'pre-wrap'; evidence.textContent = card.star[key];
      panel.append(label, evidence);
    }
    const actions = document.createElement('div'); actions.className = 'career-sheet__actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn--secondary'; edit.textContent = 'Edit card';
    edit.addEventListener('click', () => openAddSkillSheet(document.body, () => { void renderSkillCardDetail(canvas, id); }, card));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn--ghost'; remove.textContent = 'Delete card';
    const confirm = document.createElement('div'); confirm.className = 'confirm-card'; confirm.hidden = true; confirm.style.display = 'none';
    const message = document.createElement('p'); message.textContent = 'Delete this skill card? It will be removed from your ledger and career evidence.';
    const commit = document.createElement('button'); commit.type = 'button'; commit.className = 'btn btn--primary'; commit.textContent = 'Confirm delete';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn--ghost'; cancel.textContent = 'Keep card';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    remove.addEventListener('click', () => { confirm.hidden = false; confirm.style.removeProperty('display'); commit.focus(); });
    cancel.addEventListener('click', () => { confirm.hidden = true; confirm.style.display = 'none'; remove.focus(); });
    commit.addEventListener('click', () => {
      if (commit.disabled) return;
      commit.disabled = true; cancel.disabled = true; edit.disabled = true; remove.disabled = true;
      void (async () => {
        try { await updateAchievement(id, { lifecycle_status: 'deleted' }); location.hash = '#/career'; }
        catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not delete. Try again.';
          commit.disabled = false; cancel.disabled = false; edit.disabled = false; remove.disabled = false; }
      })();
    });
    actions.append(edit, remove); confirm.append(message, commit, cancel, status); panel.append(actions, confirm);
    canvas.replaceChildren(panel);
  } catch (error) {
    renderLoadError(canvas, error, () => { void renderSkillCardDetail(canvas, id); });
    const back = document.createElement('a'); back.href = '#/career'; back.textContent = 'Back to skills ledger'; canvas.append(back);
  }
}
