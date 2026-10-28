import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { api } from '@goods/backend/convex/_generated/api';
import { isAttention, isExpiring, isShort } from '@goods/domain/stock';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSignOut } from '@/auth';
import { loadQueue, queueMovement } from '@/lib/offline-queue';

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

type ShelfItem = {
	_id: Id<'items'>;
	name: string;
	quantity: number;
	version: number;
	freshness: 'undated' | 'ok' | 'soon' | 'expired';
	supply: 'ok' | 'low' | 'out';
};

export function PantryHome() {
	const spaces = useQuery(api.spaces.listMine);
	const viewer = useQuery(api.viewer.get);
	const signOut = useSignOut();
	const [spaceId, setSpaceId] = useState<Id<'spaces'> | null>(null);
	const active = spaces?.find((space) => space._id === spaceId) ?? spaces?.[0];
	const board = useQuery(
		api.stock.board,
		active ? { spaceId: active._id, today: todayIso() } : 'skip',
	);
	const sync = useMutation(api.stock.sync);
	const [note, setNote] = useState<string | null>(null);
	const [queued, setQueued] = useState(0);

	useEffect(() => {
		void loadQueue().then((queue) => setQueued(queue.length));
	}, []);

	const take = async (item: ShelfItem) => {
		if (!active) return;
		const occurredAt = Date.now();
		const clientMutationId = `take-${occurredAt}`;
		try {
			const result = await sync({
				spaceId: active._id,
				itemId: item._id,
				ops: [
					{
						clientMutationId,
						kind: 'consume',
						quantity: 1,
						occurredAt,
						causalParentClientId: null,
						observedVersion: item.version,
					},
				],
			});
			const rejected = result.results.find((row) => row.outcome === 'rejected');
			setNote(rejected ? '這筆沒有扣成，架上已經不夠。' : '已領用。');
		} catch {
			const queue = await loadQueue();
			const next = await queueMovement(queue, {
				clientMutationId,
				itemId: item._id,
				kind: 'consume',
				quantity: 1,
				occurredAt,
				observedVersion: item.version,
			});
			setQueued(next.length);
			setNote('沒有連上，已放進離線佇列。');
		}
	};

	const items = board?.items ?? [];
	const expiring = items.filter((item) => isExpiring(item.freshness));
	const short = items.filter((item) => isShort(item.supply));
	const attention = items.filter((item) => isAttention(item)).length;

	return (
		<ScrollView style={styles.page} contentContainerStyle={styles.content}>
			<View style={styles.top}>
				<Text style={styles.word}>物資</Text>
				<Pressable onPress={() => void signOut()} style={styles.hit}>
					<Text style={styles.link}>登出</Text>
				</Pressable>
			</View>
			<Text style={styles.email}>{viewer?.email ?? ''}</Text>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.spaces}
			>
				{(spaces ?? []).map((space) => (
					<Pressable key={space._id} onPress={() => setSpaceId(space._id)} style={styles.hit}>
						<Text style={space._id === active?._id ? styles.spaceOn : styles.spaceOff}>
							{space.name}
						</Text>
					</Pressable>
				))}
			</ScrollView>
			<Text style={styles.title}>{active?.name ?? '空間'}</Text>
			<Text style={[styles.figure, attention === 0 && styles.muted]}>{attention}</Text>
			<Text style={styles.caption}>要處理</Text>
			{note && <Text style={styles.note}>{note}</Text>}
			{queued > 0 && <Text style={styles.note}>離線佇列 {queued} 筆。到採購頁合併。</Text>}
			<Section title="要先吃掉" rows={expiring} onTake={take} empty="三天內沒有要到期的。" />
			<Section title="不夠了" rows={short} onTake={take} empty="沒有低於安全庫存的。" />
		</ScrollView>
	);
}

function Section({
	title,
	rows,
	empty,
	onTake,
}: {
	title: string;
	rows: readonly ShelfItem[];
	empty: string;
	onTake: (item: ShelfItem) => Promise<void>;
}) {
	return (
		<View style={styles.panel}>
			<Text style={styles.section}>{title}</Text>
			{rows.length === 0 ? (
				<Text style={styles.muted}>{empty}</Text>
			) : (
				rows.map((item) => (
					<View key={item._id} style={styles.row}>
						<Text style={styles.name}>{item.name}</Text>
						<Text style={[styles.qty, item.quantity === 0 ? styles.muted : styles.hot]}>
							{item.quantity}
						</Text>
						{item.quantity > 0 && (
							<Pressable style={styles.take} onPress={() => void onTake(item)}>
								<Text style={styles.takeLabel}>拿走</Text>
							</Pressable>
						)}
					</View>
				))
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	page: { flex: 1, backgroundColor: '#f2f4f7' },
	content: { padding: 16, paddingBottom: 48 },
	top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	word: { fontSize: 16, fontWeight: '500', color: '#0a0a0a' },
	hit: { minHeight: 44, justifyContent: 'center' },
	link: { fontSize: 14, color: '#0a0a0a' },
	email: { color: '#6b6b6b', fontSize: 12 },
	spaces: { gap: 16, paddingVertical: 8 },
	spaceOn: { fontSize: 14, color: '#0a0a0a' },
	spaceOff: { fontSize: 14, color: '#6b6b6b' },
	title: { fontSize: 24, fontWeight: '500', color: '#0a0a0a', marginTop: 12 },
	figure: { fontSize: 30, color: '#1d5fbf', fontVariant: ['tabular-nums'], marginTop: 8 },
	caption: { fontSize: 12, color: '#6b6b6b' },
	note: { fontSize: 14, color: '#0a0a0a', marginTop: 8 },
	panel: { backgroundColor: '#ffffff', borderRadius: 8, padding: 16, marginTop: 12 },
	section: { fontSize: 16, fontWeight: '500', marginBottom: 4 },
	muted: { color: '#6b6b6b', fontSize: 14 },
	row: {
		minHeight: 44,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		borderTopWidth: 1,
		borderTopColor: '#f0f0f0',
	},
	name: { flex: 1, fontSize: 14, color: '#0a0a0a' },
	qty: { fontSize: 14, fontVariant: ['tabular-nums'] },
	hot: { color: '#1d5fbf' },
	take: {
		minHeight: 44,
		minWidth: 64,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#141414',
		borderRadius: 6,
		paddingHorizontal: 12,
	},
	takeLabel: { color: '#ffffff', fontSize: 14 },
});
