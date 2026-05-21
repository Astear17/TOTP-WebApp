import type { VaultEntry } from "./schemas";

export function formatTotpCode(code: string): string {
  return code.replace(/\D/g, "").replace(/(.{3})(?=.)/g, "$1 ").trim();
}

export function filterVaultEntries(entries: VaultEntry[], query: string): VaultEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;

  return entries.filter((entry) => {
    const haystack = `${entry.issuer} ${entry.accountName} ${entry.tags.join(" ")}`.toLowerCase();
    return haystack.includes(needle);
  });
}

export function reorderVaultEntries(entries: VaultEntry[], id: string, direction: -1 | 1): VaultEntry[] {
  const index = entries.findIndex((entry) => entry.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= entries.length) return entries;

  const nextEntries = [...entries];
  [nextEntries[index], nextEntries[target]] = [nextEntries[target], nextEntries[index]];
  return nextEntries;
}
