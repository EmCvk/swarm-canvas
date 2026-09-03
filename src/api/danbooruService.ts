import { CUSTOM_CATEGORIES, CUSTOM_DESCRIPTIONS, CUSTOM_POST_COUNTS } from './customTagDatabase';

export type CategorizationMode = 'prompt_flow' | 'danbooru_types' | 'danbooru_groups';
export type SortMode = 'alphabetical' | 'popularity';

export interface TagDetail {
  tag: string;
  subCategory: string;
  postCount: number | null;
  description?: string;
}

export interface AutocompleteItem {
  name: string;
  category?: string;
  count?: number;
}

class DanbooruCustomService {
  private stages = CUSTOM_CATEGORIES;
  private postCounts = new Map<string, number>(Object.entries(CUSTOM_POST_COUNTS));
  private descriptions = new Map<string, string>(Object.entries(CUSTOM_DESCRIPTIONS));
  private loaded = true;

  constructor() {}

  public isReady(): boolean {
    return this.loaded;
  }

  public onLoaded(cb: () => void): () => void {
    cb();
    return () => {};
  }

  public getParentCategories(): string[] {
    return Object.keys(this.stages);
  }

  public getSubCategories(parent: string): string[] {
    const pData = this.stages[parent];
    if (!pData) return ['All'];
    return ['All', ...Object.keys(pData)];
  }

  public getParentCount(parent: string): number {
    const pData = this.stages[parent];
    if (!pData) return 0;
    const unique = new Set<string>();
    Object.values(pData).forEach((arr) => arr.forEach((t) => unique.add(t)));
    return unique.size;
  }

  public getSubCount(parent: string, sub: string): number {
    const pData = this.stages[parent];
    if (!pData) return 0;
    if (sub === 'All') return this.getParentCount(parent);
    return pData[sub]?.length || 0;
  }

  public getPostCount(tag: string): number | null {
    const clean = tag.toLowerCase().replace(/\s+/g, '_');
    return this.postCounts.get(clean) ?? 50000;
  }

  public async getTags(parent: string, sub: string, search = '', limit = 300): Promise<string[]> {
    const pData = this.stages[parent];
    let list: string[] = [];

    if (!pData) {
      // Flatten all categories if parent not found
      const all: string[] = [];
      Object.values(this.stages).forEach((subObj) => {
        Object.values(subObj).forEach((arr) => all.push(...arr));
      });
      list = all;
    } else if (sub === 'All' || !sub) {
      const set = new Set<string>();
      Object.values(pData).forEach((arr) => arr.forEach((t) => set.add(t)));
      list = Array.from(set);
    } else {
      list = pData[sub] || [];
    }

    if (search.trim()) {
      const q = search.toLowerCase().replace(/\s+/g, '_');
      const qSpace = q.replace(/_/g, ' ');
      list = list.filter((t) => {
        const lower = t.toLowerCase();
        return lower.includes(q) || lower.replace(/_/g, ' ').includes(qSpace);
      });
    }

    list.sort((a, b) => a.localeCompare(b));
    return list.slice(0, limit);
  }

  public async getTagDetail(tag: string, currentParent?: string, currentSub?: string): Promise<TagDetail> {
    const clean = tag.toLowerCase().replace(/\s+/g, '_');
    return {
      tag,
      subCategory: currentSub && currentSub !== 'All' ? currentSub : (currentParent || 'General'),
      postCount: this.getPostCount(clean),
      description: this.descriptions.get(clean) || `Keyword definition for ${tag.replace(/_/g, ' ')}.`,
    };
  }

  public async searchAutocomplete(query: string, limit = 8): Promise<AutocompleteItem[]> {
    const q = (query || '').toLowerCase().trim().replace(/\s+/g, '_');
    if (!q) return [];

    const all: string[] = [];
    Object.values(this.stages).forEach((subObj) => {
      Object.values(subObj).forEach((arr) => all.push(...arr));
    });

    const matches: AutocompleteItem[] = [];
    for (const name of all) {
      if (name.toLowerCase().includes(q) || name.toLowerCase().replace(/_/g, ' ').includes(q)) {
        matches.push({
          name,
          category: 'General',
          count: this.getPostCount(name) || 1000,
        });
        if (matches.length >= limit) break;
      }
    }
    return matches;
  }

  public async getRandomTags(parent: string, count = 2): Promise<string[]> {
    const all = await this.getTags(parent, 'All', '', 9999);
    if (!all.length) return [];
    return [...all].sort(() => 0.5 - Math.random()).slice(0, count);
  }

  public async setCategorizationMode(_mode: CategorizationMode): Promise<void> {}
  public async setSortMode(_mode: SortMode): Promise<void> {}
}

export const danbooru = new DanbooruCustomService();