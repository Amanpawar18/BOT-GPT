const KEY = 'botgpt_token';

export function saveToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
