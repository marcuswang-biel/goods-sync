import { Schema } from 'effect';

/** The shelf input failed validation, or a fold refused it. */
export class InvalidStock extends Schema.TaggedErrorClass<InvalidStock>()('InvalidStock', {
	reason: Schema.String,
}) {}

/** Tagged failure from stock classification or a shelf write. */
export type StockError = InvalidStock;
