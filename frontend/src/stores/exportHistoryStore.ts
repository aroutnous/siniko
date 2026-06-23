import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ExportHistoryItem {
  id: string;
  label: string;
  format: "pdf" | "excel";
  downloadedAt: string;
}

interface ExportHistoryState {
  items: ExportHistoryItem[];
  add: (label: string, format: "pdf" | "excel") => void;
  clear: () => void;
}

export const useExportHistoryStore = create<ExportHistoryState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (label, format) => {
        const item: ExportHistoryItem = {
          id: crypto.randomUUID(),
          label,
          format,
          downloadedAt: new Date().toISOString(),
        };
        set({ items: [item, ...get().items].slice(0, 20) });
      },
      clear: () => set({ items: [] }),
    }),
    { name: "kalanko-export-history" },
  ),
);
