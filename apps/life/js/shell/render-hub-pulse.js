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
  if (kind === 'classes') return n === 1 ? '1 class' : `${n.toLocaleString('en-AU')} classes`;
  if (kind === 'notes') return n === 1 ? '1 note' : `${n.toLocaleString('en-AU')} notes`;
  if (kind === 'tasks') return n === 1 ? '1 open task' : `${n.toLocaleString('en-AU')} open tasks`;
  return String(n);
}

export function renderHubPulse(root, pulses = {}) {
  for (const section of listHubSections()) {
    const card = root.querySelector?.(`[data-hub-pulse="${section.id}"]`);
    if (!card) continue;
    const pulse = pulses[section.id] ?? { status: 'loading' };
    const countNode = card.querySelector('[data-hub-count]');
    const statusNode = card.querySelector('[data-hub-status]');
    const ready = pulse.status === 'ready';
    setText(countNode, ready ? formatHubPulseCount(section.pulse, pulse.count ?? 0) : '—');
    setText(statusNode, STATUS_COPY[pulse.status] ?? '');
    if (statusNode) statusNode.hidden = !statusNode.textContent;
    card.dataset.hubState = pulse.status;
  }
}
