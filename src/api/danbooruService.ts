// src/api/danbooruService.ts
import { AutocompleteItem, TagDetail } from '../workers/danbooruWorker';
export type { AutocompleteItem, TagDetail };

class DanbooruWorkerClient {
  private worker: Worker | null = null;
  private messageMap = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private initialized = false;
  private parentCategories: string[] = [];
  private parentCounts: Record<string, number> = {};
  private subCounts: Record<string, Record<string, number>> = {};
  private postCountCache = new Map<string, number | null>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.worker = new Worker(new URL('../workers/danbooruWorker.ts', import.meta.url), {
        type: 'module'
      });

      this.worker.onmessage = (e: MessageEvent) => {
        const { id, success, data, error } = e.data;
        const pending = this.messageMap.get(id);
        if (pending) {
          this.messageMap.delete(id);
          if (success) pending.resolve(data);
          else pending.reject(error);
        }
      };
    }
  }

  private post<T>(type: string, payload?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker) return resolve([] as any);
      const id = `${Date.now()}_${Math.random()}`;
      this.messageMap.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const res: any = await this.post('INIT');
    if (res) {
      this.parentCategories = res.parentCategories || [];
      this.parentCounts = res.parentCounts || {};
      this.subCounts = res.subCounts || {};
    }
    this.initialized = true;
  }

  getParentCategories(): string[] {
    return this.parentCategories;
  }

  getParentCount(parent: string): number {
    return this.parentCounts[parent] || 0;
  }

  getSubCategories(parent: string): string[] {
    const pObj = this.subCounts[parent];
    if (!pObj) return ['All'];
    return Object.keys(pObj);
  }

  getSubCount(parent: string, sub: string): number {
    return this.subCounts[parent]?.[sub] || 0;
  }

  async getTags(parent: string, sub: string, search = '', limit = 300): Promise<string[]> {
    return this.post<string[]>('GET_TAGS', { parent, sub, search, limit });
  }

  async getTagDetail(tag: string, currentParent?: string, currentSub?: string): Promise<TagDetail> {
    return this.post<TagDetail>('GET_DETAIL', { tag, currentParent, currentSub });
  }

  async searchAutocomplete(query: string, limit = 8): Promise<AutocompleteItem[]> {
    return this.post<AutocompleteItem[]>('SEARCH', { query, limit });
  }

  getPostCount(tag: string): number | null {
    if (this.postCountCache.has(tag)) return this.postCountCache.get(tag)!;
    this.post<number | null>('GET_COUNT', { tag }).then((count) => {
      this.postCountCache.set(tag, count);
    });
    return null;
  }
}

export const danbooru = new DanbooruWorkerClient();