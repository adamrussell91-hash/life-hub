/**
 * Teaching › Feedback — minimal private feedback docs (4f).
 */
import { apiGet, apiPost, ApiClientError } from '@/api/client';
import { askTextCard } from '@/teacher/confirm-dialog';
import { renderPageHeader } from '@/teacher/page-header';

type FeedbackDoc = {
  id: string;
  title: string;
  body_html: string;
  student_label: string | null;
  has_link: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export function renderFeedbackSection(canvas: HTMLElement): { dispose: () => void } {
  canvas.replaceChildren();
  renderPageHeader(canvas, {
    eyebrow: 'Teaching',
    title: 'Feedback'
  });

  const root = document.createElement('div');
  root.className = 'feedback-page';

  const status = document.createElement('p');
  status.className = 'block-editor__hint';
  status.setAttribute('aria-live', 'polite');

  const actions = document.createElement('div');
  actions.className = 'feedback-page__actions';
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'btn btn--primary';
  newBtn.textContent = 'New';
  actions.append(newBtn);

  const list = document.createElement('div');
  list.className = 'feedback-page__list';

  root.append(actions, status, list);
  canvas.append(root);

  let disposed = false;

  async function refresh(): Promise<void> {
    status.textContent = 'Loading…';
    try {
      const data = await apiGet<{ items: FeedbackDoc[] }>('/api/teaching/feedback');
      if (disposed) return;
      paint(data.items ?? []);
      status.textContent = data.items?.length ? '' : 'No feedback yet.';
    } catch (error) {
      if (disposed) return;
      status.textContent =
        error instanceof ApiClientError ? error.message : 'Unable to load feedback.';
    }
  }

  function paint(items: FeedbackDoc[]): void {
    list.replaceChildren();
    for (const item of items) {
      const card = document.createElement('article');
      card.className = 'feedback-page__card';
      const title = document.createElement('h3');
      title.textContent = item.title;
      const meta = document.createElement('p');
      meta.className = 'block-editor__hint';
      meta.textContent = [
        item.student_label ? `For ${item.student_label}` : null,
        item.has_link ? 'Link active' : item.revoked_at ? 'Link revoked' : 'No link'
      ]
        .filter(Boolean)
        .join(' · ');

      const row = document.createElement('div');
      row.className = 'feedback-page__card-actions';

      const linkBtn = document.createElement('button');
      linkBtn.type = 'button';
      linkBtn.className = 'btn btn--secondary';
      linkBtn.textContent = item.has_link ? 'New link' : 'Create link';
      linkBtn.addEventListener('click', () => {
        void (async () => {
          try {
            const result = await apiPost<{ token: string; path: string }>(
              `/api/teaching/feedback/${item.id}/link`,
              {}
            );
            const url = `${window.location.origin}${result.path}`;
            await navigator.clipboard?.writeText(url).catch(() => undefined);
            status.textContent = `Private link ready${navigator.clipboard ? ' (copied)' : ''}: ${url}`;
            await refresh();
          } catch (error) {
            status.textContent =
              error instanceof ApiClientError ? error.message : 'Could not create link.';
          }
        })();
      });

      const revokeBtn = document.createElement('button');
      revokeBtn.type = 'button';
      revokeBtn.className = 'btn btn--ghost';
      revokeBtn.textContent = 'Revoke';
      revokeBtn.disabled = !item.has_link;
      revokeBtn.addEventListener('click', () => {
        void (async () => {
          try {
            await apiPost(`/api/teaching/feedback/${item.id}/revoke`, {});
            status.textContent = 'Link revoked.';
            await refresh();
          } catch (error) {
            status.textContent =
              error instanceof ApiClientError ? error.message : 'Could not revoke link.';
          }
        })();
      });

      row.append(linkBtn, revokeBtn);
      card.append(title, meta, row);
      list.append(card);
    }
  }

  newBtn.addEventListener('click', () => {
    void (async () => {
      const title = await askTextCard({ title: 'Feedback title', placeholder: 'Draft feedback' });
      if (!title) return;
      const student = await askTextCard({
        title: 'Student label (optional)',
        placeholder: 'Optional',
        optional: true
      });
      const body = await askTextCard({
        title: 'Short note',
        placeholder: 'What to focus on next',
        optional: true
      });
      try {
        await apiPost('/api/teaching/feedback', {
          title,
          student_label: student || undefined,
          body_html: body ? `<p>${body.replace(/</g, '&lt;')}</p>` : ''
        });
        status.textContent = 'Feedback saved.';
        await refresh();
      } catch (error) {
        status.textContent =
          error instanceof ApiClientError ? error.message : 'Could not save feedback.';
      }
    })();
  });

  void refresh();

  return {
    dispose: () => {
      disposed = true;
      root.remove();
    }
  };
}
