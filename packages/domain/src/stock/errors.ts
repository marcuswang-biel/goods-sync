import { Schema } from 'effect';

/** The stock or purchase input failed validation. */
export class InvalidStock extends Schema.TaggedErrorClass<InvalidStock>()('InvalidStock', {
	reason: Schema.String,
}) {}

/** A purchase line or a department charge failed validation, or the budget cannot cover it. */
export class InvalidPurchase extends Schema.TaggedErrorClass<InvalidPurchase>()('InvalidPurchase', {
	reason: Schema.String,
}) {}

/** Charging this line would push the office past the department budget. */
export class BudgetExceeded extends Schema.TaggedErrorClass<BudgetExceeded>()('BudgetExceeded', {
	remainingCents: Schema.Number,
	chargeCents: Schema.Number,
}) {}

export type StockError = InvalidStock;
export type PurchaseError = InvalidPurchase | BudgetExceeded;
