/**
 * Public student feedback page `/s/feedback/:token` (4f). noindex.
 */
import { apiGet, ApiClientError } from '@/api/client';
import { createStudentShell, renderStudentChrome, renderStudentStatus } from '@/student/shell';

export type MountStudentFeedbackViewOptions = {
  root: HTMLElement;
  token: string;
  isStale?: () => boolean;
};

export type StudentFeedbackViewHandle = {
  dispose(): void;
};

type PublishedFeedback = {
  title: string;
  body_html: string;
  student_label?: string | null;
  audio_url?: string;
};

function ensureNoIndex(): () => void {
  let robots = document.querySelector('meta[name="robots"]');
  const created = !robots;
  if (!robots) {
    robots = document.createElement('meta');
    robots.setAttribute('name', 'robots');
    document.head.append(robots);
  }
  const previous = robots.getAttribute('content');
  robots.setAttribute('content', 'noindex');
  return () => {
    if (created) robots?.remove();
    else if (previous == null) robots?.removeAttribute('content');
    else robots?.setAttribute('content', previous);
  };
}

export function mountStudentFeedbackView(
  options: MountStudentFeedbackViewOptions
): StudentFeedbackViewHandle {
  const { root, token, isStale = () => false } = options;
  const clearNoIndex = ensureNoIndex();
  let disposed = false;

  root.replaceChildren();
  const { surface, header, content } = createStudentShell('student-feedback-surface');
  root.append(surface);
  renderStudentChrome(header, { brand: 'Teaching Hub' });
  renderStudentStatus(content, 'Loading feedback…');

  void (async () => {
    try {
      const data = await apiGet<PublishedFeedback>(
        `/api/published/feedback/${encodeURIComponent(token)}`
      );
      if (disposed || isStale()) return;
      content.replaceChildren();

      const article = document.createElement('article');
      article.className = 'student-feedback';

      const title = document.createElement('h1');
      title.className = 'student-feedback__title';
      title.textContent = data.title || 'Feedback';
      article.append(title);

      if (data.student_label) {
        const label = document.createElement('p');
        label.className = 'student-feedback__label';
        label.textContent = data.student_label;
        article.append(label);
      }

      const body = document.createElement('div');
      body.className = 'student-feedback__body';
      body.innerHTML = data.body_html || '';
      article.append(body);

      if (data.audio_url) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = data.audio_url;
        audio.className = 'student-feedback__audio';
        article.append(audio);
      }

      content.append(article);
    } catch (error) {
      if (disposed || isStale()) return;
      const message =
        error instanceof ApiClientError && error.code === 'not_found'
          ? 'This feedback link is not available.'
          : 'Unable to load feedback.';
      renderStudentStatus(content, message);
    }
  })();

  return {
    dispose() {
      disposed = true;
      clearNoIndex();
    }
  };
}
