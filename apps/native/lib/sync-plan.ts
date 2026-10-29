import type { OfflineOperation } from '@goods/domain/offline';

import { mergedLeft, t, type AppLocale } from './copy';

/** One server answer for a queued operation. */
export type SyncAnswer = {
	clientMutationId: string;
	outcome: 'applied' | 'rejected' | 'duplicate';
};

/** Buys waiting on the phone, in queue order, shaped for `purchases.sync`. */
export function buyBatch(queue: readonly OfflineOperation[]) {
	return queue.flatMap((operation) =>
		operation.tag === 'purchase-buy'
			? [
					{
						tag: 'buy' as const,
						clientMutationId: operation.clientMutationId,
						purchaseClientMutationId: operation.lineClientMutationId,
						occurredAt: operation.occurredAt,
					},
				]
			: [],
	);
}

/** Takes grouped by the good they change, so each group is one `stock.sync`. */
export function movementBatches(queue: readonly OfflineOperation[]) {
	const order: string[] = [];
	const groups = new Map<string, Extract<OfflineOperation, { tag: 'movement' }>[]>();
	for (const operation of queue) {
		if (operation.tag !== 'movement') continue;
		const group = groups.get(operation.itemId);
		if (group) group.push(operation);
		else {
			order.push(operation.itemId);
			groups.set(operation.itemId, [operation]);
		}
	}
	return order.map((itemId) => ({
		itemId,
		ops: (groups.get(itemId) ?? []).map((movement) => ({
			clientMutationId: movement.clientMutationId,
			kind: movement.kind,
			quantity: movement.quantity,
			occurredAt: movement.occurredAt,
			causalParentClientId: movement.causalParentClientId,
			observedVersion: movement.observedVersion,
		})),
	}));
}

/** Ids the phone may drop. A rejection stays on the phone so it can be sent again. */
export function idsToClear(results: readonly SyncAnswer[]): string[] {
	return results.filter((row) => row.outcome !== 'rejected').map((row) => row.clientMutationId);
}

/** The latest queued take of one good. An online take points at it. */
export function lastQueuedMovement(
	queue: readonly OfflineOperation[],
	itemId: string,
): string | null {
	let parent: string | null = null;
	for (const operation of queue) {
		if (operation.tag === 'movement' && operation.itemId === itemId) {
			parent = operation.clientMutationId;
		}
	}
	return parent;
}

/** Flush order: place goods, replay takes, delete, then purchases. */
export function flushSteps(queue: readonly OfflineOperation[]) {
	const steps: (
		| { tag: 'item-create'; operation: Extract<OfflineOperation, { tag: 'item-create' }> }
		| {
				tag: 'movements';
				itemId: string;
				ops: ReturnType<typeof movementBatches>[number]['ops'];
		  }
		| { tag: 'item-remove'; operation: Extract<OfflineOperation, { tag: 'item-remove' }> }
		| { tag: 'purchase-trip'; operation: Extract<OfflineOperation, { tag: 'purchase-trip' }> }
		| {
				tag: 'purchase-quantity';
				operation: Extract<OfflineOperation, { tag: 'purchase-quantity' }>;
		  }
		| { tag: 'purchase-buy'; ops: ReturnType<typeof buyBatch> }
	)[] = [];
	for (const operation of queue) {
		if (operation.tag === 'item-create') steps.push({ tag: 'item-create', operation });
	}
	for (const batch of movementBatches(queue)) {
		steps.push({ tag: 'movements', itemId: batch.itemId, ops: batch.ops });
	}
	for (const operation of queue) {
		if (operation.tag === 'item-remove') steps.push({ tag: 'item-remove', operation });
	}
	for (const operation of queue) {
		if (operation.tag === 'purchase-trip') steps.push({ tag: 'purchase-trip', operation });
	}
	for (const operation of queue) {
		if (operation.tag === 'purchase-quantity') steps.push({ tag: 'purchase-quantity', operation });
	}
	const buys = buyBatch(queue);
	if (buys.length > 0) steps.push({ tag: 'purchase-buy', ops: buys });
	return steps;
}

/** What to say after a flush. A free-text aisle line still cannot be sent. */
export function flushNote(
	remaining: readonly { tag: string }[],
	cleared: number,
	language: AppLocale = 'zh-Hant',
): string {
	const stuckAdds = remaining.filter((operation) => operation.tag === 'purchase-add').length;
	if (remaining.length === 0) return t('merged', language);
	if (cleared === 0 && stuckAdds === remaining.length) return t('cannotSend', language);
	return mergedLeft(remaining.length, language);
}
