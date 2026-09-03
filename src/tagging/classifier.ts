import { CategoryPath, classifyPromptFlowTag, getManualOverride, normalizeTag } from '../api/tagTaxonomy';

export interface ClassificationResult {
  primary: CategoryPath;
  secondary: CategoryPath[];
  confidence: number;
  sources: string[];
}

const BODY_WORDS = ['arm','hand','finger','leg','thigh','knee','foot','feet','toe','navel','belly','waist','hips','back','collarbone','tail'];
const EAR_WORDS = ['ear','ears','earring','earrings'];
const HAIR_WORDS = ['hair','bangs','ponytail','braid','twintail','twintails','ahoge','bob_cut','bun'];
const EYE_WORDS = ['eye','eyes','pupil','iris','sclera','eyelashes','eyebrows','wink'];
const CLOTHING_WORDS = ['shirt','blouse','top','sweater','hoodie','skirt','pants','shorts','jeans','dress','robe','kimono','yukata','jacket','coat','cape','cloak','uniform','costume','shoes','boots','sandals'];
const CREATURE_WORDS = ['cat','dog','wolf','fox','horse','rabbit','mouse','rat','bear','panda','bird','duck','goose','fish','shark','whale','dolphin','snake','lizard','frog','dragon','phoenix','griffin','unicorn','spider','butterfly','bee'];

function hasTerm(tag: string, terms: string[]) {
  const parts = normalizeTag(tag).split('_');
  return terms.some(t => parts.includes(t) || normalizeTag(tag) === t);
}

function addUnique(out: CategoryPath[], path: CategoryPath) {
  if (!out.some(x => x.parent === path.parent && x.sub === path.sub && x.subSub === path.subSub)) out.push(path);
}

/**
 * Multi-pass semantic classifier. The native Danbooru type and wiki mapping
 * are treated as evidence, while explicit/manual rules win over heuristics.
 */
export function classifyTagDetailed(
  tag: string,
  nativeCategory: string,
  nativeCode: string,
  wikiCategory: string | null,
  postCount: number | null,
  description: string | null,
): ClassificationResult {
  const primary = classifyPromptFlowTag(tag, nativeCategory, nativeCode, wikiCategory, postCount);
  const secondary: CategoryPath[] = [];
  const sources: string[] = [];
  let confidence = 0.55;
  const manual = getManualOverride(tag);

  if (manual) { confidence = 1; sources.push('manual_override'); }
  if (nativeCategory === 'Artist') { confidence = Math.max(confidence, 0.99); sources.push('native_category'); }
  if (nativeCategory === 'Character' || nativeCategory === 'Copyright') { confidence = Math.max(confidence, 0.97); sources.push('native_category'); }
  if (wikiCategory) { confidence = Math.max(confidence, 0.90); sources.push('danbooru_wiki_category'); }

  const t = normalizeTag(tag);
  const d = normalizeTag(description || '');

  // Context-sensitive exceptions: anatomical/appearance modifiers must not
  // inherit a creature classification merely because they contain "cat", etc.
  if (hasTerm(tag, EAR_WORDS) || /\bears?\b/.test(d) && /(anatom|body|head)/.test(d)) {
    addUnique(secondary, { parent: '4. Face & Hair', sub: 'Ears Tags' });
    confidence = Math.max(confidence, 0.93); sources.push('anatomy_rule');
  }
  if (hasTerm(tag, HAIR_WORDS)) {
    addUnique(secondary, { parent: '4. Face & Hair', sub: 'Hair Styles' });
    confidence = Math.max(confidence, 0.92); sources.push('hair_rule');
  }
  if (hasTerm(tag, EYE_WORDS)) {
    addUnique(secondary, { parent: '4. Face & Hair', sub: 'Eyes Tags' });
    confidence = Math.max(confidence, 0.92); sources.push('eye_rule');
  }
  if (hasTerm(tag, BODY_WORDS)) {
    addUnique(secondary, { parent: '5. Body & Physiology', sub: 'Body Parts' });
    confidence = Math.max(confidence, 0.88); sources.push('body_rule');
  }
  if (hasTerm(tag, CLOTHING_WORDS)) {
    addUnique(secondary, { parent: '6. Wardrobe & Outfit', sub: 'Attire' });
    confidence = Math.max(confidence, 0.88); sources.push('clothing_rule');
  }

  // Only classify as an animal when the tag itself denotes the creature,
  // not when the creature word is merely part of an anatomical/compositional tag.
  if (hasTerm(tag, CREATURE_WORDS) && !/(ears?|tail|print|pattern|costume|onesie|girl|boy|mask|hat|hood|plush)/.test(t)) {
    addUnique(secondary, { parent: '3. Animals & Creatures', sub: 'Animals & Nature' });
    confidence = Math.max(confidence, 0.86); sources.push('creature_rule');
  }

  if (description && /(wear|clothing|garment|outfit|dress|shirt|uniform)/.test(d)) {
    addUnique(secondary, { parent: '6. Wardrobe & Outfit', sub: 'Attire' });
    confidence = Math.max(confidence, 0.86); sources.push('description_rule');
  }
  if (description && /(camera|photograph|composition|perspective|lighting|focus|lens|depth of field)/.test(d)) {
    addUnique(secondary, { parent: '10. Camera & Composition', sub: 'Image Composition' });
    confidence = Math.max(confidence, 0.88); sources.push('description_rule');
  }

  // Avoid reporting the primary classification as a secondary classification.
  const filtered = secondary.filter(x => x.parent !== primary.parent || x.sub !== primary.sub);
  return { primary, secondary: filtered, confidence: Math.min(1, confidence), sources: [...new Set(sources)] };
}
