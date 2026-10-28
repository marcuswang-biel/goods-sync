import type { OfflineOperation } from '@goods/domain/stock';

import {
	dropSynced,
	enqueueMovement,
	enqueuePurchaseAdd,
	enqueuePurchaseBuy,
} from '@goods/domain/stock';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Effect } from 'effect';

export type { OfflineOperation };

const KEY = 'goods-offline-queue';

export async function loadQueue(): Promise<readonly OfflineOperation[]> {
	const raw = await AsyncStorage.getItem(KEY);
	if (!raw) return [];
	const exit = Effect.runSyncExit(dropSynced(JSON.parse(raw), []));
	if (exit._tag === 'Success') return exit.value;
	return [];
}

async function save(queue: readonly OfflineOperation[]) {
	await AsyncStorage.setItem(KEY, JSON.stringify(queue));
}

function nextQueue(
	queue: readonly OfflineOperation[],
	program: Effect.Effect<readonly OfflineOperation[], unknown>,
) {
	const exit = Effect.runSyncExit(program);
	if (exit._tag !== 'Success') return queue;
	return exit.value;
}

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

export async function queuePurchaseAdd(
	queue: readonly OfflineOperation[],
	request: {
		clientMutationId: string;
		name: string;
		quantity: number;
		estimatedCents: number;
		occurredAt: number;
	},
) {
	const next = nextQueue(queue, enqueuePurchaseAdd(queue, request));
	await save(next);
	return next;
}

export async function queuePurchaseBuy(
	queue: readonly OfflineOperation[],
	request: { clientMutationId: string; lineClientMutationId: string; occurredAt: number },
) {
	const next = nextQueue(queue, enqueuePurchaseBuy(queue, request));
	await save(next);
	return next;
}

export async function clearSynced(queue: readonly OfflineOperation[], ids: readonly string[]) {
	const next = nextQueue(queue, dropSynced(queue, ids));
	await save(next);
	return next;
}
