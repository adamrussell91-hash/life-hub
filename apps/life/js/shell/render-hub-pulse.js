import { listHubSections } from './hub-sections.js';

const STATUS_COPY = {
  loading: 'Checking…',
  ready: '',
  unbound: 'Not bound yet',
  error: 'Could not load'
};

function setText(node, text) {
  if (!node) return;
  node.textContent = text ?? '';
}

export function formatHubPulseCount(kind, count) {
  const n = Number.isFinite(count) ? count : 0;
  if (kind === 'tasks') return n === 1 ? '1 open task' : `${n.toLocaleString('en-AU')} open tasks`;
  return String(n);
}

export function formatLessonGlance(lesson) {
  if (!lesson) return 'No lessons today';
  const label = lesson.lessonTitle ? `${lesson.classTitle} · ${lesson.lessonTitle}` : lesson.classTitle;
  return lesson.startTime ? `${label} · ${lesson.startTime}` : label;
}

export function renderHubPulse(root, pulses = {}) {
  for (const section of listHubSections()) {
    const card = root.querySelector?.(`[data-hub-pulse="${section.id}"]`);
    if (!card) continue;
    const pulse = pulses[section.id] ?? { status: 'loading' };
    const statusNode = card.querySelector('[data-hub-status]');
    const ready = pulse.status === 'ready';
    card.dataset.hubState = pulse.status;

    if (section.pulse === 'tasks') {
      setText(card.querySelector('[data-hub-count]'), ready ? formatHubPulseCount('tasks', pulse.count ?? 0) : '—');
    }
    if (section.pulse === 'classes') {
      setText(card.querySelector('[data-hub-glance]'), ready ? formatLessonGlance(pulse.nextLesson) : 'Checking…');
    }

    setText(statusNode, STATUS_COPY[pulse.status] ?? '');
    if (statusNode) statusNode.hidden = !statusNode.textContent;
  }
}
