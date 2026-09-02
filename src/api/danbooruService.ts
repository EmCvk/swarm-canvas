export interface DanbooruTag {
  tag: string;
  category: string;
  postCount?: number;
}

export interface TagWikiMap {
  [tag: string]: string;
}

export interface CategoryHierarchy {
  [macroCategory: string]: {
    [subCategory: string]: string[];
  };
}

class DanbooruService {
  private categories: CategoryHierarchy = {};
  private tagDescriptions: TagWikiMap = {};
  private postCounts: Map<string, number> = new Map();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const [catRes, descRes] = await Promise.all([
        fetch('/data/danbooru_categories.json').catch(() => null),
        fetch('/data/tag_descriptions.json').catch(() => null)
      ]);

      if (catRes?.ok) {
        this.categories = await catRes.json();
      }
      if (descRes?.ok) {
        this.tagDescriptions = await descRes.json();
      }

      // Load post counts from danbooru.csv in background
      fetch('/data/danbooru.csv')
        .then((res) => (res.ok ? res.text() : ''))
        .then((csvText) => {
          if (!csvText) return;
          const lines = csvText.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length >= 3) {
              const name = parts[0].trim();
              const count = parseInt(parts[2].trim(), 10);
              if (name && !isNaN(count)) {
                this.postCounts.set(name, count);
              }
            }
          }
        })
        .catch(() => {});

      this.initialized = true;
    } catch (err) {
      console.warn('[DanbooruService] Metadata files not found in /data/, using fallback defaults:', err);
    }
  }

  getMacroCategories(): string[] {
    const keys = Object.keys(this.categories);
    return keys.length > 0
      ? ['All', ...keys]
      : ['All', 'Quality', 'Style', 'Character', 'Attire', 'Anatomy', 'Hair', 'Eyes', 'Environment', 'Negative'];
  }

  getSubCategories(macro: string): string[] {
    if (macro === 'All' || !this.categories[macro]) return ['All'];
    return ['All', ...Object.keys(this.categories[macro])];
  }

  getTags(macro: string, sub: string): string[] {
    if (!this.categories[macro]) return [];
    if (sub === 'All') {
      const all: string[] = [];
      Object.values(this.categories[macro]).forEach((arr) => all.push(...arr));
      return Array.from(new Set(all));
    }
    return this.categories[macro][sub] || [];
  }

  getTagDescription(tag: string): string | null {
    const key = tag.toLowerCase().replace(/\s+/g, '_');
    return this.tagDescriptions[key] || this.tagDescriptions[tag] || null;
  }

  getPostCount(tag: string): number | null {
    const key = tag.toLowerCase().replace(/\s+/g, '_');
    return this.postCounts.get(key) ?? null;
  }
}

export const danbooru = new DanbooruService();