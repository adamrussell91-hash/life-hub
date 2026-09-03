/**
 * Google Drive Picker (client-only).
 *
 * Env (Vite): `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_PICKER_API_KEY`,
 * optional `VITE_GOOGLE_APP_ID` (Cloud project number for PickerBuilder.setAppId).
 * Tokens stay in-memory for the pick flow and are never persisted.
 * Production Pages can also load the same public picker values from
 * GET /api/drive-picker-config (Netlify: GOOGLE_CLIENT_ID / GOOGLE_PICKER_API_KEY).
 */

import {
  resolveGooglePickerConfig,
  type GooglePickerConfig
} from '@/teacher/google-picker-config';

export { pickerConfigFromValues, resolveGooglePickerConfig } from '@/teacher/google-picker-config';
export type { GooglePickerConfig } from '@/teacher/google-picker-config';

export function isGoogleNativeMime(mime: string): boolean {
  return mime.startsWith('application/vnd.google-apps.');
}

export type MediaSharing = 'public_link' | 'restricted' | 'unknown' | 'unavailable';

export function sharingFromDriveFile(
  file: { shared?: boolean; capabilities?: { canShare?: boolean } },
  anyoneWithLink: boolean
): MediaSharing {
  if (anyoneWithLink) return 'public_link';
  if (file.shared === false) return 'restricted';
  return 'unknown';
}

export type DrivePickResult =
  | { kind: 'mirror'; file: File; provider_file_id: string; title: string }
  | {
      kind: 'link';
      title: string;
      provider_file_id: string;
      preview_url: string;
      sharing: MediaSharing;
      media_type: 'link' | 'other';
    };

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const GAPI_SRC = 'https://apis.google.com/js/api.js';
// drive.file is enough: selecting a file in Picker grants the app access to that file,
// so we avoid the broader drive.readonly scope.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const scriptLoads = new Map<string, Promise<void>>();

function loadScriptOnce(src: string): Promise<void> {
  const cached = scriptLoads.get(src);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error(`Failed to load script: ${src}`)),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = '1';
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      'error',
      () => reject(new Error(`Failed to load script: ${src}`)),
      { once: true }
    );
    document.head.append(script);
  });

  scriptLoads.set(src, promise);
  return promise;
}

type TokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type PickerDoc = {
  id?: string;
  name?: string;
  mimeType?: string;
};

type PickerCallbackData = {
  action: string;
  docs?: PickerDoc[];
};

type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  shared?: boolean;
  capabilities?: { canShare?: boolean };
};

type PickerBuilder = {
  addView: (view: unknown) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  setCallback: (cb: (data: PickerCallbackData) => void) => PickerBuilder;
  setTitle: (title: string) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
};

/** Minimal ambient surface for GIS + Picker (no npm deps). */
declare global {
  // eslint-disable-next-line no-var
  var google: {
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (response: TokenResponse) => void;
          error_callback?: (error: { type?: string; message?: string }) => void;
        }) => TokenClient;
      };
    };
    picker: {
      Action: { CANCEL: string; PICKED: string };
      ViewId: { DOCS: unknown; DOCS_IMAGES: unknown; PDFS: unknown };
      PickerBuilder: new () => PickerBuilder;
    };
  };
  // eslint-disable-next-line no-var
  var gapi: {
    load: (api: string, callback: () => void) => void;
  };
}

async function loadRemotePickerConfig(): Promise<GooglePickerConfig | null> {
  try {
    const { apiGet } = await import('@/api/client');
    return await apiGet<GooglePickerConfig>('/api/drive-picker-config');
  } catch {
    return null;
  }
}

function viteGoogleEnv(): { clientId?: string; apiKey?: string; appId?: string } {
  return {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    apiKey: import.meta.env.VITE_GOOGLE_PICKER_API_KEY,
    appId: import.meta.env.VITE_GOOGLE_APP_ID
  };
}

async function loadGoogleApis(): Promise<void> {
  await Promise.all([loadScriptOnce(GIS_SRC), loadScriptOnce(GAPI_SRC)]);
  await new Promise<void>((resolve, reject) => {
    try {
      gapi.load('picker', () => resolve());
    } catch (cause) {
      reject(cause instanceof Error ? cause : new Error('Failed to load Google Picker'));
    }
  });
}

function requestAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                'Google authorization was cancelled or failed'
            )
          );
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (error) => {
        reject(new Error(error.message || error.type || 'Google authorization failed'));
      }
    });
    client.requestAccessToken({ prompt: '' });
  });
}

function showPicker(opts: {
  accessToken: string;
  apiKey: string;
  appId?: string;
}): Promise<PickerDoc | null> {
  return new Promise((resolve) => {
    const builder = new google.picker.PickerBuilder()
      .addView(google.picker.ViewId.DOCS)
      .addView(google.picker.ViewId.DOCS_IMAGES)
      .addView(google.picker.ViewId.PDFS)
      .setOAuthToken(opts.accessToken)
      .setDeveloperKey(opts.apiKey)
      .setTitle('Select a file from Drive')
      .setCallback((data: PickerCallbackData) => {
        if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
          return;
        }
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs?.[0];
          resolve(doc ?? null);
        }
      });

    if (opts.appId) {
      builder.setAppId(opts.appId);
    }

    builder.build().setVisible(true);
  });
}

async function fetchDriveFileMeta(fileId: string, accessToken: string): Promise<DriveFileMeta> {
  const fields =
    'id,name,mimeType,webViewLink,webContentLink,thumbnailLink,capabilities,shared';
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`Could not read Drive file metadata (HTTP ${response.status})`);
  }
  const body = (await response.json()) as Partial<DriveFileMeta>;
  if (!body.id || !body.name || !body.mimeType) {
    throw new Error('Drive file metadata was incomplete');
  }
  return body as DriveFileMeta;
}

async function downloadDriveFile(
  fileId: string,
  name: string,
  mimeType: string,
  accessToken: string
): Promise<File> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`Could not download Drive file (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  return new File([blob], name, { type: mimeType || blob.type || 'application/octet-stream' });
}

export async function openDrivePicker(): Promise<DrivePickResult | null> {
  const { clientId, apiKey, appId } = await resolveGooglePickerConfig({
    vite: viteGoogleEnv(),
    loadRemote: loadRemotePickerConfig
  });
  await loadGoogleApis();
  const accessToken = await requestAccessToken(clientId);
  const picked = await showPicker({ accessToken, apiKey, appId });
  if (!picked?.id) return null;

  const meta = await fetchDriveFileMeta(picked.id, accessToken);
  // v1: skip permissions.list probe; conservative sharing from files.get only.
  const sharing = sharingFromDriveFile(meta, false);

  if (isGoogleNativeMime(meta.mimeType)) {
    const preview_url = meta.webViewLink?.trim() ?? '';
    if (!preview_url) {
      throw new Error(
        'This Google file has no shareable link. Open it in Drive and ensure it can be viewed via a link.'
      );
    }
    return {
      kind: 'link',
      title: meta.name,
      provider_file_id: meta.id,
      preview_url,
      sharing,
      media_type: 'link'
    };
  }

  const file = await downloadDriveFile(meta.id, meta.name, meta.mimeType, accessToken);
  return {
    kind: 'mirror',
    file,
    provider_file_id: meta.id,
    title: meta.name
  };
}
