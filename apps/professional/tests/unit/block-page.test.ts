import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountBlockPage } from '@/components/block-page';

describe('mountBlockPage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('shows the round + and saves inserted blocks after a pause', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const page = mountBlockPage(host, { blocks: [], onSave, debounceMs: 400 });
    host.querySelector<HTMLButtonElement>('.page-editor__add-btn')!.click();
    host.querySelector<HTMLButtonElement>('[data-block-type="rich_text"]')!.click();
    expect(onSave).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0] as Array<{ block_type: string }>;
    expect(saved.map((block) => block.block_type)).toEqual(['rich_text']);
    page.dispose();
  });

  it('flush saves at once', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const page = mountBlockPage(host, { blocks: [], onSave, debounceMs: 400 });
    host.querySelector<HTMLButtonElement>('.page-editor__add-btn')!.click();
    host.querySelector<HTMLButtonElement>('[data-block-type="heading"]')!.click();
    await page.flush();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
