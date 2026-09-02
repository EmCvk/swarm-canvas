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

class DanbooruService {
  private hierarchy: Record<string, Record<string, string[]>> = {};
  private tagDescriptions: Record<string, string> = {};
  private tagIndex: AutocompleteItem[] = [];
  private tagLookup: Map<string, { count: number | null; category: string }> = new Map();
  private tagMetaMap: Map<string, { parent: string; sub: string }> = new Map();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const [catRes, descRes, csvRes] = await Promise.all([
        fetch('/data/danbooru_categories.json').catch(() => null),
        fetch('/data/tag_descriptions.json').catch(() => null),
        fetch('/data/danbooru.csv').catch(() => null)
      ]);

      if (descRes?.ok) {
        this.tagDescriptions = await descRes.json();
      }

      if (csvRes?.ok) {
        const text = await csvRes.text();
        this.parseCsv(text);
      }

      if (catRes?.ok) {
        const raw = await catRes.json();
        console.log('[DanbooruService] Raw categories loaded:', raw);
        this.parseCategories(raw);
      }

      this.initialized = true;
    } catch (err) {
      console.warn('[DanbooruService] Initialization warning:', err);
    }
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
    if (!raw) return;

    const clean: Record<string, Record<string, string[]>> = {};

    // Normalize input: unwrap root containers like { categories: [...] } or { data: [...] }
    let items: any[] = [];
    if (Array.isArray(raw)) {
      items = raw;
    } else if (Array.isArray(raw.categories)) {
      items = raw.categories;
    } else if (typeof raw === 'object') {
      // If object keys are numeric indices, convert values into an array
      const keys = Object.keys(raw);
      const isNumericKeys = keys.length > 0 && keys.every((k) => !isNaN(Number(k)));
      if (isNumericKeys) {
        items = Object.values(raw);
      } else {
        // Object with category names as keys: { "Attire": { "Dresses": [...] } }
        items = Object.entries(raw).map(([key, val]) => ({
          name: key,
          content: val
        }));
      }
    }

    for (const item of items) {
      if (!item) continue;

      // 1. Resolve Parent Name
      let parentName =
        item.name ||
        item.category ||
        item.title ||
        item.label ||
        item.category_name ||
        item.macro;

      const content = item.content || item.subcategories || item.sub_categories || item.subs || item.tags || item.items || item;

      if (!parentName && typeof item === 'object') {
        // If content itself has a name
        parentName = Object.keys(item).find((k) => k !== 'id' && k !== 'count');
      }

      if (!parentName || parentName === 'tags' || parentName === 'categories') {
        continue;
      }

      clean[parentName] = clean[parentName] || {};

      // 2. Resolve Subcategories & Tag Arrays
      if (Array.isArray(content)) {
        // Flat tags under parent -> put into "All"
        const tags = content.map((t) => (typeof t === 'string' ? t : t.name || t.tag || String(t)));
        clean[parentName]['All'] = tags;
        tags.forEach((t) => this.tagMetaMap.set(t.toLowerCase(), { parent: parentName, sub: 'All' }));
      } else if (content && typeof content === 'object') {
        for (const [subKey, subVal] of Object.entries(content)) {
          if (subKey === 'name' || subKey === 'category' || subKey === 'id') continue;

          let subName = subKey;
          let tagList: string[] = [];

          if (Array.isArray(subVal)) {
            tagList = subVal.map((t) => (typeof t === 'string' ? t : t.name || t.tag || String(t)));
          } else if (subVal && typeof subVal === 'object') {
            const innerVal: any = subVal;
            subName = innerVal.name || innerVal.title || subKey;
            const innerTags = innerVal.tags || innerVal.items || Object.values(innerVal);
            if (Array.isArray(innerTags)) {
              tagList = innerTags.map((t) => (typeof t === 'string' ? t : t.name || t.tag || String(t)));
            }
          } else if (typeof subVal === 'string') {
            tagList = [subVal];
          }

          if (tagList.length > 0) {
            clean[parentName][subName] = tagList;
            tagList.forEach((t) => this.tagMetaMap.set(t.toLowerCase(), { parent: parentName, sub: subName }));
          }
        }
      }
    }

    this.hierarchy = clean;
    console.log('[DanbooruService] Parsed category hierarchy:', clean);
  }

  getParentCategories(): string[] {
    const keys = Object.keys(this.hierarchy).filter((k) => isNaN(Number(k)));
    return keys.length > 0
      ? ['All', ...keys]
      : ['All', 'Quality', 'Attire', 'Character', 'Hair', 'Eyes', 'Environment', 'Negative'];
  }

  getSubCategories(parent: string): string[] {
    if (parent === 'All' || !this.hierarchy[parent]) return ['All'];
    const subs = Object.keys(this.hierarchy[parent]).filter((s) => s !== 'All');
    return ['All', ...subs];
  }

  getTags(parent: string, sub: string, search = '', limit = 200): string[] {
    let list: string[] = [];

    if (parent === 'All') {
      if (this.tagIndex.length > 0) {
        list = this.tagIndex.map((i) => i.tag);
      } else {
        const set = new Set<string>();
        Object.values(this.hierarchy).forEach((subMap) => {
          Object.values(subMap).forEach((arr) => arr.forEach((t) => set.add(t)));
        });
        list = Array.from(set);
      }
    } else {
      const parentObj = this.hierarchy[parent];
      if (!parentObj) return [];

      if (sub === 'All') {
        const set = new Set<string>();
        Object.values(parentObj).forEach((arr) => arr.forEach((t) => set.add(t)));
        list = Array.from(set);
      } else {
        list = parentObj[sub] || [];
      }
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase().replace(/\s+/g, '_');
      list = list.filter((t) => {
        const norm = t.toLowerCase();
        return norm.includes(q) || norm.replace(/_/g, ' ').includes(q);
      });
    }

    return list
      .sort((a, b) => (this.getPostCount(b) || 0) - (this.getPostCount(a) || 0))
      .slice(0, limit);
  }

  getTagDetail(tag: string): TagDetail {
    const key = tag.toLowerCase().replace(/\s+/g, '_');
    const meta = this.tagMetaMap.get(tag.toLowerCase()) || { parent: 'General', sub: 'All' };
    return {
      tag,
      description: this.tagDescriptions[key] || this.tagDescriptions[tag] || null,
      postCount: this.tagLookup.get(key)?.count ?? null,
      parentCategory: meta.parent,
      subCategory: meta.sub
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

  getTagDescription(tag: string): string | null {
    const key = tag.toLowerCase().replace(/\s+/g, '_');
    return this.tagDescriptions[key] || this.tagDescriptions[tag] || null;
  }

  getPostCount(tag: string): number | null {
    const key = tag.toLowerCase().replace(/\s+/g, '_');
    return this.tagLookup.get(key)?.count ?? null;
  }
}

export const danbooru = new DanbooruService();