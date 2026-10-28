import { Effect, Schema, SchemaTransformation } from 'effect';

import { BudgetExceeded, InvalidPurchase } from './errors';

const PurchaseDraft = Schema.Struct({
	name: Schema.String.pipe(Schema.decode(SchemaTransformation.trim())).check(
		Schema.isMinLength(1),
		Schema.isMaxLength(80),
	),
	quantity: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(99)),
	estimatedCents: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(10_000_000)),
});

export type PurchaseDraft = typeof PurchaseDraft.Type;

const SplitInput = Schema.Struct({
	totalCents: Schema.Int.check(Schema.isGreaterThan(0)),
	memberCount: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(100)),
});

const ChargeInput = Schema.Struct({
	remainingCents: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	chargeCents: Schema.Int.check(Schema.isGreaterThan(0)),
});

export type SplitQuote = {
	/** What each member owes before the remainder. */
	readonly perPersonCents: number;
	/** Cents left over, paid by the person who checks the line off. */
	readonly remainderCents: number;
};

export type BudgetCharge = {
	readonly remainingCents: number;
};

/**
 * How many to buy so a warned item clears the safety line.
 * At the line, buy one. Above the line, buy none.
 */
export function unitsToRestock(quantity: number, safetyQuantity: number): number {
	if (quantity > safetyQuantity) return 0;
	return Math.max(safetyQuantity - quantity, 1);
}

/** Validates a line a member typed in the shop, before it is stored. */
export const draftPurchase = (input: unknown) =>
	Effect.gen(function* () {
		return yield* Schema.decodeUnknownEffect(PurchaseDraft)(input).pipe(
			Effect.mapError((error) => new InvalidPurchase({ reason: error.message })),
		);
	});

/**
 * Splits a line across the people currently in the space.
 * `perPersonCents * memberCount + remainderCents` equals `totalCents`.
 */
export const quoteEqualSplit = (input: unknown) =>
	Effect.gen(function* () {
		const decoded = yield* Schema.decodeUnknownEffect(SplitInput)(input).pipe(
			Effect.mapError((error) => new InvalidPurchase({ reason: error.message })),
		);
		const perPersonCents = Math.floor(decoded.totalCents / decoded.memberCount);
		const remainderCents = decoded.totalCents - perPersonCents * decoded.memberCount;
		const quote: SplitQuote = { perPersonCents, remainderCents };
		return quote;
	});

/** Charges an office line against the department budget. Fails closed when it does not fit. */
export const chargeDepartmentBudget = (input: unknown) =>
	Effect.gen(function* () {
		const decoded = yield* Schema.decodeUnknownEffect(ChargeInput)(input).pipe(
			Effect.mapError((error) => new InvalidPurchase({ reason: error.message })),
		);
		if (decoded.chargeCents > decoded.remainingCents) {
			return yield* new BudgetExceeded({
				remainingCents: decoded.remainingCents,
				chargeCents: decoded.chargeCents,
			});
		}
		const charge: BudgetCharge = {
			remainingCents: decoded.remainingCents - decoded.chargeCents,
		};
		return charge;
	});
