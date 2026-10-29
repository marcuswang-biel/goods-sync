import { convexErrorCode } from '@goods/shared/convex-error';

import { t, type AppLocale } from './copy';

/** A sentence for a sync rejection code. Unknown codes get the generic retry line. */
export function rejectionMessage(code: string | null, language: AppLocale = 'zh-Hant'): string {
	switch (code) {
		case 'INSUFFICIENT_STOCK':
			return t('insufficient', language);
		case 'CAUSAL_CYCLE':
			return t('cycle', language);
		case 'PURCHASE_INVALID':
			return t('purchaseInvalid', language);
		case 'NOT_FOUND':
			return t('notFound', language);
		default:
			return t('failed', language);
	}
}

/** What to show when a Convex call throws. The code is the contract, not the English reason. */
export function appFailureText(failure: unknown, language: AppLocale = 'zh-Hant'): string {
	const code = convexErrorCode(failure);
	if (code === 'STOCK_INVALID' || code === 'PURCHASE_INVALID') return t('badData', language);
	if (code === 'NOT_FOUND') return t('notFound', language);
	if (code === 'UNAUTHENTICATED') return t('signInFirst', language);
	return t('failed', language);
}

/** What the shelf says after one take comes back from the server. */
export function takeNote(
	results: readonly { outcome: string; rejectionCode: string | null }[],
	language: AppLocale = 'zh-Hant',
): string {
	const rejected = results.find((row) => row.outcome === 'rejected');
	if (!rejected) return t('takenDone', language);
	return rejectionMessage(rejected.rejectionCode, language);
}
