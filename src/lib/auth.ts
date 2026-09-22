/**
 * Client-side auth helpers wrapping the serverless auth endpoints.
 */

export interface AuthUser {
  email: string;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(data.error || 'Invalid email or password');
  }

  const data = await res.json();
  return { email: data.email };
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', {
    method: 'POST',
    credentials: 'include',
  });
}

export async function checkSession(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/me', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { email: data.email };
  } catch {
    return null;
  }
}
