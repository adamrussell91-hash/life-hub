import { describe, it, expect } from 'vitest';
import {
  isGoogleNativeMime,
  pickerConfigFromValues,
  resolveGooglePickerConfig,
  sharingFromDriveFile
} from '@/teacher/drive-picker';

describe('isGoogleNativeMime', () => {
  it('maps Google Doc mime to native', () => {
    expect(isGoogleNativeMime('application/vnd.google-apps.document')).toBe(true);
  });

  it('maps spreadsheet, presentation, form, drawing, folder, shortcut', () => {
    expect(isGoogleNativeMime('application/vnd.google-apps.spreadsheet')).toBe(true);
    expect(isGoogleNativeMime('application/vnd.google-apps.presentation')).toBe(true);
    expect(isGoogleNativeMime('application/vnd.google-apps.form')).toBe(true);
    expect(isGoogleNativeMime('application/vnd.google-apps.drawing')).toBe(true);
    expect(isGoogleNativeMime('application/vnd.google-apps.folder')).toBe(true);
    expect(isGoogleNativeMime('application/vnd.google-apps.shortcut')).toBe(true);
  });

  it('maps image mime to mirror path (not native)', () => {
    expect(isGoogleNativeMime('image/png')).toBe(false);
    expect(isGoogleNativeMime('image/jpeg')).toBe(false);
  });

  it('rejects pdf and other binary types', () => {
    expect(isGoogleNativeMime('application/pdf')).toBe(false);
    expect(isGoogleNativeMime('text/plain')).toBe(false);
    expect(isGoogleNativeMime('')).toBe(false);
  });
});

describe('sharingFromDriveFile', () => {
  it('returns public_link when anyoneWithLink is true', () => {
    expect(
      sharingFromDriveFile({ shared: true, capabilities: { canShare: true } }, true)
    ).toBe('public_link');
    expect(sharingFromDriveFile({ shared: false }, true)).toBe('public_link');
    expect(sharingFromDriveFile({}, true)).toBe('public_link');
  });

  it('returns restricted when shared is explicitly false', () => {
    expect(sharingFromDriveFile({ shared: false }, false)).toBe('restricted');
  });

  it('returns unknown when shared is true without anyoneWithLink (v1 conservative)', () => {
    expect(
      sharingFromDriveFile({ shared: true, capabilities: { canShare: true } }, false)
    ).toBe('unknown');
  });

  it('returns unknown when shared is absent', () => {
    expect(sharingFromDriveFile({}, false)).toBe('unknown');
  });
});

describe('resolveGooglePickerConfig', () => {
  it('uses Vite values when both client id and api key are present', async () => {
    await expect(
      resolveGooglePickerConfig({
        vite: {
          clientId: ' client.apps.googleusercontent.com ',
          apiKey: ' key ',
          appId: ' 123 '
        },
        loadRemote: async () => {
          throw new Error('should not fetch');
        }
      })
    ).resolves.toEqual({
      clientId: 'client.apps.googleusercontent.com',
      apiKey: 'key',
      appId: '123'
    });
  });

  it('falls back to the teacher API when Vite values are missing', async () => {
    await expect(
      resolveGooglePickerConfig({
        vite: { clientId: '', apiKey: '' },
        loadRemote: async () => ({
          clientId: 'remote-client',
          apiKey: 'remote-key'
        })
      })
    ).resolves.toEqual({
      clientId: 'remote-client',
      apiKey: 'remote-key'
    });
  });

  it('throws a configured error when neither source has keys', async () => {
    await expect(
      resolveGooglePickerConfig({
        vite: {},
        loadRemote: async () => null
      })
    ).rejects.toThrow('Google Drive is not configured');
  });
});

describe('pickerConfigFromValues', () => {
  it('returns null when either required value is missing', () => {
    expect(pickerConfigFromValues({ clientId: 'x' })).toBeNull();
    expect(pickerConfigFromValues({ apiKey: 'y' })).toBeNull();
  });
});
