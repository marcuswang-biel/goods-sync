import type { OfflineOperation } from '@goods/domain/offline';

import { dropSynced, enqueueMovement, enqueuePurchaseBuy } from '@goods/domain/offline';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Effect } from 'effect';

export type { OfflineOperation };

/** Storage key for the phone's offline take and purchase queue. */
const KEY = 'goods-offline-queue';

/** Reads the queue. A corrupt payload is treated as empty so the phone can keep working. */
export async function loadQueue(): Promise<readonly OfflineOperation[]> {
	const raw = await AsyncStorage.getItem(KEY);
	if (!raw) return [];
	const exit = Effect.runSyncExit(dropSynced(JSON.parse(raw), []));
	if (exit._tag === 'Success') return exit.value;
	return [];
}

/** Writes the whole queue back. The domain program is the source of the next value. */
async function save(queue: readonly OfflineOperation[]) {
	await AsyncStorage.setItem(KEY, JSON.stringify(queue));
}

/** Applies a domain queue program. A failure leaves the stored queue unchanged. */
function nextQueue(
	queue: readonly OfflineOperation[],
	program: Effect.Effect<readonly OfflineOperation[], unknown>,
) {
	const exit = Effect.runSyncExit(program);
	if (exit._tag !== 'Success') return queue;
	return exit.value;
}

/** Appends one take and persists the queue. */
export async function queueMovement(
	queue: readonly OfflineOperation[],
	request: {
		clientMutationId: string;
		itemId: string;
		kind: 'consume' | 'restock';
		quantity: number;
		occurredAt: number;
		observedVersion: number;
	},
) {
	const next = nextQueue(queue, enqueueMovement(queue, request));
	await save(next);
	return next;
}

/** Appends one "mark bought" and persists the queue. */
export async function queuePurchaseBuy(
	queue: readonly OfflineOperation[],
	request: { clientMutationId: string; lineClientMutationId: string; occurredAt: number },
) {
	const next = nextQueue(queue, enqueuePurchaseBuy(queue, request));
	await save(next);
	return next;
}

/** Drops operations whose ids the server has already applied. */
export async function clearSynced(queue: readonly OfflineOperation[], ids: readonly string[]) {
	const next = nextQueue(queue, dropSynced(queue, ids));
	await save(next);
	return next;
}
