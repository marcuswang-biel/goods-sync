import { api } from '@goods/backend/convex/_generated/api';
import { isExpiring, isShort } from '@goods/domain/stock';
import { convexErrorCode } from '@goods/shared/convex-error';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { queueHint, removeAsk, t, useLocale } from '@/lib/copy';
import { clientId } from '@/lib/ids';
import { shelfLabel, unitLabel } from '@/lib/labels';
import { appFailureText } from '@/lib/messages';
import { deviceOnline } from '@/lib/network';
import { loadQueue, queueItemRemove } from '@/lib/offline-queue';
import { filterByName, shelfEmptyMessage } from '@/lib/shelf-view';

import { AddItemForm } from './add-item-form';
import { screen } from './screen-styles';
import { ShelfGate } from './shelf-gate';
import { useActiveShelf, type ShelfItem } from './use-active-shelf';
import { useConsume } from './use-consume';

/** Full shelf: search, add, take, and remove. */
export function ShelfScreen() {
	const { active, board, pending, missing } = useActiveShelf();
	const { take, note, queued, market } = useConsume(active?._id);
	const language = useLocale();
	const remove = useMutation(api.stock.remove);
	const [query, setQuery] = useState('');
	const [adding, setAdding] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const items = filterByName(board?.items ?? [], query);

	const confirmRemove = (item: ShelfItem) => {
		if (!active) return;
		Alert.alert(t('remove', language), removeAsk(item.name, language), [
			{ text: t('cancel', language), style: 'cancel' },
			{
				text: t('remove', language),
				style: 'destructive',
				onPress: () => {
					void (async () => {
						const request = {
							clientMutationId: clientId('remove'),
							itemId: item._id,
							occurredAt: Date.now(),
						};
						const online = await deviceOnline();
						if (!online) {
							const queue = await loadQueue();
							await queueItemRemove(queue, request);
							setError(t('queuedTake', language));
							return;
						}
						try {
							await remove({ spaceId: active._id, itemId: item._id });
						} catch (failure: unknown) {
							const code = convexErrorCode(failure);
							if (code === 'NOT_FOUND') return;
							if (code === 'STOCK_INVALID') {
								setError(appFailureText(failure, language));
								return;
							}
							const queue = await loadQueue();
							await queueItemRemove(queue, request);
							setError(t('queuedTake', language));
						}
					})();
				},
			},
		]);
	};

	return (
		<ShelfGate pending={pending} missing={missing}>
			{active && (
				<FlatList
					style={screen.page}
					contentContainerStyle={screen.content}
					data={items}
					keyExtractor={(item) => item._id}
					keyboardShouldPersistTaps="handled"
					ListHeaderComponent={
						<View>
							<View
								style={{
									flexDirection: 'row',
									justifyContent: 'space-between',
									alignItems: 'baseline',
								}}
							>
								<Text style={screen.title}>{t('shelf', language)}</Text>
								<Text style={screen.muted}>
									{items.length} {t('samples', language)}
								</Text>
							</View>
							<Pressable
								accessibilityRole="button"
								onPress={() => setAdding((open) => !open)}
								style={[screen.ghost, { alignSelf: 'flex-start', paddingHorizontal: 0 }]}
							>
								<Text>{adding ? t('collapse', language) : t('addGoods', language)}</Text>
							</Pressable>
							{adding && <AddItemForm spaceId={active._id} onError={setError} />}
							{market && <Text style={screen.note}>{t('marketTakes', language)}</Text>}
							<Text style={[screen.label, { marginTop: 12 }]}>{t('search', language)}</Text>
							<TextInput
								accessibilityLabel={t('search', language)}
								value={query}
								onChangeText={setQuery}
								autoCapitalize="none"
								style={screen.field}
							/>
							{error && <Text style={screen.error}>{error}</Text>}
							{note && <Text style={screen.note}>{note}</Text>}
							{queued > 0 && <Text style={screen.note}>{queueHint(queued, language)}</Text>}
						</View>
					}
					ListEmptyComponent={
						<Text style={[screen.muted, { marginTop: 16 }]}>
							{shelfEmptyMessage(query, language)}
						</Text>
					}
					renderItem={({ item }) => (
						<View style={screen.row}>
							<View style={{ flex: 1 }}>
								<Text style={{ fontSize: 14, color: '#0a0a0a' }}>{item.name}</Text>
								<Text style={screen.caption}>
									{shelfLabel(item.shelf, language)}
									{isExpiring(item.freshness) ? ` · ${t('expiring', language)}` : ''}
									{!isExpiring(item.freshness) && isShort(item.supply)
										? ` · ${t('short', language)}`
										: ''}
								</Text>
							</View>
							<Text style={item.quantity === 0 ? screen.muted : screen.qty}>
								{item.quantity} {unitLabel(item.unit, language)}
							</Text>
							{item.quantity > 0 && (
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={`${t('take', language)} ${item.name}`}
									onPress={() => void take(item)}
									style={screen.take}
								>
									<Text style={screen.takeLabel}>{t('take', language)}</Text>
								</Pressable>
							)}
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={`${t('remove', language)} ${item.name}`}
								onPress={() => confirmRemove(item)}
								style={screen.ghost}
							>
								<Text>{t('remove', language)}</Text>
							</Pressable>
						</View>
					)}
				/>
			)}
		</ShelfGate>
	);
}
