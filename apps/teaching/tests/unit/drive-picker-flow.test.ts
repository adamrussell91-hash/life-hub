import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Google Picker image view and token lifetime', () => {
  let requestToken: ReturnType<typeof vi.fn>;
  let views: unknown[];
  let cancelImmediately: boolean;
  let visibility: boolean[];
  let open: typeof import('@/teacher/drive-picker')['openDrivePicker'];

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T00:00:00Z'));
    vi.doMock('@/teacher/google-picker-config', () => ({
      resolveGooglePickerConfig: async () => ({ clientId: 'test-client', apiKey: 'test-key', appId: '123' })
    }));
    document.head.replaceChildren();
    for (const src of ['https://accounts.google.com/gsi/client', 'https://apis.google.com/js/api.js']) {
      const script = document.createElement('script');
      script.type = 'text/plain';
      script.src = src;
      script.dataset.loaded = '1';
      document.head.append(script);
    }
    views = [];
    cancelImmediately = true;
    visibility = [];
    requestToken = vi.fn();
    class Builder {
      callback!: (data: { action: string }) => void;
      addView(view: unknown) { views.push(view); return this; }
      setOAuthToken() { return this; }
      setDeveloperKey() { return this; }
      setAppId() { return this; }
      setTitle() { return this; }
      setCallback(callback: typeof this.callback) { this.callback = callback; return this; }
      build() { return { setVisible: (visible: boolean) => { visibility.push(visible); if (visible && cancelImmediately) this.callback({ action: 'cancel' }); } }; }
    }
    vi.stubGlobal('gapi', { load: (_: string, callback: () => void) => callback() });
    vi.stubGlobal('google', {
      accounts: { oauth2: { initTokenClient: ({ callback }: { callback: (data: unknown) => void }) => ({
        requestAccessToken: () => { requestToken(); callback({ access_token: 'in-memory-test-token', expires_in: 3600 }); }
      }) } },
      picker: { Action: { CANCEL: 'cancel', PICKED: 'picked' }, ViewId: { DOCS: 'docs', DOCS_IMAGES: 'images', PDFS: 'pdfs' }, PickerBuilder: Builder }
    });
    open = (await import('@/teacher/drive-picker')).openDrivePicker;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.doUnmock('@/teacher/google-picker-config');
    document.head.replaceChildren();
  });

  it('offers only the image view for a cover', async () => {
    await open({ imagesOnly: true });
    expect(views).toEqual(['images']);
  });

  it('reuses a valid token for the immediate second pick and renews it after expiry', async () => {
    await open();
    await open();
    expect(requestToken).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-10T01:00:00Z'));
    await open();
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it('hides an active picker when the requesting view is disposed', async () => {
    cancelImmediately = false;
    const controller = new AbortController();
    const pending = open({ signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    for (let i = 0; i < 20 && visibility.length === 0; i++) await Promise.resolve();
    expect(visibility).toEqual([true]);
    controller.abort();
    await rejected;
    expect(visibility).toEqual([true, false]);
  });

  it('never opens a picker after the requesting view is disposed during loading', async () => {
    let loaded!: () => void;
    vi.stubGlobal('gapi', { load: (_: string, callback: () => void) => { loaded = callback; } });
    const controller = new AbortController();
    const pending = open({ signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    for (let i = 0; i < 10 && !loaded; i++) await Promise.resolve();
    expect(loaded).toBeDefined();
    controller.abort();
    loaded();
    await rejected;
    expect(requestToken).not.toHaveBeenCalled();
    expect(views).toEqual([]);
  });
});
