import type { MessageDescriptor } from '@lingui/core';

import { APP_ERROR_CODES, type AppErrorCode } from '@goods/shared/error-codes';
import { msg } from '@lingui/core/macro';

/** User-facing copy for a Convex error code. Clients translate the descriptor, not the server message. */
export const STOCK_ERROR_MESSAGES: Partial<Record<AppErrorCode, MessageDescriptor>> = {
	[APP_ERROR_CODES.unauthenticated]: msg`請先登入。`,
	[APP_ERROR_CODES.notFound]: msg`找不到這項物資。`,
	[APP_ERROR_CODES.stockInvalid]: msg`這筆領用沒有寫成功。`,
	[APP_ERROR_CODES.purchaseInvalid]: msg`這筆採購沒有寫成功。`,
};

/** User-facing copy when a synced take or purchase is rejected. */
export const REJECTION_MESSAGES = {
	INSUFFICIENT_STOCK: msg`當時已經沒有這麼多了。`,
	CAUSAL_CYCLE: msg`這幾筆領用互相依賴，沒有套用。`,
	PURCHASE_INVALID: msg`這筆採購的格式不對。`,
	NOT_FOUND: msg`找不到這一筆。`,
} as const;
