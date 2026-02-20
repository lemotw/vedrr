import { useState, useEffect, useRef } from "react";
import { useUIStore } from "../stores/uiStore";
import { ipc } from "../lib/ipc";
import { cn } from "../lib/cn";
import type { AiProfile } from "../lib/types";

const PROVIDERS = [
  { id: "anthropic", name: "Anthropic" },
  { id: "openai", name: "OpenAI" },
];

const PROVIDER_MODELS: Record<string, { id: string; name: string }[]> = {
  anthropic: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
    { id: "claude-haiku-4-20250506", name: "Claude Haiku 4" },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "o3-mini", name: "o3-mini" },
  ],
};

function modelDisplayName(provider: string, modelId: string): string {
  const models = PROVIDER_MODELS[provider] || [];
  return models.find((m) => m.id === modelId)?.name || modelId;
}

export function AISettings() {
  const { aiSettingsOpen, closeAiSettings } = useUIStore();
  const [profiles, setProfiles] = useState<AiProfile[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Add form state
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const loadProfiles = async () => {
    try {
      const list = await ipc.listAiProfiles();
      setProfiles(list);
    } catch (e) {
      console.error("[ai-settings] load profiles failed:", e);
    }
  };

  useEffect(() => {
    if (!aiSettingsOpen) return;
    loadProfiles();
    setShowForm(false);
    setError("");
    setTimeout(() => panelRef.current?.focus(), 50);
  }, [aiSettingsOpen]);

  const handleProviderChange = (p: string) => {
    setProvider(p);
    const models = PROVIDER_MODELS[p];
    setModel(models?.[0]?.id || "");
  };

  const handleAdd = async () => {
    if (!name.trim() || !apiKey.trim()) return;
    setSaving(true);
    setError("");
    try {
      await ipc.createAiProfile(name.trim(), provider, model, apiKey.trim());
      await loadProfiles();
      // Reset form
      setName("");
      setApiKey("");
      setShowForm(false);
    } catch (e) {
      setError(String(e));
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
    localStorage.setItem("mindflow-active-ai-profile", profile.id);
    closeAiSettings();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (showForm) setShowForm(false);
      else closeAiSettings();
    }
  };

  if (!aiSettingsOpen) return null;

  const activeProfileId = localStorage.getItem("mindflow-active-ai-profile");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={closeAiSettings}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[70vh] w-[460px] flex-col rounded-xl border border-border bg-bg-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-heading text-lg text-text-primary">AI Profiles</h2>
          {!showForm && (
            <button
              className="rounded-lg bg-accent-primary px-3 py-1.5 font-mono text-xs text-white hover:brightness-110"
              onClick={() => setShowForm(true)}
            >
              + Add
            </button>
          )}
        </div>

        {/* Add form */}
        {showForm && (
          <div className="border-b border-border px-6 py-4">
            {/* Name */}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-3 w-full rounded-lg border border-border bg-bg-card px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-secondary"
              placeholder="Profile name (e.g. My Claude)"
              autoFocus
            />

            {/* Provider */}
            <div className="mb-3 flex gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-1.5 font-mono text-xs transition-colors",
                    provider === p.id
                      ? "bg-accent-primary text-white"
                      : "bg-bg-card text-text-secondary hover:text-text-primary"
                  )}
                  onClick={() => handleProviderChange(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {/* Model */}
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mb-3 w-full appearance-none rounded-lg border border-border bg-bg-card px-3 py-2 font-mono text-xs text-text-primary"
            >
              {(PROVIDER_MODELS[provider] || []).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            {/* API Key */}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mb-3 w-full rounded-lg border border-border bg-bg-card px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-secondary"
              placeholder="API Key"
            />

            {error && (
              <p className="mb-2 font-mono text-xs text-red-400">{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                className="rounded-lg px-3 py-1.5 font-mono text-xs text-text-secondary hover:text-text-primary"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-accent-primary px-4 py-1.5 font-mono text-xs text-white hover:brightness-110 disabled:opacity-50"
                onClick={handleAdd}
                disabled={saving || !name.trim() || !apiKey.trim()}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* Profile list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {profiles.length === 0 && !showForm && (
            <p className="py-8 text-center font-mono text-xs text-text-secondary">
              No profiles yet. Click "+ Add" to create one.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {profiles.map((p) => {
              const isActive = p.id === activeProfileId;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-4 py-3 transition-colors cursor-pointer",
                    isActive
                      ? "bg-accent-primary/15 ring-1 ring-accent-primary/40"
                      : "bg-bg-card hover:bg-bg-card/80"
                  )}
                  onClick={() => handleSelect(p)}
                >
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm font-medium text-text-primary">
                        {p.name}
                      </span>
                      {isActive && (
                        <span className="shrink-0 rounded bg-accent-primary/20 px-1.5 py-0.5 font-mono text-[10px] text-accent-primary">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-text-secondary">
                      <span>{p.provider === "anthropic" ? "Anthropic" : "OpenAI"}</span>
                      <span>·</span>
                      <span>{modelDisplayName(p.provider, p.model)}</span>
                      <span>·</span>
                      <span className={p.has_api_key ? "text-green-400" : "text-red-400"}>
                        {p.has_api_key ? "Key ✓" : "No key"}
                      </span>
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    className="shrink-0 rounded p-1 font-mono text-xs text-text-secondary opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id);
                    }}
                    title="Delete profile"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3">
          <p className="font-mono text-[10px] text-text-secondary">
            Click a profile to set it as active for AI Compact.
          </p>
        </div>
      </div>
    </div>
  );
}
