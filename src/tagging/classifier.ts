import { CategoryPath, DANBOORU_WIKI_GROUPS, PROMPT_FLOW_MAPPING, classifyPromptFlowTag, getManualOverride, normalizeTag } from '../api/tagTaxonomy';

export interface ClassificationResult {
  primary: CategoryPath;
  secondary: CategoryPath[];
  confidence: number;
  sources: string[];
}

type Rule = {
  path: CategoryPath;
  terms: string[];
  confidence: number;
  source: string;
  exclude?: RegExp;
};

const rules: Rule[] = [
  // Subject / people / count
  { path:{parent:'1. Subject & Count',sub:'Character Count',subSub:'Count Tags'}, terms:['solo','duo','trio','quartet','group','multiple_girls','multiple_boys','1girl','2girls','3girls','4girls','5girls','6girls','7girls','8girls','9girls','10girls','1boy','2boys','3boys','4boys','5boys','6boys','7boys','8boys','9boys','10boys'], confidence:.98, source:'count_rule' },
  { path:{parent:'1. Subject & Count',sub:'People',subSub:'Gender & Identity'}, terms:['girl','boy','woman','man','male','female','femboy','nonbinary','genderfluid','androgynous','transgender'], confidence:.95, source:'people_rule' },
  { path:{parent:'1. Subject & Count',sub:'People',subSub:'Person Types'}, terms:['chibi','loli','shota','child','adult','elderly','teenager','young'], confidence:.92, source:'people_rule' },
  { path:{parent:'1. Subject & Count',sub:'Jobs',subSub:'Occupations'}, terms:['maid','teacher','student','doctor','nurse','chef','cook','police','detective','soldier','knight','samurai','ninja','pilot','mechanic','artist','singer','idol','waitress','waiter','barista'], confidence:.93, source:'occupation_rule' },

  // Face / hair takes precedence over animal-name substrings (cat_ears, bat_earrings, etc.).
  { path:{parent:'4. Face & Hair',sub:'Ears Tags',subSub:'Animal Ears'}, terms:['ears','ear','cat_ears','fox_ears','dog_ears','wolf_ears','rabbit_ears','bat_ears','mouse_ears','bear_ears','bunny_ears'], confidence:.99, source:'ear_rule' },
  { path:{parent:'4. Face & Hair',sub:'Eyes Tags',subSub:'Eye Shape & Detail'}, terms:['eyes','eye','pupil','iris','sclera','eyelashes','eyebrows','eyepatch','wink','closed_eyes','open_eyes','heterochromia'], confidence:.99, source:'eye_rule' },
  { path:{parent:'4. Face & Hair',sub:'Hair Styles',subSub:'Hair Shape'}, terms:['hair','bangs','ponytail','braid','braided','twintail','twintails','ahoge','bob_cut','bun','pigtails','hair_over_one_eye','side_ponytail','drill_hair'], confidence:.98, source:'hair_rule' },
  { path:{parent:'4. Face & Hair',sub:'Hair Color',subSub:'Color Variants'}, terms:['black_hair','brown_hair','blonde_hair','blue_hair','green_hair','pink_hair','purple_hair','red_hair','white_hair','silver_hair','grey_hair','gray_hair','multicolored_hair'], confidence:.98, source:'hair_color_rule' },
  { path:{parent:'4. Face & Hair',sub:'Face Tags',subSub:'Expression'}, terms:['smile','grin','smirk','pout','frown','expressionless','mouth','lips','teeth','fang','fangs','tongue','blush','freckles','mole','tears','saliva'], confidence:.95, source:'face_rule' },
  { path:{parent:'4. Face & Hair',sub:'Makeup',subSub:'Cosmetics'}, terms:['makeup','lipstick','eyeliner','eyeshadow','mascara','nail_polish','nail_art'], confidence:.96, source:'makeup_rule' },

  // Body / anatomy
  { path:{parent:'5. Body & Physiology',sub:'Breasts Tags',subSub:'Breast Shape & Detail'}, terms:['breast','breasts','cleavage','nipple','nipples','underboob','sideboob','midriff'], confidence:.98, source:'breast_rule' },
  { path:{parent:'5. Body & Physiology',sub:'Hands',subSub:'Hand Detail'}, terms:['hand','hands','finger','fingers','fingernails','nail'], confidence:.97, source:'hands_rule' },
  { path:{parent:'5. Body & Physiology',sub:'Feet',subSub:'Foot Detail'}, terms:['foot','feet','toe','toes','toenails','barefoot'], confidence:.97, source:'feet_rule' },
  { path:{parent:'5. Body & Physiology',sub:'Body Parts',subSub:'Torso & Limbs'}, terms:['arm','arms','elbow','leg','legs','thigh','thighs','knee','knees','navel','belly','stomach','waist','hips','hip','back','collarbone','shoulder','shoulders','neck','torso','armpits'], confidence:.96, source:'body_rule' },
  { path:{parent:'5. Body & Physiology',sub:'Wings',subSub:'Wing Types'}, terms:['wing','wings','dragon_wings','angel_wings','bat_wings','fairy_wings'], confidence:.98, source:'wing_rule' },
  { path:{parent:'5. Body & Physiology',sub:'Covering',subSub:'Body Coverings'}, terms:['tail','tails','scales','fur','feathers','feathered','tentacles','horn','horns','antlers','claws','paws'], confidence:.92, source:'body_covering_rule' },
  { path:{parent:'5. Body & Physiology',sub:'Skin Color',subSub:'Skin & Complexion'}, terms:['dark_skin','dark_skinned','light_skin','pale_skin','tan','tanned','freckles','vitiligo'], confidence:.92, source:'skin_rule' },

  // Clothing / accessories must beat animal classification.
  { path:{parent:'6. Wardrobe & Outfit',sub:'Attire',subSub:'Garments'}, terms:['shirt','blouse','top','t_shirt','crop_top','sweater','hoodie','skirt','pants','shorts','jeans','dress','robe','kimono','yukata','jacket','coat','cape','cloak','uniform','costume','onesie','apron','bodysuit','leotard','swimsuit','bikini','lingerie','underwear','school_uniform','maid_outfit'], confidence:.99, source:'clothing_rule' },
  { path:{parent:'6. Wardrobe & Outfit',sub:'Headwear',subSub:'Hats & Headpieces'}, terms:['hat','cap','beret','beanie','helmet','tiara','crown','headband','veil','hood','witch_hat','baseball_cap'], confidence:.98, source:'headwear_rule' },
  { path:{parent:'6. Wardrobe & Outfit',sub:'Eyewear',subSub:'Glasses & Masks'}, terms:['glasses','sunglasses','eyepatch','goggles','mask','visor'], confidence:.98, source:'eyewear_rule' },
  { path:{parent:'6. Wardrobe & Outfit',sub:'Handwear',subSub:'Gloves'}, terms:['glove','gloves','mittens','gauntlets'], confidence:.98, source:'handwear_rule' },
  { path:{parent:'6. Wardrobe & Outfit',sub:'Legwear',subSub:'Socks & Hosiery'}, terms:['socks','thighhighs','thigh_highs','pantyhose','stockings','garter','garters'], confidence:.98, source:'legwear_rule' },
  { path:{parent:'6. Wardrobe & Outfit',sub:'Neck And Neckwear',subSub:'Collars & Ties'}, terms:['tie','necktie','bowtie','choker','collar','scarf','necklace'], confidence:.96, source:'neckwear_rule' },
  { path:{parent:'6. Wardrobe & Outfit',sub:'Accessories',subSub:'Jewelry & Accessories'}, terms:['jewelry','earrings','earring','bracelet','bracelets','ring','rings','belt','ribbon','bow','hairband','hairclip','brooch','pendant','piercing'], confidence:.99, source:'accessory_rule' },
  { path:{parent:'6. Wardrobe & Outfit',sub:'Prints',subSub:'Patterns & Motifs'}, terms:['print','prints','pattern','patterns','polka_dot','striped','stripes','plaid','checkered','floral_print'], confidence:.93, source:'print_rule' },
  { path:{parent:'6. Wardrobe & Outfit',sub:'Fashion Style',subSub:'Style & Aesthetic Clothing'}, terms:['gothic','lolita_fashion','punk','streetwear','casual_wear','formal','suit','business_suit','traditional_clothing'], confidence:.89, source:'fashion_rule' },

  // Actions / pose
  { path:{parent:'7. Pose & Action',sub:'Posture',subSub:'Body Position'}, terms:['standing','sitting','lying','kneeling','squatting','leaning','floating','flying','falling','jumping','walking','running','crouching','on_all_fours'], confidence:.98, source:'posture_rule' },
  { path:{parent:'7. Pose & Action',sub:'Gestures',subSub:'Gestures & Interaction'}, terms:['pointing','reaching','touching','grabbing','waving','peace','salute','arms_up','hands_up','crossed_arms','thumbs_up'], confidence:.96, source:'gesture_rule' },
  { path:{parent:'7. Pose & Action',sub:'Holding Tags',subSub:'Held Objects'}, terms:['holding','holding_sword','holding_gun','holding_weapon','holding_food','holding_phone','holding_book','carrying'], confidence:.95, source:'holding_rule' },
  { path:{parent:'7. Pose & Action',sub:'Verbs And Gerunds',subSub:'Everyday Actions'}, terms:['eating','drinking','reading','writing','cooking','sleeping','fighting','swimming','dancing','singing','talking','laughing','crying','looking_at_viewer'], confidence:.94, source:'action_rule' },
  { path:{parent:'7. Pose & Action',sub:'Sports',subSub:'Sport Activities'}, terms:['soccer','football','basketball','tennis','baseball','volleyball','golf','skateboarding','surfing','cycling','running'], confidence:.93, source:'sport_rule' },

  // Props
  { path:{parent:'8. Props & Weapons',sub:'Technology',subSub:'Devices & Machines'}, terms:['phone','smartphone','cellphone','camera','computer','laptop','tablet','keyboard','monitor','robot','mecha','machine','console','controller','headphones'], confidence:.95, source:'technology_rule' },
  { path:{parent:'8. Props & Weapons',sub:'Audio Tags',subSub:'Instruments & Audio'}, terms:['guitar','bass_guitar','piano','violin','drum','microphone','speaker','headphones','music','instrument'], confidence:.95, source:'audio_rule' },
  { path:{parent:'8. Props & Weapons',sub:'Food Tags',subSub:'Food & Drink'}, terms:['food','cake','candy','coffee','tea','fruit','meal','bread','rice','pizza','hamburger','ice_cream','dessert','alcohol','beer','wine','cocktail'], confidence:.95, source:'food_rule' },
  { path:{parent:'8. Props & Weapons',sub:'Cards',subSub:'Card Games'}, terms:['card','cards','playing_card','tarot','poker'], confidence:.94, source:'card_rule' },
  { path:{parent:'8. Props & Weapons',sub:'Board Games',subSub:'Games & Toys'}, terms:['board_game','chess','mahjong','dice','game_board','toy','plush'], confidence:.91, source:'game_rule' },
  { path:{parent:'8. Props & Weapons',sub:'Sex Objects',subSub:'Adult Props'}, terms:['dildo','vibrator','sex_toy','condom','lubricant'], confidence:.99, source:'adult_prop_rule' },
  { path:{parent:'8. Props & Weapons',sub:'Weapons',subSub:'Melee & Ranged'}, terms:['sword','katana','blade','knife','dagger','spear','axe','hammer','bow_(weapon)','arrow','gun','pistol','rifle','shotgun','sniper_rifle','cannon','weapon'], confidence:.99, source:'weapon_rule' },

  // Environment
  { path:{parent:'9. Environment & Setting',sub:'Locations',subSub:'Buildings & Rooms'}, terms:['room','indoor','indoors','bedroom','classroom','kitchen','office','cafe','restaurant','school','hospital','street','building','castle','shrine','temple','church','library','train_station'], confidence:.95, source:'location_rule' },
  { path:{parent:'9. Environment & Setting',sub:'Backgrounds',subSub:'Natural Scenery'}, terms:['background','landscape','scenery','sky','cloud','clouds','forest','mountain','beach','garden','meadow','field','desert','snow','snowy'], confidence:.93, source:'scenery_rule' },
  { path:{parent:'9. Environment & Setting',sub:'Water',subSub:'Water Environments'}, terms:['water','ocean','sea','lake','river','pool','waterfall','underwater'], confidence:.97, source:'water_rule' },
  { path:{parent:'9. Environment & Setting',sub:'Fire',subSub:'Fire & Atmospheric Effects'}, terms:['fire','flame','flames','smoke','sparks','embers','explosion'], confidence:.94, source:'fire_rule' },
  { path:{parent:'9. Environment & Setting',sub:'Holidays And Celebrations',subSub:'Events & Holidays'}, terms:['christmas','halloween','valentines','birthday','wedding','festival','new_year','hanami','holiday'], confidence:.93, source:'holiday_rule' },

  // Camera / image language
  { path:{parent:'10. Camera & Composition',sub:'Image Composition',subSub:'Framing & Shot Size'}, terms:['portrait','upper_body','full_body','close_up','cowboy_shot','profile','cropped','framed','multiple_views','split_screen','solo_focus'], confidence:.97, source:'composition_rule' },
  { path:{parent:'10. Camera & Composition',sub:'Focus Tags',subSub:'Depth & Focus'}, terms:['focus','depth_of_field','bokeh','blur','blurry_background','motion_blur','out_of_focus'], confidence:.97, source:'focus_rule' },
  { path:{parent:'10. Camera & Composition',sub:'Lighting',subSub:'Light Sources'}, terms:['lighting','sunlight','moonlight','shadow','shadows','silhouette','glow','rim_lighting','backlighting','lens_flare'], confidence:.96, source:'lighting_rule' },
  { path:{parent:'10. Camera & Composition',sub:'Colors',subSub:'Color Treatment'}, terms:['monochrome','greyscale','grayscale','colorful','multicolored','rainbow','limited_palette','sepia','pastel_colors'], confidence:.96, source:'color_rule' },
  { path:{parent:'10. Camera & Composition',sub:'Patterns',subSub:'Surface Patterns'}, terms:['polka_dot','striped','checkered','plaid','pattern','patterns'], confidence:.93, source:'pattern_rule' },

  // Style / aesthetics
  { path:{parent:'11. Style & Aesthetics',sub:'Visual Aesthetic',subSub:'Quality & Rendering'}, terms:['masterpiece','best_quality','high_quality','absurdres','highres','cinematic','photorealistic','realistic','stylized','detailed','sharp_focus','anime_style'], confidence:.90, source:'style_rule' },
  { path:{parent:'11. Style & Aesthetics',sub:'Visual Aesthetic',subSub:'Genre & Visual Style'}, terms:['retro','cyberpunk','fantasy','surreal','vintage','steampunk','minimalist','dark_fantasy','baroque','gothic_architecture'], confidence:.90, source:'style_rule' },
  { path:{parent:'11. Style & Aesthetics',sub:'Drawing Software',subSub:'Tools & Software'}, terms:['photoshop','clip_studio','paint_tool_sai','procreate','blender','illustrator','krita'], confidence:.98, source:'software_rule' },

  // Themes / text / lore / adult
  { path:{parent:'13. Themes, Lore & Adult',sub:'Text',subSub:'Written Text'}, terms:['text','speech_bubble','thought_bubble','subtitle','watermark','logo','signature'], confidence:.97, source:'text_rule' },
  { path:{parent:'13. Themes, Lore & Adult',sub:'Symbols',subSub:'Icons & Symbols'}, terms:['symbol','symbols','heart','star','cross','crescent','emblem'], confidence:.91, source:'symbol_rule' },
  { path:{parent:'13. Themes, Lore & Adult',sub:'History',subSub:'Historical Themes'}, terms:['historical','history','ancient','medieval','samurai','viking','roman','egyptian'], confidence:.87, source:'history_rule' },
  { path:{parent:'13. Themes, Lore & Adult',sub:'Sex Acts',subSub:'Sexual Activity'}, terms:['sex','sexual','penetration','masturbation','oral','intercourse','handjob','blowjob'], confidence:.99, source:'adult_rule' },
  { path:{parent:'13. Themes, Lore & Adult',sub:'Sexual Positions',subSub:'Positions'}, terms:['missionary','cowgirl_position','doggystyle','spooning','standing_sex'], confidence:.99, source:'adult_rule' },
  { path:{parent:'13. Themes, Lore & Adult',sub:'BDSM And Torture',subSub:'BDSM & Restraint'}, terms:['bondage','bdsm','ropes','shibari','gag','blindfold','handcuffs','restraints'], confidence:.98, source:'adult_rule' },
  { path:{parent:'13. Themes, Lore & Adult',sub:'Theme',subSub:'Narrative Themes'}, terms:['friendship','romance','love','school_life','slice_of_life','adventure','fantasy_theme','horror','comedy','tragedy'], confidence:.84, source:'theme_rule' },
];

const PURE_ANIMAL_RULES: Rule[] = [
  { path:{parent:'3. Animals & Creatures',sub:'Felines & Big Cats',subSub:'Cats'}, terms:['cat','kitten','lion','tiger','leopard','cheetah','panther','jaguar','lynx','cougar'], confidence:.99, source:'animal_rule' },
  { path:{parent:'3. Animals & Creatures',sub:'Canines, Wolves & Foxes',subSub:'Dogs & Foxes'}, terms:['dog','puppy','hound','canine','wolf','fox','coyote','jackal','dingo','hyena'], confidence:.99, source:'animal_rule' },
  { path:{parent:'3. Animals & Creatures',sub:'Equines & Farm Mammals',subSub:'Hoofed Mammals'}, terms:['horse','stallion','mare','foal','pony','donkey','mule','zebra','cow','bull','calf','sheep','goat','pig','deer','elk','moose','camel','llama','alpaca'], confidence:.98, source:'animal_rule' },
  { path:{parent:'3. Animals & Creatures',sub:'Rodents & Small Mammals',subSub:'Small Mammals'}, terms:['rabbit','bunny','hare','mouse','rat','hamster','guinea_pig','gerbil','squirrel','chipmunk','ferret','weasel','otter','badger','raccoon','tanuki','hedgehog','bat'], confidence:.99, source:'animal_rule' },
  { path:{parent:'3. Animals & Creatures',sub:'Bears & Wild Mammals',subSub:'Large Mammals'}, terms:['bear','polar_bear','grizzly','panda','red_panda','elephant','rhino','hippo','giraffe','monkey','ape','gorilla','chimpanzee','lemur','kangaroo','koala'], confidence:.98, source:'animal_rule' },
  { path:{parent:'3. Animals & Creatures',sub:'Birds & Winged Animals',subSub:'Birds'}, terms:['bird','avian','chick','chicken','rooster','hen','duck','goose','swan','crow','raven','pigeon','dove','sparrow','owl','eagle','hawk','falcon','penguin','flamingo','parrot'], confidence:.98, source:'animal_rule' },
  { path:{parent:'3. Animals & Creatures',sub:'Aquatic & Marine Life',subSub:'Marine Animals'}, terms:['fish','shark','whale','dolphin','orca','seal','walrus','octopus','squid','jellyfish','crab','lobster','shrimp','eel','manta_ray','stingray','starfish','seahorse'], confidence:.98, source:'animal_rule' },
  { path:{parent:'3. Animals & Creatures',sub:'Reptiles & Amphibians',subSub:'Reptiles & Amphibians'}, terms:['snake','serpent','python','viper','cobra','lizard','gecko','chameleon','iguana','turtle','tortoise','crocodile','alligator','frog','toad','salamander','axolotl','newt','dinosaur'], confidence:.98, source:'animal_rule' },
  { path:{parent:'3. Animals & Creatures',sub:'Insects & Arthropods',subSub:'Insects & Arthropods'}, terms:['insect','bug','butterfly','moth','caterpillar','bee','wasp','hornet','ant','beetle','ladybug','dragonfly','grasshopper','cricket','mantis','spider','scorpion','centipede','snail','slug','worm'], confidence:.98, source:'animal_rule' },
  { path:{parent:'3. Animals & Creatures',sub:'Mythical Beasts & Dragons',subSub:'Mythical Creatures'}, terms:['dragon','wyvern','drake','hydra','phoenix','griffin','gryphon','hippogriff','pegasus','unicorn','cerberus','chimera','basilisk','kraken','leviathan','behemoth','fenrir','gargoyle'], confidence:.98, source:'animal_rule' },
  { path:{parent:'3. Animals & Creatures',sub:'Monsters & Fantasy Entities',subSub:'Fantasy Creatures'}, terms:['monster','creature','demon','devil','ghost','spirit','undead','zombie','skeleton','vampire','werewolf','slime','golem','goblin','orc','troll','ogre','mimic','youkai','oni','tengu','kappa','harpy','centaur','lamia','mermaid','merman','succubus','incubus','elemental'], confidence:.93, source:'fantasy_creature_rule' },
];

function tokenMatch(tag:string, term:string){
  const t=normalizeTag(tag);
  const q=normalizeTag(term);
  if(t===q) return true;
  const parts=t.split('_');
  return parts.includes(q);
}

function ruleMatches(tag:string, rule:Rule){
  if(rule.exclude && rule.exclude.test(normalizeTag(tag))) return false;
  return rule.terms.some(term=>tokenMatch(tag,term));
}

function addUnique(out:CategoryPath[], path:CategoryPath){
  if(!out.some(x=>x.parent===path.parent&&x.sub===path.sub&&x.subSub===path.subSub)) out.push(path);
}

function wikiToPromptPath(wiki:string|null):CategoryPath|null{
  if(!wiki) return null;
  const normalized=wiki.trim().toLowerCase().replace(/\s+/g,'_');
  for(const [parent,subs] of Object.entries(PROMPT_FLOW_MAPPING)){
    for(const sub of subs){
      if(normalizeTag(sub)===normalized) return {parent,sub};
    }
  }
  // Broader wiki groups that should map to semantic UI areas even when the
  // exact Danbooru wiki subgroup is not part of our visible taxonomy.
  if(/clothing|attire|fashion|headwear|eyewear|handwear|legwear|neckwear|accessor|garment/.test(normalized)) return {parent:'6. Wardrobe & Outfit',sub:'Attire'};
  if(/animal|mammal|bird|fish|reptile|amphibian|insect|arthropod|creature/.test(normalized)) return {parent:'3. Animals & Creatures',sub:'Animals & Nature'};
  if(/anatom|body|breast|hand|foot|wing|skin/.test(normalized)) return {parent:'5. Body & Physiology',sub:'Body Parts'};
  if(/hair|eye|face|makeup/.test(normalized)) return {parent:'4. Face & Hair',sub:'Face Tags'};
  if(/pose|action|gesture|dance|sport/.test(normalized)) return {parent:'7. Pose & Action',sub:'Verbs And Gerunds'};
  if(/weapon|technology|audio|food|card|game|object/.test(normalized)) return {parent:'8. Props & Weapons',sub:'Technology'};
  if(/location|background|scenery|water|fire|holiday/.test(normalized)) return {parent:'9. Environment & Setting',sub:'Locations'};
  if(/composition|focus|lighting|color|pattern/.test(normalized)) return {parent:'10. Camera & Composition',sub:'Image Composition'};
  if(/style|aesthetic|software|fine_art|parody/.test(normalized)) return {parent:'11. Style & Aesthetics',sub:'Visual Aesthetic'};
  if(/sex|erotic|nudity|censor|bdsm/.test(normalized)) return {parent:'13. Themes, Lore & Adult',sub:'Sex Acts'};
  if(/text|symbol|phrase|dialect|year|history|theme|subjective|company|brand/.test(normalized)) return {parent:'13. Themes, Lore & Adult',sub:'Theme'};
  return null;
}

function wikiGroupPath(wiki:string|null):CategoryPath|null{
  if(!wiki) return null;
  const n=normalizeTag(wiki);
  for(const [group,subs] of Object.entries(DANBOORU_WIKI_GROUPS)){
    if(subs.some(s=>normalizeTag(s)===n)) return {parent:group,sub:wiki};
  }
  return null;
}

function descriptionEvidence(description:string|null):Rule|null{
  if(!description) return null;
  const d=normalizeTag(description);
  if(/clothing|garment|attire|dress|shirt|accessory|earring|costume/.test(d)) return {path:{parent:'6. Wardrobe & Outfit',sub:'Attire',subSub:'Description Match'},terms:[],confidence:.86,source:'description_clothing'};
  if(/animal|mammal|bird|reptile|insect|fish|species/.test(d)) return {path:{parent:'3. Animals & Creatures',sub:'Animals & Nature',subSub:'Description Match'},terms:[],confidence:.84,source:'description_animal'};
  if(/face|eye|hair|ear|mouth/.test(d)) return {path:{parent:'4. Face & Hair',sub:'Face Tags',subSub:'Description Match'},terms:[],confidence:.86,source:'description_face'};
  if(/body|anatom|hand|foot|wing|skin/.test(d)) return {path:{parent:'5. Body & Physiology',sub:'Body Parts',subSub:'Description Match'},terms:[],confidence:.86,source:'description_body'};
  if(/camera|photograph|composition|perspective|lens|focus|lighting/.test(d)) return {path:{parent:'10. Camera & Composition',sub:'Image Composition',subSub:'Description Match'},terms:[],confidence:.86,source:'description_camera'};
  if(/pose|gesture|action|movement/.test(d)) return {path:{parent:'7. Pose & Action',sub:'Verbs And Gerunds',subSub:'Description Match'},terms:[],confidence:.84,source:'description_action'};
  return null;
}

/**
 * Semantic classifier with explicit precedence. Generic animal-name matches
 * are deliberately evaluated last so tags such as `bat_costume` and
 * `bat_earrings` can never fall into Animals & Creatures merely because they
 * contain the token `bat`.
 */
export function classifyTagDetailed(
  tag:string,
  nativeCategory:string,
  nativeCode:string,
  wikiCategory:string|null,
  postCount:number|null,
  description:string|null,
):ClassificationResult{
  const manual=getManualOverride(tag);
  if(manual) return {primary:manual,secondary:[],confidence:1,sources:['manual_override']};

  // Native Danbooru types are immutable source metadata and should stay the
  // primary UI destination for artist/character/copyright tags.
  if(nativeCategory==='Artist') return {primary:{parent:'12. Artists',sub:`${(tag[0]||'#').toUpperCase()}–Tags`},secondary:[],confidence:.999,sources:['native_category']};
  if(nativeCategory==='Copyright') return {primary:{parent:'2. Characters & Series',sub:'Series'},secondary:[],confidence:.999,sources:['native_category']};
  if(nativeCategory==='Character') return {primary:{parent:'2. Characters & Series',sub:'Characters'},secondary:[],confidence:.999,sources:['native_category']};

  const secondary:CategoryPath[]=[];
  const sources:string[]=[];
  let confidence=.55;

  // First pass: explicit semantic rules. This is the main fix for misleading
  // classifications and keeps general concepts as a true last resort.
  const matchedRules:Rule[]=[];
  for(const rule of rules) if(ruleMatches(tag,rule)) matchedRules.push(rule);

  // Clothing/accessory/face/body rules outrank animal names.
  for(const rule of matchedRules){
    if(['6. Wardrobe & Outfit','4. Face & Hair','5. Body & Physiology','7. Pose & Action','8. Props & Weapons','10. Camera & Composition'].includes(rule.path.parent)){
      const primary=rule.path;
      for(const r of matchedRules) if(r!==rule) addUnique(secondary,r.path);
      return {primary,secondary,confidence:rule.confidence,sources:[rule.source,...matchedRules.filter(r=>r!==rule).map(r=>r.source).slice(0,4)]};
    }
  }

  // Native Meta tags should not be mixed into popularity-based general tags.
  if(nativeCategory==='Meta'){
    const wikiPath=wikiToPromptPath(wikiCategory);
    if(wikiPath) return {primary:wikiPath,secondary:[],confidence:.94,sources:['native_meta','wiki_category']};
    return {primary:{parent:'13. Themes, Lore & Adult',sub:'Metatags',subSub:'Danbooru Meta'},secondary:[],confidence:.97,sources:['native_category']};
  }

  const wikiPath=wikiToPromptPath(wikiCategory);
  if(wikiPath){
    for(const rule of matchedRules) addUnique(secondary,rule.path);
    return {primary:wikiPath,secondary,confidence:.93,sources:['wiki_category',...matchedRules.map(r=>r.source).slice(0,3)]};
  }

  const descRule=descriptionEvidence(description);
  if(descRule){
    for(const rule of matchedRules) addUnique(secondary,rule.path);
    return {primary:descRule.path,secondary,confidence:descRule.confidence,sources:[descRule.source,...matchedRules.map(r=>r.source).slice(0,3)]};
  }

  // Only now consider pure animal names. Compound tags with clothing,
  // jewelry, anatomy, props, or character-role tokens are excluded.
  const animalBlock=/(costume|clothing|outfit|garment|attire|earring|earrings|jewelry|necklace|bracelet|ring|accessor|mask|hat|hood|plush|toy|print|pattern|skin|hair|eye|eyes|ear|ears|tail|wing|wings|girl|boy|woman|man|person|mask|onesie|suit)/;
  for(const rule of PURE_ANIMAL_RULES){
    if(ruleMatches(tag,rule)&&!animalBlock.test(normalizeTag(tag))){
      for(const r of matchedRules) addUnique(secondary,r.path);
      return {primary:rule.path,secondary,confidence:rule.confidence,sources:['animal_rule',...matchedRules.map(r=>r.source).slice(0,3)]};
    }
  }

  if(matchedRules.length){
    const primary=matchedRules[0].path;
    for(const r of matchedRules.slice(1)) addUnique(secondary,r.path);
    return {primary,secondary,confidence:matchedRules[0].confidence,sources:matchedRules.map(r=>r.source)};
  }

  // Keep popularity completely out of semantic classification. It may be used
  // for sorting, but a 50k-post tag is not inherently a "general concept".
  const fallback=classifyPromptFlowTag(tag,nativeCategory,nativeCode,wikiCategory,null);
  const safeFallback = /^General Concepts/.test(fallback.sub)
    ? {parent:'13. Themes, Lore & Adult',sub:'General Concepts (Other)',subSub:'Needs Review'}
    : fallback;
  confidence=.40;
  sources.push('fallback_review');
  if(wikiCategory) sources.push('wiki_unmapped');
  return {primary:safeFallback,secondary,confidence,sources};
}
