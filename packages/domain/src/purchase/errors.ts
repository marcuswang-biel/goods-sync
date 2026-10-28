import { Schema } from 'effect';

/** A purchase failed validation. */
export class InvalidPurchase extends Schema.TaggedErrorClass<InvalidPurchase>()('InvalidPurchase', {
	reason: Schema.String,
}) {}

/** Tagged failure from purchase validation. */
export type PurchaseError = InvalidPurchase;
