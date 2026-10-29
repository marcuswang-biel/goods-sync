/** Counting units. The key is what the database stores. */
export const UNIT_LABELS = {
	carton: '盒',
	slab: '板',
	bag: '包',
	roll: '卷',
	bottle: '瓶',
	ream: '令',
	can: '罐',
	piece: '個',
} as const;

/** Shelves a good can sit on. */
export const SHELF_LABELS = {
	fridge: '冰箱',
	tearoom: '茶水間層架',
	washroom: '洗手間',
	sink: '水槽',
	cupboard: '廚櫃',
	printroom: '影印區',
} as const;

/** What kind of good this is. */
export const CATEGORY_LABELS = {
	snack: '零食',
	coffee: '咖啡',
	tissue: '紙巾',
	dairy: '奶類',
	fresh: '生鮮',
	paper: '紙',
	seasoning: '調味',
	supply: '日用',
	drink: '飲料',
	staple: '主食',
	fruit: '水果',
	frozen: '冷凍',
	care: '洗護',
} as const;

export const categoryCodes = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[];
export const unitCodes = Object.keys(UNIT_LABELS) as (keyof typeof UNIT_LABELS)[];
export const shelfCodes = Object.keys(SHELF_LABELS) as (keyof typeof SHELF_LABELS)[];

const UNIT_EN = {
	carton: 'Carton',
	slab: 'Slab',
	bag: 'Bag',
	roll: 'Roll',
	bottle: 'Bottle',
	ream: 'Ream',
	can: 'Can',
	piece: 'Piece',
} as const;

const SHELF_EN = {
	fridge: 'Fridge',
	tearoom: 'Tearoom shelf',
	washroom: 'Washroom',
	sink: 'Sink',
	cupboard: 'Cupboard',
	printroom: 'Print room',
} as const;

const CATEGORY_EN = {
	snack: 'Snacks',
	coffee: 'Coffee',
	tissue: 'Tissue',
	dairy: 'Dairy',
	fresh: 'Fresh',
	paper: 'Paper',
	seasoning: 'Seasoning',
	supply: 'Supplies',
	drink: 'Drink',
	staple: 'Staple',
	fruit: 'Fruit',
	frozen: 'Frozen',
	care: 'Care',
} as const;

/** A unit label in the active language. */
export function unitLabel(code: keyof typeof UNIT_LABELS, language: 'zh-Hant' | 'en'): string {
	return language === 'en' ? UNIT_EN[code] : UNIT_LABELS[code];
}

/** A shelf-place label in the active language. */
export function shelfLabel(code: keyof typeof SHELF_LABELS, language: 'zh-Hant' | 'en'): string {
	return language === 'en' ? SHELF_EN[code] : SHELF_LABELS[code];
}

/** A category label in the active language. */
export function categoryLabel(
	code: keyof typeof CATEGORY_LABELS,
	language: 'zh-Hant' | 'en',
): string {
	return language === 'en' ? CATEGORY_EN[code] : CATEGORY_LABELS[code];
}
