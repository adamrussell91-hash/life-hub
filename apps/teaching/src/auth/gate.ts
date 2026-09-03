import { apiGet, apiPost, ApiClientError } from '@/api/client';

export interface SessionInfo {
  authenticated: boolean;
  expiresAt?: number;
}

export async function fetchSession(): Promise<SessionInfo> {
  return apiGet<SessionInfo>('/api/session');
}

export async function authenticate(passphrase: string): Promise<SessionInfo> {
  return apiPost<SessionInfo>('/api/auth', { passphrase });
}

export async function logout(): Promise<void> {
  await apiPost<{ loggedOut: boolean }>('/api/logout');
}

export interface SignInOptions {
  onSuccess?: (session: SessionInfo) => void;
}

const SIGN_IN_HAZE_HTML = `
  <span class="sign-in__haze-mist"></span>
  <span class="sign-in__bubble"></span>
  <span class="sign-in__bubble"></span>
  <span class="sign-in__bubble"></span>
  <span class="sign-in__bubble"></span>
  <span class="sign-in__bubble"></span>
  <span class="sign-in__sparkle"></span>
  <span class="sign-in__sparkle"></span>
  <span class="sign-in__sparkle"></span>
  <span class="sign-in__sparkle"></span>
  <span class="sign-in__sparkle"></span>
  <span class="sign-in__sparkle"></span>
`;

function createSignInHaze(): HTMLElement {
  const haze = document.createElement('div');
  haze.className = 'sign-in__haze';
  haze.setAttribute('aria-hidden', 'true');
  haze.innerHTML = SIGN_IN_HAZE_HTML;
  return haze;
}

/** Passphrase gate from design-kit/snippets/sign-in.html + sign-in.css */
export function renderSignIn(container: HTMLElement, options?: SignInOptions): void {
  container.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.className = 'sign-in';

  const form = document.createElement('form');
  form.className = 'sign-in__card';
  form.noValidate = true;

  const brand = document.createElement('p');
  brand.className = 'sign-in__brand';
  brand.textContent = 'Teaching Hub';

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
  form.append(createSignInHaze(), brand, title, field, error, submit);
  wrapper.append(form);
  container.append(wrapper);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    submit.disabled = true;

    try {
      const session = await authenticate(input.value);
      if (session.authenticated) {
        options?.onSuccess?.(session);
        return;
      }
      showError('Invalid passphrase');
    } catch (err) {
      const message =
        err instanceof ApiClientError && err.code === 'invalid_credentials'
          ? 'Invalid passphrase'
          : 'Unable to sign in. Please try again.';
      showError(message);
    } finally {
      submit.disabled = false;
    }
  });

  input.focus();

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = false;
  }
}
