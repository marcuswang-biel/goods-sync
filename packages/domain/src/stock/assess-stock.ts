import { Effect, Schema } from 'effect';

import { addIsoDays, isRealIsoDate } from './calendar';
import { InvalidStock } from './errors';
import { StockPolicy } from './stock-policy';

export type Freshness = 'undated' | 'ok' | 'soon' | 'expired';
export type Supply = 'ok' | 'low' | 'out';

export type StockAssessment = {
	readonly freshness: Freshness;
	readonly supply: Supply;
	/** Units still needed to reach the safety line. Zero when the shelf is at or above it. */
	readonly shortfall: number;
};

const IsoDate = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/));

const AssessInput = Schema.Struct({
	quantity: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	safetyQuantity: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	expiresOn: Schema.NullOr(IsoDate),
	today: IsoDate,
});

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

export function isAttention(row: {
	readonly freshness: Freshness;
	readonly supply: Supply;
}): boolean {
	return isExpiring(row.freshness) || isShort(row.supply);
}

function urgencyRank(row: ShelfRow): number {
	if (row.freshness === 'expired') return 0;
	if (row.supply === 'out') return 1;
	if (row.freshness === 'soon' && row.supply === 'low') return 2;
	if (row.freshness === 'soon') return 3;
	if (row.supply === 'low') return 4;
	return 5;
}

/**
 * Most urgent first. A tie breaks toward the earlier expiry, then the name,
 * so two clients pick the same lead from the same shelf.
 */
export function compareUrgency(left: ShelfRow, right: ShelfRow): number {
	const rank = urgencyRank(left) - urgencyRank(right);
	if (rank !== 0) return rank;
	const leftDate = left.expiresOn ?? '9999-99-99';
	const rightDate = right.expiresOn ?? '9999-99-99';
	if (leftDate < rightDate) return -1;
	if (leftDate > rightDate) return 1;
	if (left.name < right.name) return -1;
	if (left.name > right.name) return 1;
	return 0;
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

		const assessment: StockAssessment = {
			freshness,
			supply,
			shortfall: Math.max(0, decoded.safetyQuantity - decoded.quantity),
		};
		return assessment;
	});
