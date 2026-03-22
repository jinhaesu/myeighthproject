import type { ApiResponse } from '@/types';

// In production, API calls go directly to Railway (Vercel can't run Python/ffmpeg/SQLite)
// In development, API calls go to local server
const RAILWAY_URL = 'https://myeighthproject-production.up.railway.app';

function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    // Server-side
    return process.env.NODE_ENV === 'production' ? RAILWAY_URL : 'http://localhost:3000';
  }
  // Client-side
  if (process.env.NODE_ENV === 'production') {
    return RAILWAY_URL;
  }
  return '';
}

const BASE_URL = getBaseUrl();

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

/**
 * Convert a server-side file path to a URL that can be used in the browser.
 * e.g. /tmp/output/videos/1.mp4 → /api/files/videos/1.mp4
 * e.g. C:\...\output\videos\1.mp4 → /api/files/videos/1.mp4
 */
export function getFileUrl(filePath: string): string {
  const match = filePath.match(/output[/\\](.+)$/);
  if (match) {
    const relativePath = match[1].replace(/\\/g, '/');
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      return `${RAILWAY_URL}/api/files/${relativePath}`;
    }
    return `/api/files/${relativePath}`;
  }
  return filePath;
}
