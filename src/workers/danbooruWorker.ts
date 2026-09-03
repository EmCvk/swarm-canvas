// src/workers/danbooruWorker.ts

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

let hierarchy: Record<string, Record<string, string[]>> = {};
let allUniqueTagsList: string[] = [];
let tagDescriptions: Record<string, string> = {};
let tagIndex: AutocompleteItem[] = [];
const tagLookup = new Map<string, { count: number | null; category: string }>();
const tagMetaMap = new Map<string, { parent: string; sub: string }>();

async function fetchAsset(p1: string, p2: string, type: 'json' | 'text') {
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

function parseCsv(csvText: string) {
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
    tagLookup.set(tag.toLowerCase().replace(/\s+/g, '_'), { count, category });
  }

  items.sort((a, b) => (b.count || 0) - (a.count || 0));
  tagIndex = items;
}

function parseCategories(raw: any) {
  if (!raw || !raw.tags) return;
  const rawTags: Record<string, string> = raw.tags;
  const subcatToTags: Record<string, string[]> = {};
  const allSet = new Set<string>();

  for (const [tag, subcat] of Object.entries(rawTags)) {
    if (!subcatToTags[subcat]) subcatToTags[subcat] = [];
    subcatToTags[subcat].push(tag);
    allSet.add(tag);
  }

  allUniqueTagsList = Array.from(allSet);
  const clean: Record<string, Record<string, string[]>> = {};

  for (const [parentName, subs] of Object.entries(PARENT_CATEGORY_MAP)) {
    clean[parentName] = {};
    for (const sub of subs) {
      const tags = subcatToTags[sub];
      if (tags && tags.length > 0) {
        clean[parentName][sub] = tags;
        tags.forEach((t: string) => {
          tagMetaMap.set(t.toLowerCase().replace(/\s+/g, '_'), {
            parent: parentName,
            sub
          });
        });
      }
    }
  }

  hierarchy = clean;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  if (type === 'INIT') {
    const [catRaw, descRaw, csvText] = await Promise.all([
      fetchAsset('/data/danbooru_categories.json', '/danbooru_categories.json', 'json'),
      fetchAsset('/data/tag_descriptions.json', '/tag_descriptions.json', 'json'),
      fetchAsset('/data/danbooru.csv', '/danbooru.csv', 'text')
    ]);

    if (descRaw) tagDescriptions = descRaw;
    if (csvText) parseCsv(csvText);
    if (catRaw) parseCategories(catRaw);

    const specificParents = Object.keys(hierarchy).filter((p) => {
      const pObj = hierarchy[p];
      if (!pObj) return false;
      const set = new Set<string>();
      Object.values(pObj).forEach((arr) => arr.forEach((t) => set.add(t)));
      return set.size > 0;
    });

    // "All" parent placed at the foremost left
    const parentCategories = ['All', ...specificParents];
    const parentCounts: Record<string, number> = {};
    const subCounts: Record<string, Record<string, number>> = {};

    parentCounts['All'] = allUniqueTagsList.length;
    subCounts['All'] = { 'All': allUniqueTagsList.length };

    specificParents.forEach((parent) => {
      const pObj = hierarchy[parent] || {};
      const set = new Set<string>();
      subCounts[parent] = {};
      Object.entries(pObj).forEach(([sub, arr]) => {
        subCounts[parent][sub] = arr.length;
        subCounts['All'][sub] = arr.length;
        arr.forEach((t) => set.add(t));
      });
      parentCounts[parent] = set.size;
      subCounts[parent]['All'] = set.size;
    });

    self.postMessage({
      id,
      success: true,
      data: { parentCategories, parentCounts, subCounts }
    });
    return;
  }

  if (type === 'SEARCH') {
    const { query, limit = 8 } = payload;
    const q = (query || '').toLowerCase().replace(/\s+/g, '_');
    if (!q) {
      self.postMessage({ id, success: true, data: [] });
      return;
    }

    const matches: AutocompleteItem[] = [];
    for (const item of tagIndex) {
      const norm = item.tag.toLowerCase().replace(/\s+/g, '_');
      if (norm.startsWith(q) || norm.includes(q)) {
        matches.push(item);
        if (matches.length >= limit) break;
      }
    }
    self.postMessage({ id, success: true, data: matches });
    return;
  }

  if (type === 'GET_TAGS') {
    const { parent, sub, search = '', limit = 300 } = payload;
    let list: string[] = [];

    if (parent === 'All') {
      if (sub === 'All') {
        list = allUniqueTagsList;
      } else {
        for (const pObj of Object.values(hierarchy)) {
          if (pObj[sub]) {
            list = pObj[sub];
            break;
          }
        }
      }
    } else {
      const pObj = hierarchy[parent];
      if (pObj) {
        if (sub === 'All') {
          const set = new Set<string>();
          Object.values(pObj).forEach((arr) => arr.forEach((t) => set.add(t)));
          list = Array.from(set);
        } else {
          list = pObj[sub] || [];
        }
      }
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase().replace(/\s+/g, '_');
      list = list.filter((t) => t.toLowerCase().replace(/\s+/g, '_').includes(q));
    }

    const sorted = list
      .sort((a, b) => {
        const countA = tagLookup.get(a.toLowerCase().replace(/\s+/g, '_'))?.count || 0;
        const countB = tagLookup.get(b.toLowerCase().replace(/\s+/g, '_'))?.count || 0;
        return countB - countA;
      })
      .slice(0, limit);

    self.postMessage({ id, success: true, data: sorted });
    return;
  }

  if (type === 'GET_DETAIL') {
    const { tag, currentParent, currentSub } = payload;
    const key = tag.toLowerCase().replace(/\s+/g, '_');
    const meta = tagMetaMap.get(key) || {
      parent: currentParent || 'General',
      sub: currentSub && currentSub !== 'All' ? currentSub : 'General'
    };

    const detail: TagDetail = {
      tag,
      description: tagDescriptions[key] || tagDescriptions[tag.toLowerCase()] || null,
      postCount: tagLookup.get(key)?.count ?? null,
      parentCategory: currentParent || meta.parent,
      subCategory: currentSub && currentSub !== 'All' ? currentSub : meta.sub
    };

    self.postMessage({ id, success: true, data: detail });
    return;
  }

  if (type === 'GET_COUNT') {
    const { tag } = payload;
    const key = tag.toLowerCase().replace(/\s+/g, '_');
    const count = tagLookup.get(key)?.count ?? null;
    self.postMessage({ id, success: true, data: count });
  }
};