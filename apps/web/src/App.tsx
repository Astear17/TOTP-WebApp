import { createEmptyVaultPayload, decryptVaultPayload, decryptVaultPayloadWithKey, deriveVaultKey, encryptVaultPayload, encryptVaultPayloadWithKey, exportVaultKey, importVaultKey } from "@totp-webapp/crypto";
import { encryptedVaultRecordSchema, type EncryptedVaultRecord, type VaultEntry, type VaultPayload } from "@totp-webapp/shared";
import { generateTotpCode, getRemainingSeconds, isValidBase32Secret, normalizeBase32Secret, parseProtonAuthenticatorExport, parseTotpImportText, type ParsedOtpAuthUri } from "@totp-webapp/shared";
import { AlertTriangle, ArrowDownUp, Camera, Clipboard, Cloud, CloudOff, Download, Edit3, FileUp, KeyRound, Lock, Moon, Plus, QrCode, Save, Search, Settings, Shield, Sun, Trash2, Upload, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRemoteVault, loginSync, registerSync, uploadRemoteVault } from "./lib/sync";
import { clearRememberedVaultKey, getEncryptedVault, getRememberedVaultKey, getSettings, isExtensionRuntime, saveEncryptedVault, saveRememberedVaultKey, saveSettings } from "./lib/storage";

type Screen = "unlock" | "create" | "login" | "dashboard" | "add" | "qr" | "manual" | "import" | "export" | "settings" | "security" | "about";
type Notice = { type: "error" | "success" | "info"; message: string } | null;

const nowIso = () => new Date().toISOString();
const cloudSyncEnabled = Boolean(import.meta.env.VITE_API_BASE_URL?.trim());

function newEntry(input: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">): VaultEntry {
  const now = nowIso();
  return { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "T";
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("unlock");
  const [encryptedVault, setEncryptedVault] = useState<EncryptedVaultRecord | null>(null);
  const [vault, setVault] = useState<VaultPayload | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [masterPassword, setMasterPassword] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [autoLockMinutes, setAutoLockMinutes] = useState(10);
  const [clipboardClearSeconds, setClipboardClearSeconds] = useState(30);
  const [syncToken, setSyncToken] = useState<string | undefined>();
  const [syncEmail, setSyncEmail] = useState<string | undefined>();
  const [remoteRevision, setRemoteRevision] = useState<number | undefined>();
  const [conflict, setConflict] = useState<EncryptedVaultRecord | null>(null);
  const inactivityRef = useRef<number>();
  const showCloudSync = cloudSyncEnabled && !isExtensionRuntime();

  useEffect(() => {
    getEncryptedVault().then(async (record) => {
      setEncryptedVault(record ?? null);
      if (!record) {
        setScreen("create");
        return;
      }
      if (isExtensionRuntime()) {
        const rememberedKey = await getRememberedVaultKey().then((key) => key ? importVaultKey(key) : undefined).catch(() => undefined);
        if (rememberedKey) {
          try {
            const decrypted = await decryptVaultPayloadWithKey(record, rememberedKey);
            setVault(decrypted);
            setVaultKey(rememberedKey);
            setScreen("dashboard");
            return;
          } catch {
            await clearRememberedVaultKey().catch(() => undefined);
          }
        }
      }
      setScreen("unlock");
    });
    getSettings().then((settings) => {
      setTheme(settings.theme);
      setAutoLockMinutes(settings.autoLockMinutes);
      setClipboardClearSeconds(settings.clipboardClearSeconds);
      setSyncToken(settings.syncToken);
      setSyncEmail(settings.syncEmail);
      setRemoteRevision(settings.remoteRevision);
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    saveSettings({ theme, autoLockMinutes, clipboardClearSeconds, syncToken, syncEmail, remoteRevision }).catch(() => undefined);
  }, [theme, autoLockMinutes, clipboardClearSeconds, syncToken, syncEmail, remoteRevision]);

  useEffect(() => {
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    const onOnline = () => setOnline(navigator.onLine);
    const resetIdle = () => {
      window.clearTimeout(inactivityRef.current);
      if (vault && autoLockMinutes > 0) {
        inactivityRef.current = window.setTimeout(lockVault, autoLockMinutes * 60 * 1000);
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    window.addEventListener("pointerdown", resetIdle);
    window.addEventListener("keydown", resetIdle);
    resetIdle();
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(inactivityRef.current);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
      window.removeEventListener("pointerdown", resetIdle);
      window.removeEventListener("keydown", resetIdle);
    };
  }, [vault, autoLockMinutes]);

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (vault?.entries ?? []).filter((entry) => {
      const haystack = `${entry.issuer} ${entry.accountName} ${entry.tags.join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [vault, query]);

  async function persistVault(nextVault: VaultPayload) {
    if (!vaultKey || !encryptedVault) throw new Error("Vault is locked.");
    const encrypted = await encryptVaultPayloadWithKey({ ...nextVault, updatedAt: nowIso() }, vaultKey, {
      id: encryptedVault.id,
      salt: encryptedVault.kdf.salt,
      createdAt: encryptedVault.createdAt,
      revision: encryptedVault.revision
    });
    await saveEncryptedVault(encrypted);
    setEncryptedVault(encrypted);
    setVault(nextVault);
    return encrypted;
  }

  function lockVault() {
    setVault(null);
    setVaultKey(null);
    setMasterPassword("");
    setScreen("unlock");
    setNotice({ type: "info", message: "Vault locked and decrypted state cleared from memory." });
  }

  async function createVault(password: string) {
    try {
      const payload = createEmptyVaultPayload();
      const encrypted = await encryptVaultPayload(payload, password);
      await saveEncryptedVault(encrypted);
      const decrypted = await decryptVaultPayload(encrypted, password);
      const realKey = await deriveVaultKey(password, encrypted.kdf.salt, isExtensionRuntime());
      if (isExtensionRuntime()) await saveRememberedVaultKey(await exportVaultKey(realKey));
      setEncryptedVault(encrypted);
      setVault(decrypted);
      setVaultKey(realKey);
      setMasterPassword("");
      setScreen("dashboard");
      setNotice({ type: "success", message: "Encrypted vault created locally." });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to create vault." });
    }
  }

  async function unlockVault(password: string, record = encryptedVault) {
    if (!record) return;
    try {
      const decrypted = await decryptVaultPayload(record, password);
      const realKey = await deriveVaultKey(password, record.kdf.salt, isExtensionRuntime());
      if (isExtensionRuntime()) await saveRememberedVaultKey(await exportVaultKey(realKey));
      setVault(decrypted);
      setVaultKey(realKey);
      setEncryptedVault(record);
      setMasterPassword("");
      setScreen("dashboard");
      setNotice(null);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to unlock vault." });
    }
  }

  async function addEntry(input: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">) {
    if (!vault) return;
    await persistVault({ ...vault, entries: [newEntry(input), ...vault.entries], updatedAt: nowIso() });
    setScreen("dashboard");
    setNotice({ type: "success", message: "Account added to encrypted vault." });
  }

  async function addParsedEntries(entries: ParsedOtpAuthUri[]) {
    if (!vault || entries.length === 0) return;
    await persistVault({
      ...vault,
      entries: [...entries.map((entry) => newEntry({ ...entry, tags: [] })), ...vault.entries],
      updatedAt: nowIso()
    });
    setScreen("dashboard");
    setNotice({ type: "success", message: `Imported ${entries.length} account${entries.length === 1 ? "" : "s"} into the encrypted vault.` });
  }

  async function updateEntry(id: string, patch: Partial<VaultEntry>) {
    if (!vault) return;
    await persistVault({
      ...vault,
      entries: vault.entries.map((entry) => entry.id === id ? { ...entry, ...patch, updatedAt: nowIso() } : entry),
      updatedAt: nowIso()
    });
  }

  async function deleteEntry(id: string) {
    if (!vault || !confirm("Delete this TOTP entry?")) return;
    await persistVault({ ...vault, entries: vault.entries.filter((entry) => entry.id !== id), updatedAt: nowIso() });
  }

  async function reorder(id: string, direction: -1 | 1) {
    if (!vault) return;
    const index = vault.entries.findIndex((entry) => entry.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= vault.entries.length) return;
    const entries = [...vault.entries];
    [entries[index], entries[target]] = [entries[target], entries[index]];
    await persistVault({ ...vault, entries, updatedAt: nowIso() });
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setNotice({ type: "success", message: "Code copied." });
    if (clipboardClearSeconds > 0) {
      window.setTimeout(() => navigator.clipboard.writeText("").catch(() => undefined), clipboardClearSeconds * 1000);
    }
  }

  async function syncUpload() {
    if (!syncToken || !encryptedVault) return setScreen("login");
    try {
      const remote = await uploadRemoteVault(syncToken, encryptedVault, remoteRevision);
      setRemoteRevision(remote.encryptedVault?.revision);
      setNotice({ type: "success", message: "Encrypted vault uploaded." });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Sync upload failed." });
    }
  }

  async function syncDownload() {
    if (!syncToken) return setScreen("login");
    try {
      const remote = await fetchRemoteVault(syncToken);
      if (!remote.encryptedVault) return setNotice({ type: "info", message: "No remote vault exists yet." });
      if (encryptedVault && remote.encryptedVault.revision !== encryptedVault.revision && encryptedVault.updatedAt !== remote.encryptedVault.updatedAt) {
        setConflict(remote.encryptedVault);
        return;
      }
      await saveEncryptedVault(remote.encryptedVault);
      setRemoteRevision(remote.encryptedVault.revision);
      setNotice({ type: "success", message: "Encrypted remote vault downloaded. Unlock it with its master password." });
      lockVault();
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Sync download failed." });
    }
  }

  function downloadEncryptedBackup(record = encryptedVault) {
    if (!record) return;
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `totp-webapp-encrypted-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice({ type: "success", message: "Encrypted backup downloaded." });
  }

  async function restoreEncryptedBackup(record: EncryptedVaultRecord) {
    await saveEncryptedVault(record);
    await clearRememberedVaultKey().catch(() => undefined);
    setEncryptedVault(record);
    setVault(null);
    setVaultKey(null);
    setMasterPassword("");
    setScreen("unlock");
    setNotice({ type: "success", message: "Encrypted backup restored. Unlock it with its master password." });
  }

  return (
    <div className="min-h-screen text-slate-950 dark:text-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <Header screen={screen} setScreen={setScreen} vault={vault} lockVault={lockVault} online={online} syncEmail={syncEmail} theme={theme} setTheme={setTheme} />
        <main className="flex flex-1 items-stretch py-5">
          <div className="w-full">
            {notice && <NoticeBanner notice={notice} onClose={() => setNotice(null)} />}
            {conflict && <ConflictPanel local={encryptedVault} remote={conflict} onKeepLocal={() => { setConflict(null); syncUpload(); }} onUseRemote={async () => { await saveEncryptedVault(conflict); setEncryptedVault(conflict); setRemoteRevision(conflict.revision); setConflict(null); lockVault(); }} onExportBoth={() => exportBoth(encryptedVault, conflict)} />}
            {screen === "create" && <CreateVaultScreen onCreate={createVault} />}
            {screen === "unlock" && <UnlockScreen encryptedVault={encryptedVault} masterPassword={masterPassword} setMasterPassword={setMasterPassword} onUnlock={() => unlockVault(masterPassword)} onCreate={() => setScreen("create")} />}
            {screen === "login" && <SyncLoginScreen setNotice={setNotice} onAuthed={(token, email) => { setSyncToken(token); setSyncEmail(email); setScreen("dashboard"); }} />}
            {screen === "dashboard" && vault && <Dashboard entries={filteredEntries} query={query} setQuery={setQuery} tick={tick} onCopy={copyCode} onDelete={deleteEntry} onReorder={reorder} onEdit={updateEntry} setScreen={setScreen} onBackup={() => downloadEncryptedBackup()} online={online} syncToken={syncToken} cloudSyncEnabled={showCloudSync} syncUpload={syncUpload} syncDownload={syncDownload} />}
            {screen === "add" && <AddAccountScreen setScreen={setScreen} />}
            {screen === "manual" && <ManualEntryScreen onAdd={addEntry} />}
            {screen === "qr" && <QrScannerScreen onAddMany={addParsedEntries} setNotice={setNotice} />}
            {screen === "import" && <ImportScreen onImportEncrypted={restoreEncryptedBackup} onImportPlain={async (text) => { const parsed = parseTotpImportText(text); await addParsedEntries(parsed.entries); }} onImportProton={async (text) => addParsedEntries(parseProtonAuthenticatorExport(text))} onImportGoogle={async (texts) => {
              const batches = texts.map(parseTotpImportText).sort((left, right) => (left.batchIndex ?? 0) - (right.batchIndex ?? 0));
              const expectedBatchSize = batches.find((batch) => typeof batch.batchSize === "number")?.batchSize;
              if (expectedBatchSize && batches.length < expectedBatchSize) {
                setNotice({ type: "error", message: `Select all ${expectedBatchSize} Google Authenticator QR images before importing.` });
                return;
              }
              const entries = batches.flatMap((batch) => batch.entries);
              await addParsedEntries(entries);
              const batchCount = batches.filter((batch) => typeof batch.batchIndex === "number").length;
              if (batchCount) setNotice({ type: "success", message: `Imported ${entries.length} account${entries.length === 1 ? "" : "s"} from ${batchCount} Google QR image${batchCount === 1 ? "" : "s"}.` });
            }} />}
            {screen === "export" && encryptedVault && <ExportScreen encryptedVault={encryptedVault} onBackup={downloadEncryptedBackup} />}
            {screen === "settings" && <SettingsScreen setScreen={setScreen} syncEmail={syncEmail} cloudSyncEnabled={showCloudSync} onLogoutSync={() => { setSyncToken(undefined); setSyncEmail(undefined); setRemoteRevision(undefined); }} />}
            {screen === "security" && <SecurityScreen autoLockMinutes={autoLockMinutes} setAutoLockMinutes={setAutoLockMinutes} clipboardClearSeconds={clipboardClearSeconds} setClipboardClearSeconds={setClipboardClearSeconds} onForgetDevice={async () => { await clearRememberedVaultKey(); setNotice({ type: "success", message: "Remembered extension unlock cleared." }); }} />}
            {screen === "about" && <AboutScreen />}
          </div>
        </main>
      </div>
    </div>
  );
}

function Header(props: { screen: Screen; setScreen: (screen: Screen) => void; vault: VaultPayload | null; lockVault: () => void; online: boolean; syncEmail?: string; theme: "light" | "dark"; setTheme: (theme: "light" | "dark") => void }) {
  return <header className="glass flex items-center justify-between rounded-3xl px-4 py-3">
    <button className="flex items-center gap-3 text-left" onClick={() => props.vault && props.setScreen("dashboard")}>
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-700 text-white"><Shield size={22} /></span>
      <span>
        <span className="block text-base font-bold">TOTP-WebApp</span>
        <span className="block text-xs text-slate-600 dark:text-slate-300">Encrypted local authenticator</span>
      </span>
    </button>
    <div className="flex items-center gap-2">
      <StatusPill icon={props.online ? Cloud : WifiOff} text={props.online ? props.syncEmail ?? "Local" : "Offline"} />
      <button className="btn-secondary !rounded-xl !p-3" aria-label="Toggle theme" onClick={() => props.setTheme(props.theme === "dark" ? "light" : "dark")}>{props.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
      {props.vault && <button className="btn-secondary !rounded-xl !p-3" aria-label="Settings" onClick={() => props.setScreen("settings")}><Settings size={18} /></button>}
      {props.vault && <button className="btn-secondary !rounded-xl !p-3" aria-label="Lock" onClick={props.lockVault}><Lock size={18} /></button>}
    </div>
  </header>;
}

function StatusPill({ icon: Icon, text }: { icon: typeof Cloud; text: string }) {
  return <span className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 sm:inline-flex"><Icon size={14} />{text}</span>;
}

function NoticeBanner({ notice, onClose }: { notice: NonNullable<Notice>; onClose: () => void }) {
  const tone = notice.type === "error" ? "border-red-300 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" : "border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-100";
  return <div className={`mb-4 flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${tone}`}><span>{notice.message}</span><button aria-label="Dismiss" onClick={onClose}><X size={16} /></button></div>;
}

function CreateVaultScreen({ onCreate }: { onCreate: (password: string) => void }) {
  const [password, setPassword] = useState("");
  return <CenteredPanel title="Create encrypted vault" subtitle="Your master password derives the browser-only encryption key. It is never sent to the backend.">
    <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Master password" />
    <button className="btn-primary w-full" onClick={() => onCreate(password)} disabled={password.length < 12}><KeyRound size={18} />Create vault</button>
  </CenteredPanel>;
}

function UnlockScreen({ encryptedVault, masterPassword, setMasterPassword, onUnlock, onCreate }: { encryptedVault: EncryptedVaultRecord | null; masterPassword: string; setMasterPassword: (value: string) => void; onUnlock: () => void; onCreate: () => void }) {
  return <CenteredPanel title={encryptedVault ? "Unlock vault" : "No vault found"} subtitle="Offline unlock works after first load because the encrypted vault lives in IndexedDB.">
    {encryptedVault ? <>
      <input className="input" type="password" value={masterPassword} onChange={(event) => setMasterPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onUnlock()} placeholder="Master password" autoFocus />
      <button className="btn-primary w-full" onClick={onUnlock}><Lock size={18} />Unlock</button>
    </> : <button className="btn-primary w-full" onClick={onCreate}>Create vault</button>}
  </CenteredPanel>;
}

function CenteredPanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="mx-auto grid min-h-[65vh] max-w-xl place-items-center">
    <div className="glass w-full rounded-3xl p-6 sm:p-8">
      <h1 className="text-3xl font-bold tracking-normal">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{subtitle}</p>
      <div className="mt-6 space-y-3">{children}</div>
    </div>
  </section>;
}

function SyncLoginScreen({ onAuthed, setNotice }: { onAuthed: (token: string, email: string) => void; setNotice: (notice: Notice) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  async function submit() {
    try {
      const response = mode === "login" ? await loginSync(email, password) : await registerSync(email, password);
      onAuthed(response.token, response.email);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Sync login failed." });
    }
  }
  return <CenteredPanel title="Cloud sync account" subtitle="Optional self-hosted cloud sync. Backup and Restore work without any account or backend.">
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-900/5 p-1 dark:bg-white/5">
      <button className={mode === "login" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("login")}>Login</button>
      <button className={mode === "register" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("register")}>Register</button>
    </div>
    <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
    <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sync account password" />
    <button className="btn-primary w-full" onClick={submit}><Cloud size={18} />Continue</button>
  </CenteredPanel>;
}

function Dashboard(props: { entries: VaultEntry[]; query: string; setQuery: (query: string) => void; tick: number; onCopy: (code: string) => void; onDelete: (id: string) => void; onReorder: (id: string, direction: -1 | 1) => void; onEdit: (id: string, patch: Partial<VaultEntry>) => void; setScreen: (screen: Screen) => void; onBackup: () => void; online: boolean; syncToken?: string; cloudSyncEnabled: boolean; syncUpload: () => void; syncDownload: () => void }) {
  return <section>
    <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto]">
      <label className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input className="input pl-11" value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Search issuer, account, or tag" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={props.onBackup}><Download size={18} />Backup</button>
        <button className="btn-secondary" onClick={() => props.setScreen("import")}><FileUp size={18} />Restore</button>
        {props.cloudSyncEnabled && <>
          <button className="btn-secondary" onClick={props.syncDownload} disabled={!props.online}>{props.syncToken ? <Cloud size={18} /> : <CloudOff size={18} />} Cloud restore</button>
          <button className="btn-secondary" onClick={props.syncUpload} disabled={!props.online}><Upload size={18} />Cloud backup</button>
        </>}
        <button className="btn-primary" onClick={() => props.setScreen("add")}><Plus size={18} />Add</button>
      </div>
    </div>
    {!props.online && <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">Offline mode. Local vault codes continue to work.</div>}
    {props.entries.length === 0 ? <EmptyState onAdd={() => props.setScreen("add")} /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{props.entries.map((entry, index) => <EntryCard key={entry.id} entry={entry} tick={props.tick} onCopy={props.onCopy} onDelete={props.onDelete} onReorder={props.onReorder} onEdit={props.onEdit} first={index === 0} last={index === props.entries.length - 1} />)}</div>}
  </section>;
}

function EntryCard({ entry, tick, onCopy, onDelete, onReorder, onEdit, first, last }: { entry: VaultEntry; tick: number; onCopy: (code: string) => void; onDelete: (id: string) => void; onReorder: (id: string, direction: -1 | 1) => void; onEdit: (id: string, patch: Partial<VaultEntry>) => void; first: boolean; last: boolean }) {
  let code = "------";
  let error = false;
  try { code = generateTotpCode({ secret: entry.secret, algorithm: entry.algorithm, digits: entry.digits, period: entry.period, epoch: tick }); } catch { error = true; }
  const remaining = getRemainingSeconds(entry.period, tick);
  const progress = ((entry.period - remaining) / entry.period) * 100;
  return <article className="glass rounded-3xl p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-600 to-amber-500 text-sm font-black text-white">{initials(entry.issuer)}</div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{entry.issuer}</h2>
          <p className="truncate text-sm text-slate-600 dark:text-slate-300">{entry.accountName}</p>
        </div>
      </div>
      <span className="rounded-full bg-slate-900/5 px-2.5 py-1 text-xs font-semibold dark:bg-white/10">{remaining}s</span>
    </div>
    {error ? <div className="mt-5 flex items-center gap-2 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"><AlertTriangle size={16} />Invalid secret</div> : <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="font-mono text-4xl font-black tracking-widest sm:text-5xl">{code.replace(/(\d{3,4})(\d+)/, "$1 $2")}</div>
        <button className="btn-primary !rounded-2xl !p-3" aria-label="Copy code" onClick={() => onCopy(code)}><Clipboard size={20} /></button>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-900/10 dark:bg-white/10"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} /></div>
    </>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button className="btn-secondary !px-3 !py-2" disabled={first} onClick={() => onReorder(entry.id, -1)}><ArrowDownUp size={15} />Up</button>
      <button className="btn-secondary !px-3 !py-2" disabled={last} onClick={() => onReorder(entry.id, 1)}><ArrowDownUp size={15} />Down</button>
      <button className="btn-secondary !px-3 !py-2" onClick={() => { const issuer = prompt("Issuer", entry.issuer); const accountName = prompt("Account name", entry.accountName); if (issuer && accountName) onEdit(entry.id, { issuer, accountName }); }}><Edit3 size={15} />Edit</button>
      <button className="btn-secondary !px-3 !py-2" onClick={() => onDelete(entry.id)}><Trash2 size={15} />Delete</button>
    </div>
  </article>;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return <div className="glass grid min-h-[45vh] place-items-center rounded-3xl p-8 text-center">
    <div><QrCode className="mx-auto text-teal-600" size={44} /><h2 className="mt-4 text-2xl font-bold">No accounts yet</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Add a QR code or manual secret to start generating offline codes.</p><button className="btn-primary mt-5" onClick={onAdd}><Plus size={18} />Add account</button></div>
  </div>;
}

function AddAccountScreen({ setScreen }: { setScreen: (screen: Screen) => void }) {
  return <section className="grid gap-4 md:grid-cols-2">
    <ActionCard icon={QrCode} title="Scan QR code" text="Use camera or upload an image containing a standard otpauth URI." onClick={() => setScreen("qr")} />
    <ActionCard icon={KeyRound} title="Manual entry" text="Enter issuer, account name, Base32 secret, algorithm, digits, and period." onClick={() => setScreen("manual")} />
    <ActionCard icon={FileUp} title="Import backup" text="Import encrypted vault backup or plain otpauth text." onClick={() => setScreen("import")} />
  </section>;
}

function ActionCard({ icon: Icon, title, text, onClick }: { icon: typeof QrCode; title: string; text: string; onClick: () => void }) {
  return <button onClick={onClick} className="glass rounded-3xl p-6 text-left transition hover:-translate-y-0.5">
    <Icon className="text-teal-600" size={30} /><h2 className="mt-4 text-xl font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{text}</p>
  </button>;
}

function ManualEntryScreen({ onAdd }: { onAdd: (entry: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">) => void }) {
  const [form, setForm] = useState({ issuer: "", accountName: "", secret: "", algorithm: "SHA1" as const, digits: 6 as 6 | 8, period: 30, tags: "" });
  const validSecret = isValidBase32Secret(form.secret);
  return <FormPanel title="Manual entry">
    <input className="input" placeholder="Issuer" value={form.issuer} onChange={(event) => setForm({ ...form, issuer: event.target.value })} />
    <input className="input" placeholder="Account name" value={form.accountName} onChange={(event) => setForm({ ...form, accountName: event.target.value })} />
    <input className="input font-mono" placeholder="Base32 secret" value={form.secret} onChange={(event) => setForm({ ...form, secret: normalizeBase32Secret(event.target.value) })} />
    {!validSecret && form.secret && <p className="text-sm text-red-600 dark:text-red-300">Secret must be valid Base32.</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <select className="input" value={form.algorithm} onChange={(event) => setForm({ ...form, algorithm: event.target.value as "SHA1" })}><option>SHA1</option><option>SHA256</option><option>SHA512</option></select>
      <select className="input" value={form.digits} onChange={(event) => setForm({ ...form, digits: Number(event.target.value) as 6 | 8 })}><option value={6}>6 digits</option><option value={8}>8 digits</option></select>
      <input className="input" type="number" min={10} max={120} value={form.period} onChange={(event) => setForm({ ...form, period: Number(event.target.value) })} />
    </div>
    <input className="input" placeholder="Tags, comma separated" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
    <button className="btn-primary w-full" disabled={!form.issuer || !form.accountName || !validSecret} onClick={() => onAdd({ ...form, secret: normalizeBase32Secret(form.secret), tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) })}><Save size={18} />Save account</button>
  </FormPanel>;
}

function QrScannerScreen({ onAddMany, setNotice }: { onAddMany: (entries: ParsedOtpAuthUri[]) => Promise<void>; setNotice: (notice: Notice) => void }) {
  const readerId = "qr-reader";
  async function parseText(text: string) {
    try {
      const parsed = parseTotpImportText(text);
      await onAddMany(parsed.entries);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Invalid QR code." });
    }
  }
  async function startCamera() {
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(readerId, false);
    await scanner.start({ facingMode: "environment" }, { fps: 8, qrbox: 240 }, async (decoded) => {
      await scanner.stop();
      parseText(decoded);
    }, () => undefined);
  }
  async function scanFiles(files: FileList) {
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(readerId, false);
    const decodedTexts: string[] = [];
    for (const file of Array.from(files)) {
      decodedTexts.push(await scanner.scanFile(file, true));
    }
    const entries = decodedTexts.flatMap((text) => parseTotpImportText(text).entries);
    await onAddMany(entries);
  }
  return <FormPanel title="QR scanner">
    <div id={readerId} className="min-h-64 overflow-hidden rounded-3xl border border-slate-200 bg-black/5 dark:border-white/10 dark:bg-black/30" />
    <button className="btn-primary w-full" onClick={startCamera}><Camera size={18} />Start camera</button>
    <label className="btn-secondary w-full cursor-pointer"><FileUp size={18} />Upload QR image<input className="hidden" type="file" accept="image/*" multiple onChange={(event) => event.target.files?.length && scanFiles(event.target.files).catch((error: unknown) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Invalid QR image." }))} /></label>
  </FormPanel>;
}

function ImportScreen({ onImportEncrypted, onImportPlain, onImportProton, onImportGoogle }: { onImportEncrypted: (record: EncryptedVaultRecord) => void; onImportPlain: (text: string) => void; onImportProton: (text: string) => void; onImportGoogle: (texts: string[]) => void }) {
  async function importFile(file: File) {
    const text = await file.text();
    const json = JSON.parse(text);
    await onImportEncrypted(encryptedVaultRecordSchema.parse(json));
  }
  async function importProtonFile(file: File) {
    await onImportProton(await file.text());
  }
  async function importGoogleImages(files: FileList) {
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode("import-qr-reader", false);
    const decodedTexts: string[] = [];
    for (const file of Array.from(files)) {
      decodedTexts.push(await scanner.scanFile(file, false));
    }
    await onImportGoogle(decodedTexts);
  }
  return <FormPanel title="Import backup">
    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Encrypted backups still require the original master password. Plain otpauth, Google Authenticator migration QR images, and Proton Authenticator JSON exports are immediately encrypted into the open vault.</p>
    <label className="btn-primary w-full cursor-pointer"><FileUp size={18} />Import encrypted backup<input className="hidden" type="file" accept="application/json" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} /></label>
    <label className="btn-secondary w-full cursor-pointer"><FileUp size={18} />Import Proton JSON<input className="hidden" type="file" accept="application/json" onChange={(event) => event.target.files?.[0] && importProtonFile(event.target.files[0])} /></label>
    <label className="btn-secondary w-full cursor-pointer"><QrCode size={18} />Import Google QR images<input className="hidden" type="file" accept="image/*" multiple onChange={(event) => event.target.files?.length && importGoogleImages(event.target.files)} /></label>
    <div id="import-qr-reader" className="h-0 overflow-hidden" />
    <textarea className="input min-h-36 font-mono" placeholder="Optional otpauth:// or otpauth-migration:// text" onBlur={(event) => event.target.value.trim() && onImportPlain(event.target.value.trim())} />
  </FormPanel>;
}

function ExportScreen({ encryptedVault, onBackup }: { encryptedVault: EncryptedVaultRecord; onBackup: (record: EncryptedVaultRecord) => void }) {
  return <FormPanel title="Export encrypted backup">
    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">This file contains only encrypted vault data. Keep the master password separately; it cannot be recovered.</p>
    <button className="btn-primary w-full" onClick={() => onBackup(encryptedVault)}><Download size={18} />Download encrypted backup</button>
  </FormPanel>;
}

function SettingsScreen({ setScreen, syncEmail, cloudSyncEnabled, onLogoutSync }: { setScreen: (screen: Screen) => void; syncEmail?: string; cloudSyncEnabled: boolean; onLogoutSync: () => void }) {
  return <section className="grid gap-4 md:grid-cols-2">
    <ActionCard icon={Shield} title="Security settings" text="Configure auto-lock and clipboard clearing." onClick={() => setScreen("security")} />
    <ActionCard icon={Download} title="Export backup" text="Download the encrypted vault blob." onClick={() => setScreen("export")} />
    <ActionCard icon={FileUp} title="Import backup" text="Restore encrypted backup or import otpauth text." onClick={() => setScreen("import")} />
    {cloudSyncEnabled && <ActionCard icon={Cloud} title={syncEmail ? `Cloud sync: ${syncEmail}` : "Login to cloud sync"} text="Optional self-hosted encrypted vault backup and restore." onClick={() => setScreen("login")} />}
    <ActionCard icon={AlertTriangle} title="About" text="Security model, limitations, and attribution." onClick={() => setScreen("about")} />
    {syncEmail && <button className="btn-secondary rounded-3xl p-6 text-left" onClick={onLogoutSync}>Logout sync account</button>}
  </section>;
}

function SecurityScreen({ autoLockMinutes, setAutoLockMinutes, clipboardClearSeconds, setClipboardClearSeconds, onForgetDevice }: { autoLockMinutes: number; setAutoLockMinutes: (value: number) => void; clipboardClearSeconds: number; setClipboardClearSeconds: (value: number) => void; onForgetDevice: () => void }) {
  return <FormPanel title="Security settings">
    <label className="text-sm font-semibold">Auto-lock minutes<input className="input mt-2" type="number" min={0} max={120} value={autoLockMinutes} onChange={(event) => setAutoLockMinutes(Number(event.target.value))} /></label>
    <label className="text-sm font-semibold">Clipboard auto-clear seconds<input className="input mt-2" type="number" min={0} max={180} value={clipboardClearSeconds} onChange={(event) => setClipboardClearSeconds(Number(event.target.value))} /></label>
    {isExtensionRuntime() && <button className="btn-secondary w-full" onClick={onForgetDevice}><Lock size={18} />Require master password next launch</button>}
  </FormPanel>;
}

function AboutScreen() {
  return <div className="glass rounded-3xl p-6 leading-7">
    <h1 className="text-2xl font-bold">About TOTP-WebApp</h1>
    <p className="mt-3 text-slate-600 dark:text-slate-300">TOTP-WebApp is a self-hosted, offline-first TOTP authenticator web app and Chrome extension with encrypted local vault storage, encrypted Backup/Restore, and optional encrypted cloud sync.</p>
    <p className="mt-3 text-slate-600 dark:text-slate-300">The backend stores sync account data and encrypted vault blobs only. It never receives the master password, decrypted vault content, TOTP secrets, or generated codes.</p>
    <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">Made by Astear17</p>
    <p className="mt-3 text-slate-600 dark:text-slate-300">Use HTTPS only and do not rely on this app for critical real accounts before independent security review.</p>
  </div>;
}

function FormPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mx-auto max-w-2xl"><div className="glass rounded-3xl p-6"><h1 className="mb-5 text-2xl font-bold">{title}</h1><div className="space-y-3">{children}</div></div></section>;
}

function ConflictPanel({ local, remote, onKeepLocal, onUseRemote, onExportBoth }: { local: EncryptedVaultRecord | null; remote: EncryptedVaultRecord; onKeepLocal: () => void; onUseRemote: () => void; onExportBoth: () => void }) {
  return <div className="mb-4 rounded-3xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
    <h2 className="font-bold">Sync conflict detected</h2>
    <p className="mt-1 text-sm">Local revision {local?.revision ?? 0} and remote revision {remote.revision} both changed. Choose how to proceed.</p>
    <div className="mt-3 flex flex-wrap gap-2"><button className="btn-secondary" onClick={onKeepLocal}>Keep local</button><button className="btn-secondary" onClick={onUseRemote}>Use remote</button><button className="btn-secondary" onClick={onExportBoth}>Export both</button></div>
  </div>;
}

function exportBoth(local: EncryptedVaultRecord | null, remote: EncryptedVaultRecord) {
  const blob = new Blob([JSON.stringify({ local, remote }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "totp-webapp-conflict-export.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
