import { useSyncExternalStore } from 'react';

export type AppLocale = 'zh-Hant' | 'en';

const KEY = 'goods-locale';

let locale: AppLocale = 'zh-Hant';
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

async function storage() {
	const module = await import('@react-native-async-storage/async-storage');
	return module.default;
}

/** The language the phone is showing. */
export function getLocale(): AppLocale {
	return locale;
}

/** Switches the phone between Traditional Chinese and English and remembers it. */
export function setLocale(next: AppLocale) {
	locale = next;
	emit();
	void storage().then((store) => store.setItem(KEY, next));
}

/** Reads the saved language once, before the first screen. */
export async function loadLocale() {
	const stored = await (await storage()).getItem(KEY);
	if (stored === 'en' || stored === 'zh-Hant') setLocale(stored);
}

/** The active language. */
export function useLocale(): AppLocale {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getLocale,
		getLocale,
	);
}

const zh = {
	goods: '物資',
	board: '看板',
	shelf: '貨架',
	purchases: '採購',
	signIn: '登入',
	signUp: '建立帳戶',
	signOut: '登出',
	signInFailed: '登入失敗，請再試一次。',
	noAccount: '還沒有帳戶？建立一個',
	haveAccount: '已有帳戶？登入',
	name: '名稱',
	email: '電郵',
	password: '密碼',
	attention: '要處理',
	noGoods: '還沒有物資。',
	noMatch: '沒有符合的物資。',
	loading: '正在讀貨架。',
	noShelf: '還沒有貨架。',
	take: '領用',
	remove: '拿掉',
	cancel: '取消',
	search: '搜尋物資',
	addGoods: '增加新物資',
	collapse: '收合',
	kind: '種類',
	unit: '規格',
	quantity: '數量',
	safety: '安全警戒',
	expires: '到期',
	place: '貨架位置',
	put: '放上貨架',
	putting: '放上貨架…',
	needName: '請填名稱。',
	badCount: '數量和安全警戒都要是 0 到 999 的整數。',
	badDate: '到期要是真實日期，或留空。',
	expiring: '即將過期',
	short: '不夠了',
	recent: '最近的領用',
	noTakes: '還沒有人領用。較早的離線領用會留下，較晚的那一筆會被拒絕。',
	noExpiring: '三天內沒有要到期的物資。',
	noShort: '沒有低於安全庫存的物資。',
	buyThese: '一鍵採購',
	close: '關閉',
	samples: '樣',
	took: '領走',
	putBack: '補上',
	missed: '沒扣成',
	queuedTake: '沒有連上，已放進離線佇列。',
	marketTakes: '超市模式：領用會先留在手機上。',
	supermarket: '超市模式',
	openTotal: '未採購合計',
	underSafety: '低於安全警戒',
	noneUnder: '沒有低於安全警戒的物資。',
	listed: '已在清單',
	restock: '補',
	total: '總計 HK$',
	creating: '建立中…',
	createRecords: '建立採購記錄',
	records: '採購記錄',
	emptyList: '清單是空的。',
	bought: '已採購',
	boughtDone: '已採購。',
	created: '已建立採購記錄。',
	offlineBuy: '已勾在離線清單。',
	badBuy: '補貨數量要是 1 到 99 的整數。',
	badDraft: '補貨數量要是 0 到 99 的整數。',
	needTotal: '請填這次採購的總計。',
	needOne: '至少補一樣。',
	merged: '已合併。',
	cannotSend: '這些離線採購還不能送到貨架。',
	insufficient: '當時已經沒有這麼多了。',
	cycle: '這幾筆領用互相依賴，沒有套用。',
	purchaseInvalid: '這筆採購的格式不對。',
	notFound: '找不到這一筆。',
	failed: '操作失敗，請再試一次。',
	badData: '這筆資料不對，請再看一次。',
	signInFirst: '請先登入。',
	takenDone: '已領用。',
	language: 'English',
} as const;

const en: Record<keyof typeof zh, string> = {
	goods: 'Goods',
	board: 'Board',
	shelf: 'Shelf',
	purchases: 'Purchases',
	signIn: 'Sign in',
	signUp: 'Create account',
	signOut: 'Sign out',
	signInFailed: 'Sign-in failed. Try again.',
	noAccount: 'No account yet? Create one',
	haveAccount: 'Already have an account? Sign in',
	name: 'Name',
	email: 'Email',
	password: 'Password',
	attention: 'Need attention',
	noGoods: 'No goods yet.',
	noMatch: 'No matching goods.',
	loading: 'Loading the shelf.',
	noShelf: 'No shelf yet.',
	take: 'Take',
	remove: 'Remove',
	cancel: 'Cancel',
	search: 'Search goods',
	addGoods: 'Add a good',
	collapse: 'Close',
	kind: 'Kind',
	unit: 'Unit',
	quantity: 'Quantity',
	safety: 'Safety line',
	expires: 'Expiry',
	place: 'Place',
	put: 'Put on shelf',
	putting: 'Putting on shelf…',
	needName: 'Enter a name.',
	badCount: 'Quantity and the safety line must be whole numbers from 0 to 999.',
	badDate: 'Expiry must be a real date, or left blank.',
	expiring: 'Expiring soon',
	short: 'Running short',
	recent: 'Recent takes',
	noTakes:
		'Nobody has taken anything yet. An earlier offline take stays, and the later one is refused.',
	noExpiring: 'Nothing expires in the next three days.',
	noShort: 'Nothing is under its safety line.',
	buyThese: 'Buy these',
	close: 'Close',
	samples: 'goods',
	took: 'Taken',
	putBack: 'Put back',
	missed: 'Not applied',
	queuedTake: 'Offline. Saved on this phone.',
	marketTakes: 'Supermarket mode keeps takes on this phone.',
	supermarket: 'Supermarket mode',
	openTotal: 'Open total',
	underSafety: 'Under the safety line',
	noneUnder: 'Nothing is under the safety line.',
	listed: 'Already on the list',
	restock: 'Buy',
	total: 'Total HK$',
	creating: 'Creating…',
	createRecords: 'Create purchase records',
	records: 'Purchase records',
	emptyList: 'The list is empty.',
	bought: 'Bought',
	boughtDone: 'Bought.',
	created: 'Purchase record created.',
	offlineBuy: 'Checked off on this phone.',
	badBuy: 'Enter a whole number from 1 to 99.',
	badDraft: 'Enter a whole number from 0 to 99.',
	needTotal: 'Enter the total for this trip.',
	needOne: 'Buy at least one.',
	merged: 'Merged.',
	cannotSend: 'These offline purchases cannot be sent yet.',
	insufficient: 'There was not enough on the shelf then.',
	cycle: 'These takes depend on each other, so none were applied.',
	purchaseInvalid: 'This purchase is not in the right shape.',
	notFound: 'That line is gone.',
	failed: 'That did not work. Try again.',
	badData: 'Check this and try again.',
	signInFirst: 'Sign in first.',
	takenDone: 'Taken.',
	language: '繁體中文',
};

export type CopyKey = keyof typeof zh;

/** One phrase in the active language. */
export function t(key: CopyKey, language: AppLocale = locale): string {
	return language === 'en' ? en[key] : zh[key];
}

/** How many operations are still on the phone. */
export function queueHint(count: number, language: AppLocale = locale): string {
	return language === 'en'
		? `${count} queued. Merge them on Purchases.`
		: `離線佇列 ${count} 筆。到採購頁合併。`;
}

/** The merge button. */
export function mergeLabel(count: number, language: AppLocale = locale): string {
	return language === 'en' ? `Merge ${count}` : `合併 ${count} 筆`;
}

/** After a merge that left something behind. */
export function mergedLeft(count: number, language: AppLocale = locale): string {
	return language === 'en'
		? `Merged. ${count} still on this phone.`
		: `已合併。還有 ${count} 筆留在手機上。`;
}

/** Confirm removing one good. */
export function removeAsk(name: string, language: AppLocale = locale): string {
	return language === 'en' ? `Remove ${name}?` : `拿掉 ${name}？`;
}
