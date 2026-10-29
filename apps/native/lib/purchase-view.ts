import { unitsToRestock } from '@goods/domain/purchase';

/**
 * Parses a typed buy. `min` is 0 on the draft form, where zero leaves the good
 * off the new trip, and 1 on a line that is already saved.
 */
export function parseBuy(raw: string, min = 0): number | null {
	if (!/^\d{1,2}$/.test(raw.trim())) return null;
	const quantity = Number(raw.trim());
	if (quantity < min) return null;
	return quantity;
}

/** One short good, and whether an open trip already lists it. */
export type ShortfallRow<ItemId extends string = string> = {
	id: ItemId;
	name: string;
	unit: string;
	buy: number;
	listed: boolean;
};

/** Goods at or under the safety line, largest buy first. */
export function shortfallRows<ItemId extends string>(
	items: readonly {
		id: ItemId;
		name: string;
		unit: string;
		quantity: number;
		safetyQuantity: number;
	}[],
	openItemIds: readonly string[],
): ShortfallRow<ItemId>[] {
	const linked = new Set(openItemIds);
	return items
		.flatMap((item) => {
			const buy = unitsToRestock(item.quantity, item.safetyQuantity);
			if (buy === 0) return [];
			return [
				{
					id: item.id,
					name: item.name,
					unit: item.unit,
					buy,
					listed: linked.has(item.id),
				},
			];
		})
		.toSorted((left, right) => right.buy - left.buy);
}
