export interface AutocompleteItem {
  tag: string;
  count: number | null;
  category: string;
}

export interface TagDetail {
  tag: string;
  description: string | null;
  postCount: number | null;
  parentCategory: string;
  subCategory: string;
}

// Maps Danbooru subcategories into official PromptPills parent categories
const PARENT_CATEGORY_MAP: Record<string, string[]> = {
  'Quality': ['Metatags'],
  'Attire & Fashion': [
    'Attire', 'Neck And Neckwear', 'Accessories', 'Headwear', 'Eyewear',
    'Handwear', 'Fashion Style', 'Sleeves', 'Legwear', 'Prints', 'Sexual Attire'
  ],
  'Face & Hair': [
    'Face Tags', 'Eyes Tags', 'Hair Styles', 'Hair', 'Makeup', 'Ears Tags', 'Hair Color'
  ],
  'Body & Anatomy': [
    'Breasts Tags', 'Body Parts', 'Hands', 'Wings', 'Shoulders', 'Feet',
    'Ass', 'Pussy', 'Skin Color', 'Covering'
  ],
  'Poses & Actions': [
    'Holding Tags', 'Verbs And Gerunds', 'Posture', 'Gestures', 'Dances', 'Sports'
  ],
  'Composition & Style': [
    'Image Composition', 'Artistic License', 'Lighting', 'Colors',
    'Visual Aesthetic', 'Focus Tags', 'Patterns'
  ],
  'Locations & Scenery': [
    'Locations', 'Real World Locations', 'Backgrounds', 'Doors And Gates', 'Water', 'Fire'
  ],
  'Characters & People': [
    'People', 'Character Count', 'Family Relationships', 'Gender Nonconformity', 'Transgender', 'Groups'
  ],
  'Animals & Nature': [
    'Cats', 'Dogs', 'Birds', 'Flowers', 'Legendary Creatures'
  ],
  'Food & Beverage': [
    'Food Tags'
  ],
  'Sex & Erotica': [
    'Sex Acts', 'Sex Objects', 'Sexual Positions', 'Bdsm And Torture', 'Nudity', 'Censorship', 'Simulated Sex Acts'
  ],
  'Video Games': [
    'Role-Playing Games', 'Visual Novel Games', 'Fighting Games', 'Shooter Games', 'Platform Games', 'Video Game'
  ],
  'Text & Lore': [
    'Symbols', 'Text', 'Phrases', 'Japanese Dialects', 'Year Tags'
  ],
  'Audio & Sound': [
    'Audio Tags'
  ],
  'Society & Culture': [
    'Companies And Brand Names', 'Holidays And Celebrations', 'Jobs', 'History',
    'Cards', 'Board Games', 'Drawing Software', 'Technology', 'Pixiv Projects', 'Fine Art Parody', 'Theme', 'Subjective'
  ]
};

class DanbooruService {
  // ParentCategory -> SubCategory -> Tag Array
  private hierarchy: Record<string, Record<string, string[]>> = {};
  private tagDescriptions: Record<string, string> = {};
  private tagIndex: AutocompleteItem[] = [];
  private tagLookup: Map<string, { count: number | null; category: string }> = new Map();
  private tagMetaMap: Map<string, { parent: string; sub: string }> = new Map();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const [catRaw, descRaw, csvText] = await Promise.all([
        this.fetchAsset('/data/danbooru_categories.json', '/danbooru_categories.json', 'json'),
        this.fetchAsset('/data/tag_descriptions.json', '/tag_descriptions.json', 'json'),
        this.fetchAsset('/data/danbooru.csv', '/danbooru.csv', 'text')
      ]);

      if (descRaw) {
        this.tagDescriptions = descRaw;
      }

      if (csvText) {
        this.parseCsv(csvText);
      }

      if (catRaw) {
        this.parseCategories(catRaw);
      }

      this.initialized = true;
    } catch (err) {
      console.warn('[DanbooruService] Initialization warning:', err);
    }
  }

  private async fetchAsset(p1: string, p2: string, type: 'json' | 'text'): Promise<any> {
    try {
      const r = await fetch(p1);
      if (r.ok) return type === 'json' ? await r.json() : await r.text();
    } catch {}
    try {
      const r = await fetch(p2);
      if (r.ok) return type === 'json' ? await r.json() : await r.text();
    } catch {}
    return null;
  }

  private parseCsv(csvText: string) {
    const lines = csvText.split('\n');
    const items: AutocompleteItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      const tag = parts[0]?.trim();
      if (!tag) continue;

      const category = parts[1]?.trim() || 'General';
      const count = parts[2] ? parseInt(parts[2].trim(), 10) : null;

      items.push({ tag, count: isNaN(count!) ? null : count, category });
      this.tagLookup.set(tag.toLowerCase().replace(/\s+/g, '_'), { count, category });
    }

    items.sort((a, b) => (b.count || 0) - (a.count || 0));
    this.tagIndex = items;
  }

  private parseCategories(raw: any) {
    if (!raw || !raw.tags) return;

    const rawTags: Record<string, string> = raw.tags;
    const subcatToTags: Record<string, string[]> = {};

    for (const [tag, subcat] of Object.entries(rawTags)) {
      if (!subcatToTags[subcat]) subcatToTags[subcat] = [];
      subcatToTags[subcat].push(tag);
    }

    const clean: Record<string, Record<string, string[]>> = {};

    for (const [parentName, subs] of Object.entries(PARENT_CATEGORY_MAP)) {
      clean[parentName] = {};

      for (const sub of subs) {
        const tags = subcatToTags[sub];
        if (tags && tags.length > 0) {
          clean[parentName][sub] = tags;
          tags.forEach((t: string) => {
            this.tagMetaMap.set(t.toLowerCase().replace(/\s+/g, '_'), {
              parent: parentName,
              sub
            });
          });
        }
      }
    }

    this.hierarchy = clean;
  }

  getParentCategories(): string[] {
    return Object.keys(this.hierarchy).filter((p) => this.getParentCount(p) > 0);
  }

  getParentCount(parent: string): number {
    const pObj = this.hierarchy[parent];
    if (!pObj) return 0;
    const set = new Set<string>();
    Object.values(pObj).forEach((arr) => arr.forEach((t: string) => set.add(t)));
    return set.size;
  }

  getSubCategories(parent: string): string[] {
    const pObj = this.hierarchy[parent];
    if (!pObj) return ['All'];
    return ['All', ...Object.keys(pObj)];
  }

  getSubCount(parent: string, sub: string): number {
    if (sub === 'All') return this.getParentCount(parent);
    return (this.hierarchy[parent]?.[sub] || []).length;
  }

  getTags(parent: string, sub: string, search = '', limit = 300): string[] {
    const pObj = this.hierarchy[parent];
    if (!pObj) return [];

    let list: string[] = [];

    if (sub === 'All') {
      const set = new Set<string>();
      Object.values(pObj).forEach((arr) => arr.forEach((t: string) => set.add(t)));
      list = Array.from(set);
    } else {
      list = pObj[sub] || [];
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase().replace(/\s+/g, '_');
      list = list.filter((t: string) => {
        const norm = t.toLowerCase().replace(/\s+/g, '_');
        return norm.includes(q);
      });
    }

    return list
      .sort((a: string, b: string) => (this.getPostCount(b) || 0) - (this.getPostCount(a) || 0))
      .slice(0, limit);
  }

  getTagDetail(tag: string, currentParent?: string, currentSub?: string): TagDetail {
    const key = tag.toLowerCase().replace(/\s+/g, '_');
    const meta = this.tagMetaMap.get(key) || {
      parent: currentParent || 'General',
      sub: currentSub && currentSub !== 'All' ? currentSub : 'General'
    };

    return {
      tag,
      description: this.tagDescriptions[key] || this.tagDescriptions[tag.toLowerCase()] || null,
      postCount: this.tagLookup.get(key)?.count ?? null,
      parentCategory: currentParent || meta.parent,
      subCategory: currentSub && currentSub !== 'All' ? currentSub : meta.sub
    };
  }

  searchAutocomplete(query: string, limit = 8): AutocompleteItem[] {
    if (!query || query.trim().length < 1) return [];
    const q = query.toLowerCase().replace(/\s+/g, '_');

    const matches: AutocompleteItem[] = [];
    for (const item of this.tagIndex) {
      const norm = item.tag.toLowerCase().replace(/\s+/g, '_');
      if (norm.startsWith(q) || norm.includes(q)) {
        matches.push(item);
        if (matches.length >= limit) break;
      }
    }
    return matches;
  }

  getPostCount(tag: string): number | null {
    const key = tag.toLowerCase().replace(/\s+/g, '_');
    return this.tagLookup.get(key)?.count ?? null;
  }
}

export const danbooru = new DanbooruService();