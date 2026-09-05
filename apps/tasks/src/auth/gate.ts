import { apiGet, apiPost, ApiClientError } from '@/api/client';

export interface SessionInfo {
  authenticated: boolean;
  expiresAt?: number;
}

export async function fetchSession(): Promise<SessionInfo> {
  return apiGet<SessionInfo>('/api/session');
}

export function normalizePassphrase(value: string): string {
  return value.normalize('NFC').trim();
}

/**
 * Safari can show keystrokes in a password field while `input.value` is still
 * empty at submit. Keep a live copy and also read FormData.
 */
export function attachPassphraseCapture(
  input: HTMLInputElement,
  form: HTMLFormElement
): () => string {
  let typed = '';
  const remember = (value: string) => {
    if (value.length > 0) typed = value;
  };
  input.addEventListener('input', () => remember(input.value));
  input.addEventListener('keyup', () => remember(input.value));
  input.addEventListener('beforeinput', (event) => {
    if (event.inputType === 'insertText' && event.data && !input.value) {
      typed += event.data;
    }
  });
  return () => {
    const fromForm = new FormData(form).get('passphrase');
    const candidates = [input.value, typeof fromForm === 'string' ? fromForm : '', typed];
    return normalizePassphrase(candidates.find((value) => value.length > 0) ?? '');
  };
}

export const API_SIGN_IN_URL = 'https://api.adam-russell.com';

export function messageForSignInFailure(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'invalid_credentials') return 'Invalid passphrase';
    if (err.code === 'invalid_response') {
      return 'The sign-in service did not respond. Try again.';
    }
    if (err.code === 'forbidden') {
      return `This origin is blocked. Open ${API_SIGN_IN_URL}`;
    }
    if (err.code === 'usage_exceeded') {
      return 'Sign-in is paused: the Netlify API host is over its usage limit. Add credits on artasks-hub, then try again.';
    }
    if (err.code === 'platform_unavailable') {
      return 'The sign-in service is unavailable. Try again in a few minutes.';
    }
    if (err.code === 'network_error') {
      return `Could not reach the API. If ${API_SIGN_IN_URL} is also down, Netlify usage on artasks-hub is exceeded.`;
    }
    return err.message || 'Unable to sign in. Please try again.';
  }
  return 'Unable to sign in. Please try again.';
}

export async function authenticate(passphrase: string): Promise<SessionInfo> {
  return apiPost<SessionInfo>('/api/auth', { passphrase: normalizePassphrase(passphrase) });
}

export async function logout(): Promise<void> {
  await apiPost<{ loggedOut: boolean }>('/api/logout');
}

export interface SignInOptions {
  onSuccess?: (session: SessionInfo) => void;
  initialError?: string;
}

/** Passphrase gate from design-kit/snippets/sign-in.html + sign-in.css */
export function renderSignIn(container: HTMLElement, options?: SignInOptions): void {
  container.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.className = 'sign-in';

  const form = document.createElement('form');
  form.className = 'sign-in__card';
  form.noValidate = true;

  const mark = document.createElement('img');
  mark.className = 'sign-in__mark';
  mark.src = '/icons/tasks.svg';
  mark.alt = '';
  mark.width = 56;
  mark.height = 56;

  const brand = document.createElement('p');
  brand.className = 'sign-in__brand';
  brand.textContent = 'Tasks Hub';

  const title = document.createElement('h1');
  title.className = 'sign-in__title';
  title.textContent = 'Sign in';

  const field = document.createElement('div');
  field.className = 'sign-in__field';

  const inputId = 'sign-in-passphrase';

  const label = document.createElement('label');
  label.className = 'sign-in__label';
  label.htmlFor = inputId;
  label.textContent = 'Passphrase';

  const input = document.createElement('input');
  input.className = 'sign-in__input';
  input.id = inputId;
  input.name = 'passphrase';
  input.type = 'password';
  input.required = true;
  input.autocomplete = 'current-password';
  input.enterKeyHint = 'go';

  const error = document.createElement('p');
  error.className = 'sign-in__error';
  error.hidden = true;
  error.setAttribute('role', 'alert');

  const submit = document.createElement('button');
  submit.className = 'btn btn--primary sign-in__submit';
  submit.type = 'submit';
  submit.textContent = 'Sign in';

  field.append(label, input);
  form.append(mark, brand, title, field, error, submit);
  wrapper.append(form);
  container.append(wrapper);

  const readPassphrase = attachPassphraseCapture(input, form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;

    if (!normalizePassphrase(input.value)) {
      showError('Enter your passphrase.');
      input.focus();
      return;
    }

    submit.disabled = true;

    try {
      const passphrase = readPassphrase();
      if (!passphrase) {
        showError('The field was empty when Sign in was pressed. Click it, type again, then Sign in.');
        return;
      }
      const session = await authenticate(passphrase);
      if (!session.authenticated) {
        showError('Invalid passphrase');
        return;
      }
      const confirmed = await fetchSession();
      if (!confirmed.authenticated) {
        showError(`Safari blocked the session cookie. Open ${API_SIGN_IN_URL}`);
        return;
      }
      options?.onSuccess?.(session);
    } catch (err) {
      showError(messageForSignInFailure(err));
    } finally {
      submit.disabled = false;
    }
  });

  input.focus();

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = false;
  }

  if (options?.initialError) showError(options.initialError);
}
