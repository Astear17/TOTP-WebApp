import type { EncryptedVaultRecord } from "@totp-webapp/shared";

function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const publicHost = withoutProtocol.includes(".") ? withoutProtocol : `${withoutProtocol}.onrender.com`;
  return `https://${publicHost}`;
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

type AuthResponse = { token: string; email: string };
type RemoteVault = { encryptedVault: EncryptedVaultRecord | null };

async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  if (!API_BASE_URL || location.protocol === "chrome-extension:") {
    throw new Error("Cloud sync is not configured. Use encrypted Backup and Restore instead.");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    });
  } catch {
    throw new Error(`Unable to reach sync server at ${API_BASE_URL}. It may still be starting up; wait a moment and try again.`);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed." }));
    throw new Error(error.error ?? "Request failed.");
  }
  return response.json() as Promise<T>;
}

export function registerSync(email: string, password: string): Promise<AuthResponse> {
  return api<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function loginSync(email: string, password: string): Promise<AuthResponse> {
  return api<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function fetchRemoteVault(token: string): Promise<RemoteVault> {
  return api<RemoteVault>("/api/vault", {}, token);
}

export function uploadRemoteVault(token: string, encryptedVault: EncryptedVaultRecord, expectedRevision?: number): Promise<RemoteVault> {
  return api<RemoteVault>("/api/vault", {
    method: "PUT",
    body: JSON.stringify({ encryptedVault, expectedRevision })
  }, token);
}
