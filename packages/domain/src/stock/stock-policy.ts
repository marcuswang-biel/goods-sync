import { Layer, ServiceMap } from 'effect';

/** How far ahead an expiry counts as "eat this first". */
export type StockLimits = {
	/** Inclusive window, in calendar days from today, that still counts as soon. */
	readonly soonDays: number;
};

export class StockPolicy extends ServiceMap.Service<StockPolicy, StockLimits>()(
	'@goods/domain/StockPolicy',
) {}

export const DEFAULT_STOCK_POLICY: StockLimits = {
	soonDays: 3,
};

/** Builds a policy layer from explicit limits. */
export const stockPolicyLayer = (policy: StockLimits) => Layer.succeed(StockPolicy)(policy);

/** The production policy: three days. */
export const StockPolicyLive = stockPolicyLayer(DEFAULT_STOCK_POLICY);
