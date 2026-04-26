"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/shared/Button";
import type { EventCreate, EventUpdate, ScheduleEvent } from "@/stores/schedule-store";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: EventCreate | EventUpdate) => Promise<void>;
  onDelete?: () => Promise<void>;
  event?: ScheduleEvent | null;
  defaultStart?: string;
  defaultEnd?: string;
}

const COLORS = ["#6366f1", "#8b5cf6", "#14b8a6", "#f59e0b", "#ef4444", "#10b981", "#3b82f6"];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-2">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full transition-all"
          style={{
            background: c,
            outline: value === c ? `2px solid white` : "none",
            outlineOffset: "2px",
            transform: value === c ? "scale(1.15)" : "scale(1)",
          }}
        />
      ))}
    </div>
  );
}

export function EventModal({ open, onClose, onSave, onDelete, event, defaultStart, defaultEnd }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description ?? "");
      setStartAt(event.start_at.slice(0, 16));
      setEndAt(event.end_at.slice(0, 16));
      setColor(event.color ?? "#6366f1");
    } else {
      setTitle("");
      setDescription("");
      setStartAt(defaultStart ?? new Date().toISOString().slice(0, 16));
      setEndAt(defaultEnd ?? new Date(Date.now() + 3600000).toISOString().slice(0, 16));
      setColor("#6366f1");
    }
  }, [event, defaultStart, defaultEnd, open]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        color,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ pointerEvents: "none" }}
          >
            <div
              className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
                pointerEvents: "auto",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {event ? "Edit Event" : "New Event"}
                </h3>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                  style={{ color: "var(--muted)" }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Title */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-dim)" }}>
                  Title *
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Write introduction draft"
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-dim)" }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />
              </div>

              {/* Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 flex items-center gap-1" style={{ color: "var(--text-dim)" }}>
                    <Clock size={11} /> Start
                  </label>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 flex items-center gap-1" style={{ color: "var(--text-dim)" }}>
                    <Clock size={11} /> End
                  </label>
                  <input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                  />
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-xs font-medium mb-2 flex items-center gap-1" style={{ color: "var(--text-dim)" }}>
                  <Tag size={11} /> Color
                </label>
                <ColorPicker value={color} onChange={setColor} />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  {event && onDelete && (
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Trash2 size={13} />}
                      loading={deleting}
                      onClick={handleDelete}
                    >
                      Delete
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={!title.trim()}>
                    {event ? "Save Changes" : "Create Event"}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
