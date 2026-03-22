import type { ApiResponse } from '@/types';

const BASE_URL = typeof window !== 'undefined' ? '' : 'http://localhost:3000';

async function request<T>(
  url: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const json: ApiResponse<T> = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.error || `Request failed with status ${res.status}`);
  }

  return json;
}

export async function apiGet<T>(url: string): Promise<ApiResponse<T>> {
  return request<T>(url, { method: 'GET' });
}

export async function apiPost<T>(
  url: string,
  body: unknown
): Promise<ApiResponse<T>> {
  return request<T>(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function apiPatch<T>(
  url: string,
  body: unknown
): Promise<ApiResponse<T>> {
  return request<T>(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T>(url: string): Promise<ApiResponse<T>> {
  return request<T>(url, { method: 'DELETE' });
}
