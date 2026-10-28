import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { api } from '@goods/backend/convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import * as Network from 'expo-network';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
	clearSynced,
	loadQueue,
	queuePurchaseBuy,
	type OfflineOperation,
} from '@/lib/offline-queue';

/** Phone purchases: check a trip off, and flush buys that were queued offline. */
export function PurchaseScreen() {
	const spaces = useQuery(api.spaces.listMine);
	const space = spaces?.[0];
	const list = useQuery(api.purchases.list, space ? { spaceId: space._id } : 'skip');
	const stockSync = useMutation(api.stock.sync);
	const sync = useMutation(api.purchases.sync);
	const [market, setMarket] = useState(false);
	const [queue, setQueue] = useState<readonly OfflineOperation[]>([]);
	const [note, setNote] = useState<string | null>(null);

	useEffect(() => {
		void loadQueue().then(setQueue);
	}, []);

	/** Checks a trip off, or stores the check until the phone is back online. */
	const buy = async (purchaseClientMutationId: string) => {
		const operation = {
			clientMutationId: `buy-${Date.now()}`,
			lineClientMutationId: purchaseClientMutationId,
			occurredAt: Date.now(),
		};
		const online = await deviceOnline();
		if (!market && online && space) {
			const results = await sync({
				spaceId: space._id,
				ops: [
					{
						tag: 'buy',
						clientMutationId: operation.clientMutationId,
						purchaseClientMutationId,
						occurredAt: operation.occurredAt,
					},
				],
			});
			const rejected = results.find((row) => row.outcome === 'rejected');
			setNote(rejected ? '這筆沒有勾上。' : '已採購。');
		} else {
			const next = await queuePurchaseBuy(queue, operation);
			setQueue(next);
			setNote('已勾在離線清單。');
		}
	};

	/** Sends queued buys and takes, then drops the ids the server accepted. */
	const flush = async () => {
		if (!space) return;
		const staleAdds = queue.filter((operation) => operation.tag === 'purchase-add');
		const buys = queue.filter((operation) => operation.tag === 'purchase-buy');
		const moves = queue.filter((operation) => operation.tag === 'movement');
		const ids: string[] = staleAdds.map((operation) => operation.clientMutationId);
		if (buys.length > 0) {
			await sync({
				spaceId: space._id,
				ops: buys.map((operation) => ({
					tag: 'buy' as const,
					clientMutationId: operation.clientMutationId,
					purchaseClientMutationId: operation.lineClientMutationId,
					occurredAt: operation.occurredAt,
				})),
			});
			ids.push(...buys.map((operation) => operation.clientMutationId));
		}
		const byItem = new Map<string, typeof moves>();
		for (const movement of moves) {
			const group = byItem.get(movement.itemId) ?? [];
			group.push(movement);
			byItem.set(movement.itemId, group);
		}
		for (const [itemId, group] of byItem) {
			// SAFETY: the queue stores the item id this phone read from the shelf query.
			const storedItemId = itemId as Id<'items'>;
			await stockSync({
				spaceId: space._id,
				itemId: storedItemId,
				ops: group.map((movement) => ({
					clientMutationId: movement.clientMutationId,
					kind: movement.kind,
					quantity: movement.quantity,
					occurredAt: movement.occurredAt,
					causalParentClientId: movement.causalParentClientId,
					observedVersion: movement.observedVersion,
				})),
			});
			ids.push(...group.map((movement) => movement.clientMutationId));
		}
		const next = await clearSynced(queue, ids);
		setQueue(next);
		setNote('已合併到空間。');
	};

	const open = list?.purchases.filter((purchase) => purchase.status === 'open') ?? [];
	const total = open.reduce((sum, purchase) => sum + purchase.totalCents, 0);

	return (
		<ScrollView style={styles.page} contentContainerStyle={styles.content}>
			<Text style={styles.title}>{space?.name ?? '採購'}</Text>
			<Text style={styles.money}>{formatCents(total)}</Text>
			<Text style={styles.caption}>未採購合計</Text>
			<View style={styles.switchRow}>
				<Text style={styles.name}>超市模式</Text>
				<Switch value={market} onValueChange={setMarket} />
			</View>
			{note && <Text style={styles.note}>{note}</Text>}
			{queue.length > 0 && (
				<Pressable style={styles.flush} onPress={() => void flush()}>
					<Text style={styles.flushLabel}>合併 {queue.length} 筆到空間</Text>
				</Pressable>
			)}
			<View style={styles.panel}>
				{(list?.purchases ?? []).map((purchase) => (
					<View key={purchase._id} style={styles.row}>
						<View style={styles.rowText}>
							{purchase.items.map((item) => (
								<Text key={item._id} style={styles.name}>
									{item.name} × {item.quantity}
								</Text>
							))}
							<Text style={styles.muted}>{formatCents(purchase.totalCents)}</Text>
						</View>
						{purchase.status === 'open' && (
							<Pressable style={styles.hit} onPress={() => void buy(purchase.clientMutationId)}>
								<Text>已採購</Text>
							</Pressable>
						)}
					</View>
				))}
			</View>
		</ScrollView>
	);
}

/** Formats integer cents as Hong Kong dollars. */
function formatCents(cents: number): string {
	const dollars = Math.floor(cents / 100).toLocaleString('en-HK');
	const fraction = String(cents % 100).padStart(2, '0');
	return `HK$${dollars}.${fraction}`;
}

/** True when the phone can reach the server. An unknown reachability still counts as online. */
async function deviceOnline(): Promise<boolean> {
	const state = await Network.getNetworkStateAsync();
	return state.isConnected === true && state.isInternetReachable !== false;
}

/** Layout for the phone purchase list. */
const styles = StyleSheet.create({
	page: { flex: 1, backgroundColor: '#f2f4f7' },
	content: { padding: 16, paddingBottom: 48 },
	title: { fontSize: 24, fontWeight: '500' },
	money: { fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 8 },
	caption: { fontSize: 12, color: '#6b6b6b' },
	switchRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginTop: 16,
	},
	note: { marginTop: 8, fontSize: 14 },
	flush: {
		marginTop: 12,
		minHeight: 44,
		backgroundColor: '#141414',
		borderRadius: 6,
		alignItems: 'center',
		justifyContent: 'center',
	},
	flushLabel: { color: '#ffffff', fontSize: 14 },
	panel: { backgroundColor: '#ffffff', borderRadius: 8, marginTop: 12, paddingHorizontal: 16 },
	row: {
		minHeight: 44,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		borderTopWidth: 1,
		borderTopColor: '#f0f0f0',
	},
	rowText: { flex: 1 },
	name: { fontSize: 14 },
	muted: { fontSize: 12, color: '#6b6b6b' },
	hit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
