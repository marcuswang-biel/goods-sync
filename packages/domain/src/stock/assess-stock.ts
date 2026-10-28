import { Effect, Schema } from 'effect';

import { addIsoDays, isRealIsoDate } from './calendar';
import { InvalidStock } from './errors';
import { StockPolicy } from './stock-policy';

/** How close an item is to its expiry date. Undated goods never count as soon. */
export type Freshness = 'undated' | 'ok' | 'soon' | 'expired';
/** Whether the shelf is above, on, or through the safety line. */
export type Supply = 'ok' | 'low' | 'out';

/** Classification of one item for a given day. */
export type StockAssessment = {
	readonly freshness: Freshness;
	readonly supply: Supply;
};

/** `YYYY-MM-DD` text. A real calendar day is checked after this shape matches. */
const IsoDate = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/));

/** Inputs the assessor will classify. */
const AssessInput = Schema.Struct({
	quantity: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	safetyQuantity: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	expiresOn: Schema.NullOr(IsoDate),
	today: IsoDate,
});

/** A shelf row the queue screens compare. */
export type ShelfRow = {
	readonly name: string;
	readonly quantity: number;
	readonly freshness: Freshness;
	readonly supply: Supply;
	readonly expiresOn: string | null;
};

/** An item someone should eat soon or replace. */
export function isExpiring(freshness: Freshness): boolean {
	return freshness === 'soon' || freshness === 'expired';
}

/** An item at or under its safety line, including an empty shelf. */
export function isShort(supply: Supply): boolean {
	return supply === 'low' || supply === 'out';
}

/** True when the item should be eaten soon or is at or under its safety line. */
export function isAttention(row: {
	readonly freshness: Freshness;
	readonly supply: Supply;
}): boolean {
	return isExpiring(row.freshness) || isShort(row.supply);
}

/**
 * Classifies one item against today.
 *
 * Undated items are never "soon". A quantity of zero is out, even when the
 * safety line is also zero. Anything still on the shelf but at or under the
 * safety line is low.
 */
export const assessStock = (input: unknown) =>
	Effect.gen(function* () {
		const decoded = yield* Schema.decodeUnknownEffect(AssessInput)(input).pipe(
			Effect.mapError((error) => new InvalidStock({ reason: error.message })),
		);
		if (
			!isRealIsoDate(decoded.today) ||
			(decoded.expiresOn !== null && !isRealIsoDate(decoded.expiresOn))
		) {
			return yield* new InvalidStock({ reason: 'Date is not a real calendar day.' });
		}

		const policy = yield* StockPolicy;
		let freshness: Freshness = 'undated';
		if (decoded.expiresOn !== null) {
			if (decoded.expiresOn < decoded.today) freshness = 'expired';
			else if (decoded.expiresOn <= addIsoDays(decoded.today, policy.soonDays)) freshness = 'soon';
			else freshness = 'ok';
		}

		const supply: Supply =
			decoded.quantity === 0 ? 'out' : decoded.quantity <= decoded.safetyQuantity ? 'low' : 'ok';

		return { freshness, supply };
	});
