type LocalUser = { id: string; email: string };
type LocalSession = { user: LocalUser };
type Listener = (event: 'SIGNED_IN' | 'SIGNED_OUT', session: LocalSession | null) => void;
const listeners = new Set<Listener>();

async function request<T>(path: string, payload?: Record<string, unknown> | FormData): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: payload === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    ...(payload instanceof FormData ? { body: payload } : payload !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
  });
  const content = response.headers.get('content-type') ?? '';
  if (!content.includes('application/json')) throw new Error('Local backend is unavailable. Start the app with npm run dev.');
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Local request failed.');
  return result as T;
}

function failure(error: unknown): Error { return error instanceof Error ? error : new Error('Local backend request failed.'); }

export const localClient = {
  auth: {
    async getSession() {
      try { return { data: await request<{ session: LocalSession | null }>('session'), error: null }; }
      catch (error) { return { data: { session: null }, error: failure(error) }; }
    },
    onAuthStateChange(listener: Listener) {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => { listeners.delete(listener); } } } };
    },
    async signInWithOtp(input: { email: string; options?: { captchaToken?: string } }) {
      try { return { data: await request<{ localCode: string }>('auth/code', { email: input.email }), error: null }; }
      catch (error) { return { data: { localCode: '' }, error: failure(error) }; }
    },
    async verifyOtp(input: { email: string; token: string; type: string }) {
      try {
        const data = await request<{ session: LocalSession }>('auth/verify', { email: input.email, token: input.token });
        for (const listener of listeners) listener('SIGNED_IN', data.session);
        return { data, error: null };
      } catch (error) { return { data: { session: null }, error: failure(error) }; }
    },
    async signOut() {
      try {
        await request('auth/signout', {});
        for (const listener of listeners) listener('SIGNED_OUT', null);
        return { error: null };
      } catch (error) { return { error: failure(error) }; }
    },
    mfa: {
      async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }; },
      async listFactors() { return { data: { totp: [] as { id: string; status: string }[] }, error: null }; },
      async enroll(_input: { factorType: string; friendlyName: string }): Promise<never> { throw new Error('Use hosted authentication for TOTP enrollment. Local development uses a local inbox.'); },
      async challengeAndVerify(_input: { factorId: string; code: string }): Promise<never> { throw new Error('Hosted MFA is not available in local development.'); },
    },
  },
  async rpc(name: string, args: Record<string, unknown> = {}) {
    try { return { data: await request<unknown>('rpc', { name, args }), error: null }; }
    catch (error) { return { data: null, error: failure(error) }; }
  },
  functions: {
    async invoke(name: string, options: { body: Record<string, unknown> | FormData }) {
      try {
        if (!['upload', 'invite'].includes(name)) throw new Error('Unsupported local function.');
        return { data: await request<{ message?: string }>(name, options.body), error: null };
      } catch (error) { return { data: null, error: failure(error) }; }
    },
  },
  storage: {
    from(bucket: string) {
      return {
        async createSignedUrl(path: string, _expiresIn: number) {
          try {
            if (bucket !== 'evidence') throw new Error('Unknown file bucket.');
            return { data: await request<{ signedUrl: string }>('file-link', { path }), error: null };
          } catch (error) { return { data: null, error: failure(error) }; }
        },
      };
    },
  },
};
