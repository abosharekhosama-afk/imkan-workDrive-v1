import { getApiBaseUrl } from './client';

export type AuthUser = { id: string; name: string | null; email: string; org_id: string; role: string };
export type AuthResult = { access_token: string; user: AuthUser };

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    const raw = await response.text();
    let message = "";
    try {
      const parsed = JSON.parse(raw) as { message?: string | string[]; error?: string };
      message = Array.isArray(parsed.message) ? parsed.message.join(", ") : parsed.message || parsed.error || "";
    } catch {
      message = raw;
    }
    throw new Error(message || "Request failed");
  }
  return response.json() as Promise<T>;
}

export function login(email: string, password: string) { return request<AuthResult>('/auth/login', { email, password }); }
export function signup(name: string, email: string, password: string) { return request<AuthResult>('/auth/signup', { name, email, password }); }
export async function googleUrl() { return request<{ url: string }>('/auth/google'); }
export async function me(token: string) {
  const response = await fetch(`${getApiBaseUrl()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Session expired');
  return response.json() as Promise<AuthUser>;
}
export function saveSession(result: AuthResult) { localStorage.setItem('workdrive_access_token', result.access_token); localStorage.setItem('workdrive_user', JSON.stringify(result.user)); }
export function clearSession() { localStorage.removeItem('workdrive_access_token'); localStorage.removeItem('workdrive_user'); }

export function forgotPassword(email: string) { return request<{ok:boolean;reset_token?:string}>('/auth/forgot-password',{email}); }
export function resetPassword(token:string,password:string) { return request<{ok:boolean}>('/auth/reset-password',{token,password}); }
export function logout(token:string) { return fetch(`${getApiBaseUrl()}/auth/logout`,{method:'POST',headers:{Authorization:`Bearer ${token}`}}); }
export function logoutAll(token:string) { return fetch(`${getApiBaseUrl()}/auth/logout-all`,{method:'POST',headers:{Authorization:`Bearer ${token}`}}); }
