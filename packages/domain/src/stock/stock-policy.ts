import { Layer, ServiceMap } from 'effect';

/** How far ahead an expiry counts as "eat this first". */
export type StockLimits = {
	/** Inclusive window, in calendar days from today, that still counts as soon. */
	readonly soonDays: number;
};

/** Effect service the assessor reads for the "soon" window. */
export class StockPolicy extends ServiceMap.Service<StockPolicy, StockLimits>()(
	'@goods/domain/StockPolicy',
) {}

/** The production window: an item expiring within three days counts as soon. */
export const DEFAULT_STOCK_POLICY: StockLimits = {
	soonDays: 3,
};

/** Builds a policy layer from explicit limits. */
export const stockPolicyLayer = (policy: StockLimits) => Layer.succeed(StockPolicy)(policy);

/** The production policy: three days. */
export const StockPolicyLive = stockPolicyLayer(DEFAULT_STOCK_POLICY);
