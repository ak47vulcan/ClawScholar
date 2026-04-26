"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sun, Moon, Monitor, Key, Save } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/shared/Button";
import { Input } from "@/components/shared/Input";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light" | "system";

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "dark", label: "Dark", icon: <Moon size={15} /> },
  { value: "light", label: "Light", icon: <Sun size={15} /> },
  { value: "system", label: "System", icon: <Monitor size={15} /> },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass flex flex-col gap-0 overflow-hidden">
      <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>{title}</p>
      </div>
      <div className="divide-y divide-[color:var(--border)]">
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{label}</p>
        {description && <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative flex items-center rounded-full transition-colors duration-200 focus-ring"
      style={{
        background: checked ? "var(--primary)" : "var(--surface-3)",
        height: 24,
        width: 44,
        padding: "2px",
        flexShrink: 0,
      }}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
        className="w-5 h-5 rounded-full bg-white shadow-md"
        style={{ marginLeft: checked ? "auto" : 0 }}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useUIStore();
  const addToast = useUIStore((s) => s.addToast);
  const { user } = useAuthStore();

  const [notifications, setNotifications] = useState(true);
  const [autoIndex, setAutoIndex] = useState(true);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [nameValue, setNameValue] = useState(user?.fullName ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch("/auth/me", { full_name: nameValue.trim() || undefined });
      addToast({ type: "success", message: "Settings saved successfully." });
    } catch {
      addToast({ type: "error", message: "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Settings" subtitle="Configure your ClawScholar workspace" />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-5 max-w-2xl mx-auto">

          <Section title="Appearance">
            <SettingRow label="Theme" description="Choose your preferred color scheme">
              <div className="flex gap-1.5">
                {THEME_OPTIONS.map(({ value, label, icon }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                      theme === value ? "bg-indigo-500 text-white" : "hover:bg-[var(--surface-3)]"
                    )}
                    style={theme !== value ? { background: "var(--surface-2)", color: "var(--text-dim)" } : {}}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </SettingRow>
          </Section>

          <Section title="Account">
            <SettingRow label="Name" description="Your display name">
              <div className="w-48">
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  placeholder="Your name"
                />
              </div>
            </SettingRow>
            <SettingRow label="Email" description="Used for login and notifications">
              <div className="w-48">
                <Input defaultValue={user?.email ?? ""} type="email" disabled />
              </div>
            </SettingRow>
          </Section>

          <Section title="LLM Provider">
            <SettingRow
              label="NVIDIA API"
              description="Backend uses NVIDIA's OpenAI-compatible endpoint. Configure via environment variables."
            >
              <div className="flex items-center gap-2">
                <div className="w-40">
                  <Input
                    type={apiKeyVisible ? "text" : "password"}
                    defaultValue="nvapi-••••••••••••"
                    icon={<Key size={13} />}
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={() => setApiKeyVisible((v) => !v)}>
                  {apiKeyVisible ? "Hide" : "Show"}
                </Button>
              </div>
            </SettingRow>
          </Section>

          <Section title="Notifications">
            <SettingRow label="Agent alerts" description="Receive alerts when agents complete or fail">
              <Toggle checked={notifications} onChange={setNotifications} />
            </SettingRow>
          </Section>

          <Section title="Knowledge Base">
            <SettingRow label="Auto-index uploads" description="Automatically embed documents on upload">
              <Toggle checked={autoIndex} onChange={setAutoIndex} />
            </SettingRow>
            <SettingRow label="Embedding model" description="Model used for vector indexing">
              <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: "var(--surface-3)", color: "var(--text-dim)" }}>
                text-embedding-3-small
              </span>
            </SettingRow>
          </Section>

          <div className="flex justify-end pb-6">
            <Button
              variant="primary"
              size="md"
              icon={<Save size={14} />}
              loading={saving}
              onClick={handleSave}
            >
              Save Changes
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
