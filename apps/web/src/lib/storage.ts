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

const dbPromise = openDB<TotpDb>("totp-webapp", 1, {
  upgrade(db) {
    db.createObjectStore("vaults");
    db.createObjectStore("settings");
  }
});

export async function getEncryptedVault(): Promise<EncryptedVaultRecord | undefined> {
  return (await dbPromise).get("vaults", "primary");
}

export async function saveEncryptedVault(record: EncryptedVaultRecord): Promise<void> {
  await (await dbPromise).put("vaults", record, "primary");
}

export async function getSettings(): Promise<Settings> {
  return (await dbPromise).get("settings", "app").then((settings) => settings ?? {
    theme: "dark",
    autoLockMinutes: 10,
    clipboardClearSeconds: 30
  });
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await dbPromise).put("settings", settings, "app");
}
