"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { WeekCalendar } from "@/components/schedule/WeekCalendar";
import { EventModal } from "@/components/schedule/EventModal";
import { Button } from "@/components/shared/Button";
import { useScheduleStore, type ScheduleEvent } from "@/stores/schedule-store";
import { useUIStore } from "@/stores/ui-store";

export default function SchedulePage() {
  const { events, loadEvents, createEvent, updateEvent, deleteEvent, deleteAllEvents } = useScheduleStore();
  const addToast = useUIStore((s) => s.addToast);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [defaultStart, setDefaultStart] = useState<string | undefined>();
  const [defaultEnd, setDefaultEnd] = useState<string | undefined>();
  const [clearingEvents, setClearingEvents] = useState(false);

  useEffect(() => {
    loadEvents().catch(() => null);
  }, []);

  const handleSelectSlot = (start: string, end: string) => {
    setEditingEvent(null);
    setDefaultStart(start);
    setDefaultEnd(end);
    setModalOpen(true);
  };

  const handleSelectEvent = (event: ScheduleEvent) => {
    setEditingEvent(event);
    setDefaultStart(undefined);
    setDefaultEnd(undefined);
    setModalOpen(true);
  };

  const handleSave = async (data: Parameters<typeof createEvent>[0] | Parameters<typeof updateEvent>[1]) => {
    try {
      if (editingEvent) {
        await updateEvent(editingEvent.id, data as Parameters<typeof updateEvent>[1]);
        addToast({ type: "success", message: "Event updated" });
      } else {
        await createEvent(data as Parameters<typeof createEvent>[0]);
        addToast({ type: "success", message: "Event created" });
      }
    } catch {
      addToast({ type: "error", message: "Failed to save event" });
      throw new Error("save failed");
    }
  };

  const handleDelete = async () => {
    if (!editingEvent) return;
    try {
      await deleteEvent(editingEvent.id);
      addToast({ type: "success", message: "Event deleted" });
    } catch {
      addToast({ type: "error", message: "Failed to delete event" });
      throw new Error("delete failed");
    }
  };

  const handleDeleteAll = async () => {
    if (events.length === 0 || clearingEvents) return;
    if (!confirm(`Delete all ${events.length} calendar entries?`)) return;
    setClearingEvents(true);
    try {
      const deletedCount = await deleteAllEvents();
      setModalOpen(false);
      setEditingEvent(null);
      addToast({ type: "success", message: `Deleted ${deletedCount} calendar entries` });
    } catch {
      addToast({ type: "error", message: "Failed to delete calendar entries" });
    } finally {
      setClearingEvents(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Schedule"
        subtitle="Your research calendar — agent-planned + manually editable"
        action={
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={13} />}
            onClick={handleDeleteAll}
            loading={clearingEvents}
            disabled={events.length === 0}
          >
            Clear all
          </Button>
        }
      />

      <div className="flex-1 overflow-hidden p-4">
        <div
          className="h-full rounded-2xl overflow-hidden"
          style={{ border: "1px solid var(--border)", background: "var(--surface-1)" }}
        >
          <WeekCalendar onSelectSlot={handleSelectSlot} onSelectEvent={handleSelectEvent} />
        </div>
      </div>

      <EventModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingEvent(null);
        }}
        onSave={handleSave}
        onDelete={editingEvent ? handleDelete : undefined}
        event={editingEvent}
        defaultStart={defaultStart}
        defaultEnd={defaultEnd}
      />

      {/* FullCalendar dark theme overrides */}
      <style jsx global>{`
        .fc-dark-theme .fc-theme-standard td,
        .fc-dark-theme .fc-theme-standard th,
        .fc-dark-theme .fc-theme-standard .fc-scrollgrid {
          border-color: var(--border) !important;
        }
        .fc-dark-theme .fc-col-header-cell-cushion,
        .fc-dark-theme .fc-daygrid-day-number,
        .fc-dark-theme .fc-timegrid-slot-label-cushion {
          color: var(--text-dim) !important;
          text-decoration: none !important;
        }
        .fc-dark-theme .fc-button-primary {
          background: rgba(99, 102, 241, 0.15) !important;
          border: 1px solid rgba(99, 102, 241, 0.3) !important;
          color: var(--primary) !important;
          font-size: 12px !important;
        }
        .fc-dark-theme .fc-button-primary:hover {
          background: rgba(99, 102, 241, 0.25) !important;
        }
        .fc-dark-theme .fc-button-primary:not(:disabled).fc-button-active {
          background: var(--primary) !important;
          color: white !important;
        }
        .fc-dark-theme .fc-toolbar-title {
          color: var(--text) !important;
          font-size: 15px !important;
          font-weight: 600 !important;
        }
        .fc-dark-theme .fc-highlight {
          background: rgba(99, 102, 241, 0.12) !important;
        }
        .fc-dark-theme .fc-now-indicator-line {
          border-color: #ef4444 !important;
        }
        .fc-dark-theme .fc-timegrid-now-indicator-arrow {
          border-top-color: #ef4444 !important;
        }
        .fc-dark-theme th,
        .fc-dark-theme td,
        .fc-dark-theme .fc-view-harness {
          background: transparent !important;
        }
        .fc-dark-theme .fc-event {
          border-radius: 6px !important;
          font-size: 11px !important;
          font-weight: 500 !important;
        }
      `}</style>
    </div>
  );
}
