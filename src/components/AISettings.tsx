import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ipc } from "../lib/ipc";
import { cn } from "../lib/cn";
import type { AiProfile, ApiKey, ModelInfo } from "../lib/types";

const PROVIDERS = [
  { id: "anthropic", name: "Anthropic" },
  { id: "openai", name: "OpenAI" },
  { id: "gemini", name: "Gemini" },
];

function providerDisplayName(providerId: string): string {
  return PROVIDERS.find((p) => p.id === providerId)?.name || providerId;
}

// ── Section: API Keys ─────────────────────────────────────

export function ApiKeysSection({ onKeysChange }: { onKeysChange?: () => void }) {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const loadKeys = async () => {
    try {
      const list = await ipc.listApiKeys();
      setKeys(list);
    } catch (e) {
      console.error("[ai-settings] load api keys failed:", e);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleAdd = async () => {
    if (!name.trim() || !secret.trim()) return;
    setSaving(true);
    try {
      await ipc.createApiKey(name.trim(), provider, secret.trim());
      setName("");
      setSecret("");
      setShowForm(false);
      await loadKeys();
      onKeysChange?.();
    } catch (e) {
      console.error("[ai-settings] create api key failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await ipc.deleteApiKey(id);
      await loadKeys();
      onKeysChange?.();
    } catch (e) {
      console.error("[ai-settings] delete api key failed:", e);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Add form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-bg-card px-4 py-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-2.5 w-full rounded border border-border bg-bg-page px-2.5 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-secondary"
            placeholder={t("aiSettings.keys.placeholder.name")}
            autoFocus
          />

          {/* Provider pills */}
          <div className="mb-2.5 flex gap-1.5">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                className={cn(
                  "rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors",
                  provider === p.id
                    ? "bg-accent-primary text-white"
                    : "bg-bg-page text-text-secondary hover:text-text-primary"
                )}
                onClick={() => setProvider(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>

          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="mb-2.5 w-full rounded border border-border bg-bg-page px-2.5 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-secondary"
            placeholder={t("aiSettings.keys.placeholder.secret")}
          />

          <div className="flex justify-end gap-2">
            <button
              className="rounded px-2.5 py-1 font-mono text-[11px] text-text-secondary hover:text-text-primary"
              onClick={() => setShowForm(false)}
            >
              {t("common.button.cancel")}
            </button>
            <button
              className="rounded bg-accent-primary px-3 py-1 font-mono text-[11px] text-white hover:brightness-110 disabled:opacity-50"
              onClick={handleAdd}
              disabled={saving || !name.trim() || !secret.trim()}
            >
              {saving ? "..." : t("common.button.save")}
            </button>
          </div>
        </div>
      )}

      {/* Key list */}
      {keys.length === 0 && !showForm && (
        <p className="py-4 text-center font-mono text-[11px] text-text-secondary">
          {t("aiSettings.keys.empty")}
        </p>
      )}
      {keys.map((k) => (
        <div
          key={k.id}
          className="group flex items-center gap-3 rounded-lg bg-bg-card px-4 py-2.5"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-primary">
            {k.name}
          </span>
          <span className="shrink-0 rounded bg-bg-page px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
            {providerDisplayName(k.provider)}
          </span>
          <button
            className="shrink-0 rounded p-1 font-mono text-xs text-text-secondary opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
            onClick={() => handleDelete(k.id)}
            title={t("aiSettings.keys.tooltip.delete")}
          >
            ✕
          </button>
        </div>
      ))}

      {/* Add button */}
      {!showForm && (
        <button
          className="rounded-lg border border-dashed border-border px-4 py-2 font-mono text-[11px] text-text-secondary hover:border-accent-primary/40 hover:text-accent-primary"
          onClick={() => setShowForm(true)}
        >
          {t("aiSettings.keys.button.add")}
        </button>
      )}
    </div>
  );
}

// ── Section: Profiles ─────────────────────────────────────

export function ProfilesSection({ apiKeys }: { apiKeys: ApiKey[] }) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<AiProfile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [model, setModel] = useState("");
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeProfileId, setActiveProfileId] = useState(
    () => localStorage.getItem("vedrr-active-ai-profile"),
  );
  const fetchIdRef = useRef(0); // race condition guard

  const loadProfiles = async () => {
    try {
      const list = await ipc.listAiProfiles();
      setProfiles(list);
    } catch (e) {
      console.error("[ai-settings] load profiles failed:", e);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const handleKeyChange = async (keyId: string) => {
    setSelectedKeyId(keyId);
    setModel("");
    setAvailableModels([]);
    if (!keyId) return;
    const fetchId = ++fetchIdRef.current;
    setLoadingModels(true);
    setError("");
    try {
      const models = await ipc.listModels(keyId);
      if (fetchId !== fetchIdRef.current) return; // stale response
      setAvailableModels(models);
      setModel(models[0]?.id || "");
    } catch (e) {
      if (fetchId !== fetchIdRef.current) return;
      console.error("[ai-settings] list models failed:", e);
      setError(t("aiSettings.profiles.error.loadModels"));
    } finally {
      if (fetchId === fetchIdRef.current) setLoadingModels(false);
    }
  };

  const handleAdd = async () => {
    if (!name.trim() || !selectedKeyId || !model) return;
    setSaving(true);
    setError("");
    try {
      await ipc.createAiProfile(name.trim(), selectedKeyId, model);
      await loadProfiles();
      setName("");
      setSelectedKeyId("");
      setModel("");
      setShowForm(false);
    } catch (e) {
      console.error("[ai-settings] create profile failed:", e);
      setError(t("aiSettings.profiles.error.create"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await ipc.deleteAiProfile(id);
      await loadProfiles();
    } catch (e) {
      console.error("[ai-settings] delete failed:", e);
    }
  };

  const handleSelect = (profile: AiProfile) => {
    localStorage.setItem("vedrr-active-ai-profile", profile.id);
    setActiveProfileId(profile.id);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Add form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-bg-card px-4 py-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-2.5 w-full rounded border border-border bg-bg-page px-2.5 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-secondary"
            placeholder={t("aiSettings.profiles.placeholder.name")}
            autoFocus
          />

          {/* API Key dropdown */}
          <select
            value={selectedKeyId}
            onChange={(e) => handleKeyChange(e.target.value)}
            className="mb-2.5 w-full appearance-none rounded border border-border bg-bg-page px-2.5 py-1.5 font-mono text-xs text-text-primary"
          >
            <option value="" disabled>
              {t("aiSettings.profiles.select.key")}
            </option>
            {apiKeys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name} ({providerDisplayName(k.provider)})
              </option>
            ))}
          </select>

          {/* Model dropdown (fetched from provider API) */}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mb-2.5 w-full appearance-none rounded border border-border bg-bg-page px-2.5 py-1.5 font-mono text-xs text-text-primary disabled:opacity-40"
            disabled={!selectedKeyId || loadingModels}
          >
            {!selectedKeyId && (
              <option value="" disabled>
                {t("aiSettings.profiles.select.model.placeholder")}
              </option>
            )}
            {loadingModels && (
              <option value="" disabled>
                {t("aiSettings.profiles.select.model.loading")}
              </option>
            )}
            {!loadingModels && selectedKeyId && availableModels.length === 0 && (
              <option value="" disabled>
                {t("aiSettings.profiles.select.model.empty")}
              </option>
            )}
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {error && (
            <p className="mb-2 font-mono text-[11px] text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              className="rounded px-2.5 py-1 font-mono text-[11px] text-text-secondary hover:text-text-primary"
              onClick={() => setShowForm(false)}
            >
              {t("common.button.cancel")}
            </button>
            <button
              className="rounded bg-accent-primary px-3 py-1 font-mono text-[11px] text-white hover:brightness-110 disabled:opacity-50"
              onClick={handleAdd}
              disabled={saving || !name.trim() || !selectedKeyId || !model}
            >
              {saving ? "..." : t("common.button.create")}
            </button>
          </div>
        </div>
      )}

      {/* Profile list */}
      {profiles.length === 0 && !showForm && (
        <p className="py-4 text-center font-mono text-[11px] text-text-secondary">
          {t("aiSettings.profiles.empty")}
        </p>
      )}
      {profiles.map((p) => {
        const isActive = p.id === activeProfileId;
        const keyLabel = p.api_key_name || t("aiSettings.profiles.noKey");
        return (
          <div
            key={p.id}
            className={cn(
              "group flex cursor-pointer items-center gap-3 rounded-lg px-4 py-2.5 transition-colors",
              isActive
                ? "bg-accent-primary/15 ring-1 ring-accent-primary/40"
                : "bg-bg-card hover:bg-bg-card/80"
            )}
            onClick={() => handleSelect(p)}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-xs font-medium text-text-primary">
                  {p.name}
                </span>
                {isActive && (
                  <span className="shrink-0 rounded bg-accent-primary/20 px-1.5 py-0.5 font-mono text-[9px] text-accent-primary">
                    {t("aiSettings.profiles.active")}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-text-secondary">
                <span>{keyLabel}</span>
                <span>·</span>
                <span>{p.model}</span>
              </div>
            </div>
            <button
              className="shrink-0 rounded p-1 font-mono text-xs text-text-secondary opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(p.id);
              }}
              title={t("aiSettings.profiles.tooltip.delete")}
            >
              ✕
            </button>
          </div>
        );
      })}

      {/* Add button */}
      {!showForm && (
        <button
          className="rounded-lg border border-dashed border-border px-4 py-2 font-mono text-[11px] text-text-secondary hover:border-accent-primary/40 hover:text-accent-primary"
          onClick={() => setShowForm(true)}
        >
          {t("aiSettings.profiles.button.add")}
        </button>
      )}
    </div>
  );
}

// ── Section: System Prompt ────────────────────────────────

export function SystemPromptSection() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      const text = await ipc.getSystemPrompt();
      setPrompt(text);
      setOriginal(text);
      setLoaded(true);
    } catch (e) {
      console.error("[ai-settings] load system prompt failed:", e);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await ipc.setSystemPrompt(prompt);
      setOriginal(prompt);
    } catch (e) {
      console.error("[ai-settings] save system prompt failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      // Delete custom prompt → backend returns hardcoded default
      await ipc.setSystemPrompt("");
      await load();
    } catch (e) {
      console.error("[ai-settings] reset system prompt failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const isDirty = loaded && prompt !== original;

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="min-h-[120px] w-full resize-y rounded-lg border border-border bg-bg-card px-3 py-2 font-mono text-[11px] leading-relaxed text-text-primary placeholder:text-text-secondary"
        placeholder={t("aiSettings.systemPrompt.placeholder")}
      />
      <div className="flex justify-end gap-2">
        <button
          className="rounded px-2.5 py-1 font-mono text-[11px] text-text-secondary hover:text-text-primary"
          onClick={handleReset}
          disabled={saving}
        >
          {t("common.button.reset")}
        </button>
        <button
          className="rounded bg-accent-primary px-3 py-1 font-mono text-[11px] text-white hover:brightness-110 disabled:opacity-40"
          onClick={handleSave}
          disabled={saving || !isDirty}
        >
          {saving ? "..." : t("common.button.save")}
        </button>
      </div>
    </div>
  );
}

// ── Collapsible Section Wrapper ───────────────────────────

export function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        className="flex w-full items-center gap-2 px-6 py-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <span
          className={cn(
            "font-mono text-[10px] text-text-secondary transition-transform",
            open && "rotate-90"
          )}
        >
          ▸
        </span>
        <span className="font-mono text-xs font-medium text-text-primary">
          {title}
        </span>
      </button>
      {open && <div className="px-6 pb-4">{children}</div>}
    </div>
  );
}

