import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountAlchemyLabPanel } from '@/teacher/alchemy-lab-panel';

const runMock = vi.hoisted(() => vi.fn());

vi.mock('@/alchemy/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/alchemy/client')>();
  return { ...actual, runAlchemyLab: runMock };
});

describe('Alchemy Lab panel', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('prefills on open and does not overwrite when selection changes', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const panel = mountAlchemyLabPanel(host);
    panel.open('Heaney');
    const textarea = host.querySelector('textarea')!;
    expect(textarea.value).toBe('Heaney');
    panel.setSelectionText('Caesar', true);
    expect(textarea.value).toBe('Heaney');
    host.querySelector<HTMLButtonElement>('.alchemy-lab__use-selection')!.click();
    expect(textarea.value).toBe('Caesar');
    panel.dispose();
  });

  it('disables Find connections when empty', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountAlchemyLabPanel(host);
    const find = [...host.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Find connections')
    )!;
    expect(find.disabled).toBe(true);
  });

  it('renders capped Open links after a run', async () => {
    runMock.mockResolvedValue({
      mode: 'synthesis',
      connections: [
        {
          icon: 'Irony',
          summary: 'Duty',
          sourcePageId: 'note_1',
          sourcePageTitle: 'Caesar',
          sourceExcerpt: 'excerpt',
          whyNonObvious: 'why'
        }
      ]
    });
    const host = document.createElement('div');
    document.body.append(host);
    const panel = mountAlchemyLabPanel(host);
    panel.open('Heaney');
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
    const link = host.querySelector<HTMLAnchorElement>('a[target="_blank"]');
    expect(link?.href).toContain('#page/note_1');
    expect(link?.rel).toContain('noopener');
    panel.dispose();
  });
});
