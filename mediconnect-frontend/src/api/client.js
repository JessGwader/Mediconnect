const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

let accessToken = null;
export function setAccessToken(token) { accessToken = token; }
export function getAccessToken() { return accessToken; }

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function tryRefresh() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

/**
 * Real fetch wrapper used by every page — no mock data anywhere behind this.
 * Handles: Bearer auth, one silent refresh-and-retry on 401, JSON and
 * multipart bodies, and a consistent ApiError shape (status + payload) so
 * pages can branch on things like a 409 prescription-safety warning.
 */
export async function apiFetch(path, { method = "GET", body, isForm = false } = {}, _retried = false) {
  const headers = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch (networkErr) {
    throw new ApiError(`Can't reach the API at ${API_BASE}. Is the backend running?`, 0, null);
  }

  if (res.status === 401 && !_retried && path !== "/api/auth/refresh" && path !== "/api/auth/login") {
    const refreshed = await tryRefresh();
    if (refreshed) return apiFetch(path, { method, body, isForm }, true);
  }

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status, data);
  return data;
}

// Downloads need a Blob, not JSON — kept separate since auth headers still
// have to be attached manually (a plain <a href> can't send a Bearer token).
export async function apiDownload(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: "include",
  });
  if (!res.ok) throw new ApiError("Download failed.", res.status, null);
  return res.blob();
}

export { API_BASE, ApiError };
