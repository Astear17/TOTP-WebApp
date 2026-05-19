import { openDB, type DBSchema } from "idb";
import type { EncryptedVaultRecord } from "@totp-webapp/shared";

type Settings = {
  theme: "light" | "dark";
  autoLockMinutes: number;
  clipboardClearSeconds: number;
  syncToken?: string;
  syncEmail?: string;
  remoteRevision?: number;
};

interface TotpDb extends DBSchema {
  vaults: {
    key: string;
    value: EncryptedVaultRecord;
  };
  settings: {
    key: string;
    value: Settings;
  };
}

type ChromeStorageApi = {
  storage?: {
    local?: {
      get(keys: string | string[] | Record<string, unknown> | null, callback: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
      remove(keys: string | string[], callback?: () => void): void;
    };
  };
  runtime?: { lastError?: { message?: string } };
};

declare const chrome: ChromeStorageApi | undefined;

const dbPromise = openDB<TotpDb>("totp-webapp", 1, {
  upgrade(db) {
    db.createObjectStore("vaults");
    db.createObjectStore("settings");
  }
});

export const isExtensionRuntime = (): boolean => location.protocol === "chrome-extension:";

function chromeStorage() {
  return typeof chrome !== "undefined" ? chrome.storage?.local : undefined;
}

function getChromeError(): Error | undefined {
  const message = typeof chrome !== "undefined" ? chrome.runtime?.lastError?.message : undefined;
  return message ? new Error(message) : undefined;
}

export async function getEncryptedVault(): Promise<EncryptedVaultRecord | undefined> {
  return (await dbPromise).get("vaults", "primary");
}

export async function saveEncryptedVault(record: EncryptedVaultRecord): Promise<void> {
  await (await dbPromise).put("vaults", record, "primary");
}

export async function getSettings(): Promise<Settings> {
  return (await dbPromise).get("settings", "app").then((settings) => settings ?? {
    theme: "dark",
    autoLockMinutes: isExtensionRuntime() ? 0 : 10,
    clipboardClearSeconds: 30
  });
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await dbPromise).put("settings", settings, "app");
}

export async function getRememberedVaultKey(): Promise<JsonWebKey | undefined> {
  const storage = chromeStorage();
  if (!isExtensionRuntime() || !storage) return undefined;
  return new Promise((resolve, reject) => {
    storage.get("rememberedVaultKey", (items) => {
      const error = getChromeError();
      if (error) reject(error);
      else resolve(items.rememberedVaultKey as JsonWebKey | undefined);
    });
  });
}

export async function saveRememberedVaultKey(key: JsonWebKey): Promise<void> {
  const storage = chromeStorage();
  if (!isExtensionRuntime() || !storage) return;
  await new Promise<void>((resolve, reject) => {
    storage.set({ rememberedVaultKey: key }, () => {
      const error = getChromeError();
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function clearRememberedVaultKey(): Promise<void> {
  const storage = chromeStorage();
  if (!isExtensionRuntime() || !storage) return;
  await new Promise<void>((resolve, reject) => {
    storage.remove("rememberedVaultKey", () => {
      const error = getChromeError();
      if (error) reject(error);
      else resolve();
    });
  });
}
