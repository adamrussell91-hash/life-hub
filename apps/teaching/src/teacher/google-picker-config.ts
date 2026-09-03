export type GooglePickerConfig = {
  clientId: string;
  apiKey: string;
  appId?: string;
};

export function pickerConfigFromValues(values: {
  clientId?: string;
  apiKey?: string;
  appId?: string;
}): GooglePickerConfig | null {
  const clientId = values.clientId?.trim();
  const apiKey = values.apiKey?.trim();
  const appId = values.appId?.trim();
  if (!clientId || !apiKey) return null;
  return { clientId, apiKey, ...(appId ? { appId } : {}) };
}

export async function resolveGooglePickerConfig(options: {
  vite?: { clientId?: string; apiKey?: string; appId?: string };
  loadRemote?: () => Promise<GooglePickerConfig | null>;
}): Promise<GooglePickerConfig> {
  const local = pickerConfigFromValues(options.vite ?? {});
  if (local) return local;
  const remote = options.loadRemote ? await options.loadRemote() : null;
  const fromRemote = remote ? pickerConfigFromValues(remote) : null;
  if (fromRemote) return fromRemote;
  throw new Error(
    'Google Drive is not configured (missing VITE_GOOGLE_CLIENT_ID / VITE_GOOGLE_PICKER_API_KEY)'
  );
}
