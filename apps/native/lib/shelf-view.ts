import { isRealIsoDate } from '@goods/domain/stock';

import { t, type AppLocale } from './copy';
import { SHELF_LABELS } from './labels';

/** UTC calendar day, matching the dates the board query expects. */
export function todayIso(now = new Date()): string {
	return now.toISOString().slice(0, 10);
}

/** Keeps goods whose name contains the query. An empty query keeps the whole shelf. */
export function filterByName<T extends { name: string }>(items: readonly T[], query: string): T[] {
	const needle = query.trim().toLowerCase();
	if (needle.length === 0) return [...items];
	return items.filter((item) => item.name.toLowerCase().includes(needle));
}

/** Empty copy for the shelf list. A search that misses is not the same as an empty shelf. */
export function shelfEmptyMessage(query: string, language: AppLocale = 'zh-Hant'): string {
	return query.trim().length === 0 ? t('noGoods', language) : t('noMatch', language);
}

/** A whole number from 0 to 999, or null when the field is not that. */
export function parseStockCount(raw: string): number | null {
	if (!/^\d{1,3}$/.test(raw.trim())) return null;
	return Number(raw.trim());
}

/** Blank means no expiry. Anything else must be a real calendar day. */
export function parseExpiry(raw: string): { ok: true; value: string | null } | { ok: false } {
	const trimmed = raw.trim();
	if (trimmed === '') return { ok: true, value: null };
	if (!isRealIsoDate(trimmed)) return { ok: false };
	return { ok: true, value: trimmed };
}

/** Groups goods under the shelf location they sit on, in first-seen order. */
export function groupByShelf<T extends { shelf: keyof typeof SHELF_LABELS }>(items: readonly T[]) {
	const order: (keyof typeof SHELF_LABELS)[] = [];
	for (const item of items) {
		if (!order.includes(item.shelf)) order.push(item.shelf);
	}
	return order.map((shelf) => ({
		shelf,
		title: SHELF_LABELS[shelf],
		items: items.filter((item) => item.shelf === shelf),
	}));
}
