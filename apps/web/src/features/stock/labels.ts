import { msg } from '@lingui/core/macro';

/** Counting units. The key is what the database stores. */
export const UNIT_LABELS = {
	carton: msg`盒`,
	slab: msg`板`,
	bag: msg`包`,
	roll: msg`卷`,
	bottle: msg`瓶`,
	ream: msg`令`,
	can: msg`罐`,
	piece: msg`個`,
} as const;

/** Shelves a good can sit on. */
export const SHELF_LABELS = {
	fridge: msg`冰箱`,
	tearoom: msg`茶水間層架`,
	washroom: msg`洗手間`,
	sink: msg`水槽`,
	cupboard: msg`廚櫃`,
	printroom: msg`影印區`,
} as const;

/** What kind of good this is. */
export const CATEGORY_LABELS = {
	snack: msg`零食`,
	coffee: msg`咖啡`,
	tissue: msg`紙巾`,
	dairy: msg`奶類`,
	fresh: msg`生鮮`,
	paper: msg`紙`,
	seasoning: msg`調味`,
	supply: msg`日用`,
	drink: msg`飲料`,
	staple: msg`主食`,
	fruit: msg`水果`,
	frozen: msg`冷凍`,
	care: msg`洗護`,
} as const;
