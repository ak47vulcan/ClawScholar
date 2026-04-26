"use client";

import { useRef } from "react";
import type FullCalendar from "@fullcalendar/react";
import type { PluginDef } from "@fullcalendar/core";
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import "@fullcalendar/interaction";
import { useScheduleStore, type ScheduleEvent } from "@/stores/schedule-store";

// Dynamic import of FullCalendar to avoid SSR issues
let FC: typeof import("@fullcalendar/react").default | null = null;
let dayGridPlugin: PluginDef | null = null;
let timeGridPlugin: PluginDef | null = null;
let interactionPlugin: PluginDef | null = null;

if (typeof window !== "undefined") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    FC = require("@fullcalendar/react").default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    dayGridPlugin = require("@fullcalendar/daygrid").default as PluginDef;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    timeGridPlugin = require("@fullcalendar/timegrid").default as PluginDef;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    interactionPlugin = require("@fullcalendar/interaction").default as PluginDef;
  } catch {
    // FullCalendar not installed yet
  }
}

interface Props {
  onSelectSlot?: (start: string, end: string) => void;
  onSelectEvent?: (event: ScheduleEvent) => void;
}

function toFCEvent(e: ScheduleEvent) {
  return {
    id: e.id,
    title: e.title,
    start: e.start_at,
    end: e.end_at,
    allDay: e.all_day,
    backgroundColor: e.color ?? (e.source === "agent" ? "#6366f1" : "#14b8a6"),
    borderColor: "transparent",
    textColor: "#ffffff",
    extendedProps: { source: e.source, description: e.description, raw: e },
    editable: e.source === "manual",
  };
}

export function WeekCalendar({ onSelectSlot, onSelectEvent }: Props) {
  const { events, updateEvent } = useScheduleStore();
  const calRef = useRef<FullCalendar | null>(null);

  const fcEvents = events.map(toFCEvent);

  if (!FC) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading calendar…
        </p>
      </div>
    );
  }

  const FullCalendar = FC as NonNullable<typeof FC>;
  const plugins = [dayGridPlugin, timeGridPlugin, interactionPlugin].filter(
    Boolean
  ) as PluginDef[];

  return (
    <div className="h-full fc-dark-theme">
      <FullCalendar
        ref={calRef}
        plugins={plugins}
        initialView="timeGridWeek"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        events={fcEvents}
        editable
        selectable
        selectMirror
        dayMaxEvents
        nowIndicator
        height="100%"
        slotMinTime="06:00:00"
        slotMaxTime="23:00:00"
        select={(info: DateSelectArg) => {
          onSelectSlot?.(info.startStr, info.endStr);
        }}
        eventClick={(info: EventClickArg) => {
          const raw = info.event.extendedProps.raw as ScheduleEvent;
          onSelectEvent?.(raw);
        }}
        eventDrop={(info: EventDropArg) => {
          const ev = info.event;
          updateEvent(ev.id, {
            start_at: ev.startStr,
            end_at: ev.endStr ?? ev.startStr,
          }).catch(() => info.revert());
        }}
        eventResize={(info: EventResizeDoneArg) => {
          const ev = info.event;
          updateEvent(ev.id, {
            start_at: ev.startStr,
            end_at: ev.endStr ?? ev.startStr,
          }).catch(() => info.revert());
        }}
      />
    </div>
  );
}
