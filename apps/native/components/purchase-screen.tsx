import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { api } from '@goods/backend/convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import * as Network from 'expo-network';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
	clearSynced,
	loadQueue,
	queuePurchaseAdd,
	queuePurchaseBuy,
	type OfflineOperation,
} from '@/lib/offline-queue';

export function PurchaseScreen() {
	const spaces = useQuery(api.spaces.listMine);
	const space = spaces?.[0];
	const list = useQuery(api.purchases.list, space ? { spaceId: space._id } : 'skip');
	const stockSync = useMutation(api.stock.sync);
	const sync = useMutation(api.purchases.sync);
	const [market, setMarket] = useState(false);
	const [queue, setQueue] = useState<readonly OfflineOperation[]>([]);
	const [name, setName] = useState('');
	const [dollars, setDollars] = useState('');
	const [note, setNote] = useState<string | null>(null);

	useEffect(() => {
		void loadQueue().then(setQueue);
	}, []);

	const localAdds = queue.filter((operation) => operation.tag === 'purchase-add');

	const add = async () => {
		const cents = Math.round(Number(dollars) * 100);
		if (!name.trim() || !Number.isInteger(cents) || cents <= 0) {
			setNote('請填名稱和金額。');
			return;
		}
		const operation = {
			clientMutationId: `add-${Date.now()}`,
			name: name.trim(),
			quantity: 1,
			estimatedCents: cents,
			occurredAt: Date.now(),
		};
		const online = await deviceOnline();
		if (!market && online && space) {
			await sync({
				spaceId: space._id,
				ops: [{ tag: 'add', linkedItemId: null, ...operation }],
			});
			setNote('已加入清單。');
		} else {
			const next = await queuePurchaseAdd(queue, operation);
			setQueue(next);
			setNote('已記在這支手機上。');
		}
		setName('');
		setDollars('');
	};

	const buy = async (lineClientMutationId: string) => {
		const operation = {
			clientMutationId: `buy-${Date.now()}`,
			lineClientMutationId,
			occurredAt: Date.now(),
		};
		const online = await deviceOnline();
		if (!market && online && space) {
			const results = await sync({ spaceId: space._id, ops: [{ tag: 'buy', ...operation }] });
			const rejected = results.find((row) => row.outcome === 'rejected');
			setNote(rejected ? '這筆沒有勾上。' : '已採購。');
		} else {
			const next = await queuePurchaseBuy(queue, operation);
			setQueue(next);
			setNote('已勾在離線清單。');
		}
	};

	const flush = async () => {
		if (!space) return;
		const adds = queue.filter((operation) => operation.tag === 'purchase-add');
		const buys = queue.filter((operation) => operation.tag === 'purchase-buy');
		const moves = queue.filter((operation) => operation.tag === 'movement');
		const ids: string[] = [];
		if (adds.length > 0 || buys.length > 0) {
			await sync({
				spaceId: space._id,
				ops: [
					...adds.map((operation) => ({
						tag: 'add' as const,
						clientMutationId: operation.clientMutationId,
						name: operation.name,
						quantity: operation.quantity,
						estimatedCents: operation.estimatedCents,
						linkedItemId: null,
						occurredAt: operation.occurredAt,
					})),
					...buys.map((operation) => ({
						tag: 'buy' as const,
						clientMutationId: operation.clientMutationId,
						lineClientMutationId: operation.lineClientMutationId,
						occurredAt: operation.occurredAt,
					})),
				],
			});
			ids.push(
				...adds.map((operation) => operation.clientMutationId),
				...buys.map((operation) => operation.clientMutationId),
			);
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

	const open = list?.lines.filter((line) => line.status === 'open') ?? [];
	const total = open.reduce((sum, line) => sum + line.estimatedCents, 0);

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
				{(list?.lines ?? []).map((line) => (
					<View key={line._id} style={styles.row}>
						<View style={styles.rowText}>
							<Text style={styles.name}>{line.name}</Text>
							<Text style={styles.muted}>{formatCents(line.estimatedCents)}</Text>
						</View>
						{line.status === 'open' && (
							<Pressable style={styles.hit} onPress={() => void buy(line.clientMutationId)}>
								<Text>已採購</Text>
							</Pressable>
						)}
					</View>
				))}
				{localAdds.map((operation) => (
					<View key={operation.clientMutationId} style={styles.row}>
						<Text style={styles.name}>{operation.name}</Text>
						<Text style={styles.muted}>待合併</Text>
					</View>
				))}
			</View>
			<Text style={styles.section}>在超市補一筆</Text>
			<TextInput value={name} onChangeText={setName} placeholder="名稱" style={styles.input} />
			<TextInput
				value={dollars}
				onChangeText={setDollars}
				placeholder="金額"
				keyboardType="decimal-pad"
				style={styles.input}
			/>
			<Pressable style={styles.flush} onPress={() => void add()}>
				<Text style={styles.flushLabel}>加入</Text>
			</Pressable>
		</ScrollView>
	);
}

function formatCents(cents: number): string {
	const dollars = Math.floor(cents / 100).toLocaleString('en-HK');
	const fraction = String(cents % 100).padStart(2, '0');
	return `HK$${dollars}.${fraction}`;
}

async function deviceOnline(): Promise<boolean> {
	const state = await Network.getNetworkStateAsync();
	return state.isConnected === true && state.isInternetReachable !== false;
}

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
	section: { marginTop: 20, fontSize: 16, fontWeight: '500' },
	input: {
		marginTop: 8,
		height: 44,
		borderWidth: 1,
		borderColor: '#d4d4d4',
		borderRadius: 6,
		backgroundColor: '#ffffff',
		paddingHorizontal: 12,
	},
});
