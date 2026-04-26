import { create } from "zustand";
import { api } from "@/lib/api-client";

export interface ScheduleEvent {
  id: string;
  user_id: string;
  goal_id?: string | null;
  run_id?: string | null;
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  source: "agent" | "manual";
  color?: string | null;
  all_day: boolean;
  created_at: string;
}

export interface EventCreate {
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  goal_id?: string;
  color?: string;
  all_day?: boolean;
}

export interface EventUpdate {
  title?: string;
  description?: string;
  start_at?: string;
  end_at?: string;
  color?: string;
  all_day?: boolean;
}

interface ScheduleState {
  events: ScheduleEvent[];
  isLoading: boolean;
  loadEvents: (start?: string, end?: string) => Promise<void>;
  createEvent: (data: EventCreate) => Promise<ScheduleEvent>;
  updateEvent: (id: string, data: EventUpdate) => Promise<ScheduleEvent>;
  deleteEvent: (id: string) => Promise<void>;
  deleteAllEvents: () => Promise<number>;
}

export const useScheduleStore = create<ScheduleState>()((set, get) => ({
  events: [],
  isLoading: false,

  loadEvents: async (start?: string, end?: string) => {
    set({ isLoading: true });
    try {
      const params = new URLSearchParams();
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      const query = params.toString();
      const data = await api.get<ScheduleEvent[]>(`/schedule/events${query ? "?" + query : ""}`);
      set({ events: data });
    } finally {
      set({ isLoading: false });
    }
  },

  createEvent: async (data) => {
    const event = await api.post<ScheduleEvent>("/schedule/events", data);
    set((s) => ({ events: [...s.events, event] }));
    return event;
  },

  updateEvent: async (id, data) => {
    const event = await api.patch<ScheduleEvent>(`/schedule/events/${id}`, data);
    set((s) => ({ events: s.events.map((e) => (e.id === id ? event : e)) }));
    return event;
  },

  deleteEvent: async (id) => {
    await api.delete(`/schedule/events/${id}`);
    set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
  },

  deleteAllEvents: async () => {
    const result = await api.delete<{ deleted_count: number }>("/schedule/events");
    set({ events: [] });
    return result.deleted_count;
  },
}));
