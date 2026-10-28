import { Effect, Schema } from 'effect';

import { InvalidPurchase } from './errors';

/** Whole units a member may buy on one line: 1 through 99. */
const PurchaseQuantity = Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(99));

/**
 * How many to buy so a warned item clears the safety line.
 * At the line, buy one. Above the line, buy none.
 */
export function unitsToRestock(quantity: number, safetyQuantity: number): number {
	if (quantity > safetyQuantity) return 0;
	return Math.max(safetyQuantity - quantity, 1);
}

/** One good on a trip, identified by the shelf item. */
const BasketItem = Schema.Struct({
	itemId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
	quantity: PurchaseQuantity,
});

/** One shopping trip: one total, between one and forty goods. */
const PurchaseBasket = Schema.Struct({
	totalCents: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(10_000_000)),
	items: Schema.Array(BasketItem).check(Schema.isMinLength(1), Schema.isMaxLength(40)),
});

/** A validated shopping trip. */
export type PurchaseBasket = typeof PurchaseBasket.Type;

/** Validates a quantity a member changed before the trip is bought. */
export const draftPurchaseQuantity = (input: unknown) =>
	Effect.gen(function* () {
		return yield* Schema.decodeUnknownEffect(PurchaseQuantity)(input).pipe(
			Effect.mapError((error) => new InvalidPurchase({ reason: error.message })),
		);
	});

/** Validates one shopping trip: several goods, one total, no repeated good. */
export const draftPurchaseBasket = (input: unknown) =>
	Effect.gen(function* () {
		const draft = yield* Schema.decodeUnknownEffect(PurchaseBasket)(input).pipe(
			Effect.mapError((error) => new InvalidPurchase({ reason: error.message })),
		);
		const ids = draft.items.map((item) => item.itemId);
		if (new Set(ids).size !== ids.length) {
			return yield* new InvalidPurchase({ reason: 'A good can only appear once.' });
		}
		return draft;
	});
