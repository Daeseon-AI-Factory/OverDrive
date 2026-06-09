import { create } from 'zustand';

// Rest timer — auto-starts after every logged set (the #1 gym companion feature). Stored as an
// absolute end timestamp so re-renders/backgrounding can't drift it. Logging again restarts it.
interface RestTimerState {
  endsAt: number | null; // epoch ms
  durationSec: number;
  start: (sec?: number) => void;
  stop: () => void;
}

export const DEFAULT_REST_SEC = 90;

export const useRestTimerStore = create<RestTimerState>((set, get) => ({
  endsAt: null,
  durationSec: DEFAULT_REST_SEC,
  start: (sec) => {
    const d = sec ?? get().durationSec;
    set({ endsAt: Date.now() + d * 1000, durationSec: d });
  },
  stop: () => set({ endsAt: null }),
}));
