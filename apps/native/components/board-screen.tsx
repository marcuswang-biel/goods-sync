import type { ReactNode } from 'react';

import { isAttention, isExpiring, isShort } from '@goods/domain/stock';
import { router } from 'expo-router';
import { Pressable, SectionList, Text, View } from 'react-native';

import { queueHint, t, useLocale } from '@/lib/copy';
import { shelfLabel, unitLabel } from '@/lib/labels';
import { groupByShelf } from '@/lib/shelf-view';

import { screen } from './screen-styles';
import { ShelfGate } from './shelf-gate';
import { useActiveShelf, type ShelfItem } from './use-active-shelf';
import { useConsume } from './use-consume';

/** Phone board: the shelf by location, recent takes, and what needs attention. */
export function BoardScreen() {
	const { active, board, pending, missing } = useActiveShelf();
	const { take, note, queued, market } = useConsume(active?._id);
	const language = useLocale();
	const items = board?.items ?? [];
	const sections = groupByShelf(items).map((group) => ({
		title: shelfLabel(group.shelf, language),
		data: group.items,
	}));
	const attention = items.filter((item) => isAttention(item)).length;
	const expiring = items.filter((item) => isExpiring(item.freshness)).slice(0, 4);
	const short = items.filter((item) => isShort(item.supply)).slice(0, 4);
	const movements = (board?.movements ?? []).slice(0, 4);

	return (
		<ShelfGate pending={pending} missing={missing}>
			<SectionList
				style={screen.page}
				contentContainerStyle={screen.content}
				sections={sections}
				keyExtractor={(item) => item._id}
				stickySectionHeadersEnabled={false}
				ListHeaderComponent={
					<View>
						<Text style={screen.title}>{t('board', language)}</Text>
						<Text style={[screen.figure, attention === 0 && screen.muted]}>{attention}</Text>
						<Text style={screen.caption}>{t('attention', language)}</Text>
						{market && <Text style={screen.note}>{t('marketTakes', language)}</Text>}
						{note && <Text style={screen.note}>{note}</Text>}
						{queued > 0 && <Text style={screen.note}>{queueHint(queued, language)}</Text>}
					</View>
				}
				renderSectionHeader={({ section }) => (
					<Text style={[screen.caption, { marginTop: 16 }]}>{section.title}</Text>
				)}
				renderItem={({ item }) => <ItemRow item={item} onTake={take} />}
				ListEmptyComponent={<Text style={screen.muted}>{t('noGoods', language)}</Text>}
				ListFooterComponent={
					<View>
						<Queue
							title={t('recent', language)}
							hasRows={movements.length > 0}
							empty={t('noTakes', language)}
						>
							{movements.map((movement) => (
								<View key={movement._id} style={screen.row}>
									<Text style={screen.name}>
										{movement.actorLabel}{' '}
										{movement.kind === 'consume' ? t('took', language) : t('putBack', language)}{' '}
										{movement.quantity} {unitLabel(movement.unit, language)} {movement.itemName}
									</Text>
									{movement.outcome === 'rejected' && (
										<Text style={screen.error}>{t('missed', language)}</Text>
									)}
								</View>
							))}
						</Queue>
						<Queue
							title={t('expiring', language)}
							hasRows={expiring.length > 0}
							empty={t('noExpiring', language)}
						>
							{expiring.map((item) => (
								<AmountLine key={item._id} item={item} />
							))}
						</Queue>
						<Queue
							title={t('short', language)}
							hasRows={short.length > 0}
							empty={t('noShort', language)}
						>
							{short.map((item) => (
								<AmountLine key={item._id} item={item} />
							))}
							{short.length > 0 && (
								<Pressable
									accessibilityRole="button"
									onPress={() => router.push('/purchases')}
									style={screen.ghost}
								>
									<Text>{t('buyThese', language)}</Text>
								</Pressable>
							)}
						</Queue>
					</View>
				}
			/>
		</ShelfGate>
	);
}

function ItemRow({
	item,
	onTake,
}: {
	item: ShelfItem;
	onTake: (item: ShelfItem) => Promise<void>;
}) {
	const language = useLocale();
	const flag = isExpiring(item.freshness)
		? t('expiring', language)
		: isShort(item.supply)
			? t('short', language)
			: null;
	return (
		<View style={screen.row}>
			<Text style={screen.name}>{item.name}</Text>
			{flag && isAttention(item) && item.quantity > 0 && <Text style={screen.caption}>{flag}</Text>}
			<Text style={item.quantity === 0 ? screen.muted : screen.qty}>
				{item.quantity} {unitLabel(item.unit, language)}
			</Text>
			{item.quantity > 0 && (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`${t('take', language)} ${item.name}`}
					onPress={() => void onTake(item)}
					style={screen.take}
				>
					<Text style={screen.takeLabel}>{t('take', language)}</Text>
				</Pressable>
			)}
		</View>
	);
}

function AmountLine({ item }: { item: ShelfItem }) {
	const language = useLocale();
	return (
		<View style={screen.row}>
			<Text style={screen.name}>{item.name}</Text>
			<Text style={screen.muted}>
				{item.expiresOn ?? '—'} {item.quantity} {unitLabel(item.unit, language)}
			</Text>
		</View>
	);
}

function Queue({
	title,
	empty,
	hasRows,
	children,
}: {
	title: string;
	empty: string;
	hasRows: boolean;
	children: ReactNode;
}) {
	return (
		<View style={screen.panel}>
			<Text style={screen.section}>{title}</Text>
			{hasRows ? children : <Text style={screen.muted}>{empty}</Text>}
		</View>
	);
}
