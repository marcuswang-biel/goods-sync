import type { Id } from '@goods/backend/convex/_generated/dataModel';
import type { OfflineOperation } from '@goods/domain/offline';

import { api } from '@goods/backend/convex/_generated/api';
import { convexErrorCode } from '@goods/shared/convex-error';
import { useMutation, useQuery } from 'convex/react';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Switch, Text, TextInput, View } from 'react-native';

import { mergeLabel, t, useLocale } from '@/lib/copy';
import { clientId } from '@/lib/ids';
import { unitLabel } from '@/lib/labels';
import { setMarket, useMarket } from '@/lib/market-mode';
import { appFailureText, rejectionMessage } from '@/lib/messages';
import { dollarsToCents, formatCents } from '@/lib/money';
import { deviceOnline } from '@/lib/network';
import {
	clearSynced,
	loadQueue,
	queuePurchaseBuy,
	queuePurchaseQuantity,
	queuePurchaseTrip,
} from '@/lib/offline-queue';
import { parseBuy, shortfallRows } from '@/lib/purchase-view';
import { flushNote, flushSteps, idsToClear } from '@/lib/sync-plan';

import { screen } from './screen-styles';
import { ShelfGate } from './shelf-gate';
import { useActiveShelf } from './use-active-shelf';

/** Phone purchases: suggest a trip, change a quantity, check it off, and flush the queue. */
export function PurchaseScreen() {
	const { active, board, pending, missing } = useActiveShelf();
	const list = useQuery(api.purchases.list, active ? { spaceId: active._id } : 'skip');
	const stockSync = useMutation(api.stock.sync);
	const createItem = useMutation(api.stock.create);
	const removeItem = useMutation(api.stock.remove);
	const sync = useMutation(api.purchases.sync);
	const setQuantity = useMutation(api.purchases.setQuantity);
	const market = useMarket();
	const language = useLocale();
	const [queue, setQueue] = useState<readonly OfflineOperation[]>([]);
	const [note, setNote] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [amounts, setAmounts] = useState<Readonly<Record<string, string>>>({});
	const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
	const [total, setTotal] = useState('');
	const [busy, setBusy] = useState(false);

	// Stable so the focus listener is not subscribed again on every render.
	const refresh = useCallback(() => {
		void loadQueue().then(setQueue);
	}, []);
	useFocusEffect(refresh);

	const purchases = list?.purchases ?? [];
	const open = purchases.filter((purchase) => purchase.status === 'open');
	const openTotal = open.reduce((sum, purchase) => sum + purchase.totalCents, 0);
	const openItemIds = open.flatMap((purchase) =>
		purchase.items.flatMap((item) => (item.itemId === null ? [] : [item.itemId])),
	);
	const rows = shortfallRows(
		(board?.items ?? []).map((item) => ({
			id: item._id,
			name: item.name,
			unit: item.unit,
			quantity: item.quantity,
			safetyQuantity: item.safetyQuantity,
		})),
		openItemIds,
	);
	const missingRows = rows.filter((row) => !row.listed);

	const buy = async (purchaseClientMutationId: string) => {
		if (!active) return;
		setError(null);
		const operation = {
			clientMutationId: clientId('buy'),
			lineClientMutationId: purchaseClientMutationId,
			occurredAt: Date.now(),
		};
		const online = !market && (await deviceOnline());
		if (online) {
			try {
				const results = await sync({
					spaceId: active._id,
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
				setNote(
					rejected ? rejectionMessage(rejected.rejectionCode, language) : t('boughtDone', language),
				);
				return;
			} catch {
				// The check stays on the phone until the next merge.
			}
		}
		const next = await queuePurchaseBuy(queue, operation);
		setQueue(next);
		setNote(t('offlineBuy', language));
	};

	const commitQuantity = async (
		purchaseItemId: Id<'purchaseItems'>,
		raw: string,
		current: number,
	) => {
		if (!active) return;
		const quantity = parseBuy(raw, 1);
		if (quantity === null) {
			setDrafts((draft) => {
				const next = { ...draft };
				delete next[purchaseItemId];
				return next;
			});
			setError(t('badBuy', language));
			return;
		}
		if (quantity === current) {
			setDrafts((draft) => {
				const next = { ...draft };
				delete next[purchaseItemId];
				return next;
			});
			return;
		}
		setError(null);
		const request = {
			clientMutationId: clientId('qty'),
			purchaseItemId,
			quantity,
			occurredAt: Date.now(),
		};
		const online = await deviceOnline();
		if (!online) {
			const next = await queuePurchaseQuantity(queue, request);
			setQueue(next);
			setNote(t('queuedTake', language));
			return;
		}
		try {
			await setQuantity({ spaceId: active._id, purchaseItemId, quantity });
			setDrafts((draft) => {
				const next = { ...draft };
				delete next[purchaseItemId];
				return next;
			});
		} catch (failure) {
			const code = convexErrorCode(failure);
			if (code === 'PURCHASE_INVALID') {
				setError(appFailureText(failure, language));
				return;
			}
			const next = await queuePurchaseQuantity(queue, request);
			setQueue(next);
			setNote(t('queuedTake', language));
		}
	};

	const createTrip = async () => {
		if (!active || missingRows.length === 0 || busy) return;
		setError(null);
		const totalCents = dollarsToCents(total);
		if (totalCents === null) {
			setError(t('needTotal', language));
			return;
		}
		const lines: { itemId: Id<'items'>; quantity: number }[] = [];
		for (const row of missingRows) {
			const quantity = parseBuy(amounts[row.id] ?? String(row.buy));
			if (quantity === null) {
				setError(t('badDraft', language));
				return;
			}
			if (quantity > 0) lines.push({ itemId: row.id, quantity });
		}
		if (lines.length === 0) {
			setError(t('needOne', language));
			return;
		}
		const request = {
			clientMutationId: clientId('add'),
			totalCents,
			occurredAt: Date.now(),
			items: lines,
		};
		const online = await deviceOnline();
		if (!online) {
			const next = await queuePurchaseTrip(queue, request);
			setQueue(next);
			setAmounts({});
			setTotal('');
			setNote(t('queuedTake', language));
			return;
		}
		setBusy(true);
		try {
			const results = await sync({
				spaceId: active._id,
				ops: [{ tag: 'add', ...request }],
			});
			const rejected = results.find((row) => row.outcome === 'rejected');
			if (rejected) setError(rejectionMessage(rejected.rejectionCode, language));
			else {
				setAmounts({});
				setTotal('');
				setNote(t('created', language));
			}
		} catch (failure) {
			const code = convexErrorCode(failure);
			if (code === 'PURCHASE_INVALID') {
				setError(appFailureText(failure, language));
			} else {
				const next = await queuePurchaseTrip(queue, request);
				setQueue(next);
				setNote(t('queuedTake', language));
			}
		} finally {
			setBusy(false);
		}
	};

	const flush = async () => {
		if (!active) return;
		setError(null);
		const clear: string[] = [];
		let failureText: string | null = null;
		for (const step of flushSteps(queue)) {
			try {
				if (step.tag === 'item-create') {
					const row = step.operation;
					await createItem({
						spaceId: active._id,
						name: row.name,
						category: row.category,
						unit: row.unit,
						quantity: row.quantity,
						safetyQuantity: row.safetyQuantity,
						expiresOn: row.expiresOn,
						shelf: row.shelf,
					});
					clear.push(row.clientMutationId);
				} else if (step.tag === 'movements') {
					// SAFETY: the queue stores the item id this phone read from the shelf query.
					const storedItemId = step.itemId as Id<'items'>;
					const results = await stockSync({
						spaceId: active._id,
						itemId: storedItemId,
						ops: step.ops,
					});
					clear.push(...idsToClear(results.results));
				} else if (step.tag === 'item-remove') {
					// SAFETY: the queue stores the item id this phone read from the shelf query.
					const storedItemId = step.operation.itemId as Id<'items'>;
					await removeItem({ spaceId: active._id, itemId: storedItemId });
					clear.push(step.operation.clientMutationId);
				} else if (step.tag === 'purchase-trip') {
					const results = await sync({
						spaceId: active._id,
						ops: [
							{
								tag: 'add',
								clientMutationId: step.operation.clientMutationId,
								totalCents: step.operation.totalCents,
								occurredAt: step.operation.occurredAt,
								items: step.operation.items.map((item) => ({
									// SAFETY: the queue stores item ids this phone read from the shelf query.
									itemId: item.itemId as Id<'items'>,
									quantity: item.quantity,
								})),
							},
						],
					});
					clear.push(...idsToClear(results));
				} else if (step.tag === 'purchase-quantity') {
					await setQuantity({
						spaceId: active._id,
						// SAFETY: the queue stores the purchase line id this phone read from the list.
						purchaseItemId: step.operation.purchaseItemId as Id<'purchaseItems'>,
						quantity: step.operation.quantity,
					});
					clear.push(step.operation.clientMutationId);
				} else {
					const results = await sync({ spaceId: active._id, ops: step.ops });
					clear.push(...idsToClear(results));
				}
			} catch (failure) {
				failureText = appFailureText(failure, language);
			}
		}
		const next = await clearSynced(queue, clear);
		setQueue(next);
		setNote(flushNote(next, clear.length, language));
		if (failureText) setError(failureText);
	};

	return (
		<ShelfGate pending={pending || (active !== null && list === undefined)} missing={missing}>
			{active && (
				<FlatList
					style={screen.page}
					contentContainerStyle={screen.content}
					data={purchases}
					keyExtractor={(purchase) => purchase._id}
					keyboardShouldPersistTaps="handled"
					ListHeaderComponent={
						<View>
							<Text style={screen.title}>{t('purchases', language)}</Text>
							<Text style={[screen.figure, { color: '#0a0a0a', fontWeight: '700' }]}>
								{formatCents(openTotal)}
							</Text>
							<Text style={screen.caption}>{t('openTotal', language)}</Text>
							<View style={[screen.row, { borderTopWidth: 0 }]}>
								<Text style={screen.name}>{t('supermarket', language)}</Text>
								<Switch
									accessibilityLabel={t('supermarket', language)}
									value={market}
									onValueChange={setMarket}
								/>
							</View>
							{error && <Text style={screen.error}>{error}</Text>}
							{note && <Text style={screen.note}>{note}</Text>}
							{queue.length > 0 && (
								<Pressable
									accessibilityRole="button"
									onPress={() => void flush()}
									style={[screen.take, { marginTop: 12 }]}
								>
									<Text style={screen.takeLabel}>{mergeLabel(queue.length, language)}</Text>
								</Pressable>
							)}
							<View style={screen.panel}>
								<Text style={screen.section}>{t('underSafety', language)}</Text>
								{rows.length === 0 ? (
									<Text style={screen.muted}>{t('noneUnder', language)}</Text>
								) : (
									rows.map((row) => (
										<View key={row.id} style={screen.row}>
											<Text style={screen.name}>{row.name}</Text>
											{row.listed ? (
												<Text style={screen.caption}>{t('listed', language)}</Text>
											) : (
												<TextInput
													accessibilityLabel={`${t('restock', language)} ${row.name}`}
													value={amounts[row.id] ?? String(row.buy)}
													onChangeText={(value) =>
														setAmounts((current) => ({ ...current, [row.id]: value }))
													}
													keyboardType="number-pad"
													style={[screen.field, { width: 64, textAlign: 'right' }]}
												/>
											)}
										</View>
									))
								)}
								{missingRows.length > 0 && (
									<View style={{ marginTop: 12, gap: 12 }}>
										<Text style={screen.label}>{t('total', language)}</Text>
										<TextInput
											accessibilityLabel={t('total', language)}
											value={total}
											onChangeText={setTotal}
											keyboardType="decimal-pad"
											style={screen.field}
										/>
										<Pressable
											accessibilityRole="button"
											disabled={busy}
											onPress={() => void createTrip()}
											style={screen.take}
										>
											<Text style={screen.takeLabel}>
												{busy ? t('creating', language) : t('createRecords', language)}
											</Text>
										</Pressable>
									</View>
								)}
							</View>
							<Text style={[screen.section, { marginTop: 16 }]}>{t('records', language)}</Text>
						</View>
					}
					ListEmptyComponent={<Text style={screen.muted}>{t('emptyList', language)}</Text>}
					renderItem={({ item: purchase }) => (
						<View style={screen.panel}>
							{purchase.items.map((item) => (
								<View key={item._id} style={screen.row}>
									<Text style={screen.name}>{item.name}</Text>
									{purchase.status === 'open' ? (
										<TextInput
											accessibilityLabel={`${t('restock', language)} ${item.name}`}
											value={drafts[item._id] ?? String(item.quantity)}
											onChangeText={(value) =>
												setDrafts((current) => ({ ...current, [item._id]: value }))
											}
											onEndEditing={(event) =>
												void commitQuantity(item._id, event.nativeEvent.text, item.quantity)
											}
											keyboardType="number-pad"
											style={[screen.field, { width: 64, textAlign: 'right' }]}
										/>
									) : (
										<Text style={screen.muted}>
											{t('restock', language)} {item.quantity}
											{item.unit ? ` ${unitLabel(item.unit, language)}` : ''}
										</Text>
									)}
								</View>
							))}
							<View style={screen.row}>
								{purchase.status === 'bought' && (
									<Text style={screen.caption}>{t('bought', language)}</Text>
								)}
								<Text style={[screen.name, { textAlign: 'right', fontWeight: '700' }]}>
									{formatCents(purchase.totalCents)}
								</Text>
								{purchase.status === 'open' && (
									<Pressable
										accessibilityRole="button"
										onPress={() => void buy(purchase.clientMutationId)}
										style={purchase._id === open[0]?._id ? screen.take : screen.ghost}
									>
										<Text style={purchase._id === open[0]?._id ? screen.takeLabel : undefined}>
											{t('bought', language)}
										</Text>
									</Pressable>
								)}
							</View>
						</View>
					)}
				/>
			)}
		</ShelfGate>
	);
}
