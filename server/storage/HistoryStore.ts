import type { DownloadHistoryItem } from '../../shared/types.js';

export class HistoryStore {
  private history: DownloadHistoryItem[] = [];
  private maxItems = 50;

  add(item: Omit<DownloadHistoryItem, 'id'>): DownloadHistoryItem {
    const record: DownloadHistoryItem = {
      ...item,
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    };

    this.history.unshift(record);
    if (this.history.length > this.maxItems) {
      this.history = this.history.slice(0, this.maxItems);
    }
    return record;
  }

  getAll(): DownloadHistoryItem[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
  }
}

export const defaultHistoryStore = new HistoryStore();
