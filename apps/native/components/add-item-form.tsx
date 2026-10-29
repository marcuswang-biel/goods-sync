import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { api } from '@goods/backend/convex/_generated/api';
import { convexErrorCode } from '@goods/shared/convex-error';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { t, useLocale } from '@/lib/copy';
import { clientId } from '@/lib/ids';
import {
	categoryCodes,
	categoryLabel,
	shelfCodes,
	shelfLabel,
	unitCodes,
	unitLabel,
} from '@/lib/labels';
import { appFailureText } from '@/lib/messages';
import { deviceOnline } from '@/lib/network';
import { loadQueue, queueItemCreate } from '@/lib/offline-queue';
import { parseExpiry, parseStockCount } from '@/lib/shelf-view';

import { CodeField } from './code-field';
import { screen } from './screen-styles';

/** Form that places a new good on the shelf. */
export function AddItemForm({
	spaceId,
	onError,
}: {
	spaceId: Id<'spaces'>;
	onError: (message: string | null) => void;
}) {
	const create = useMutation(api.stock.create);
	const language = useLocale();
	const [name, setName] = useState('');
	const [category, setCategory] = useState<(typeof categoryCodes)[number]>('snack');
	const [unit, setUnit] = useState<(typeof unitCodes)[number]>('bag');
	const [quantity, setQuantity] = useState('1');
	const [safety, setSafety] = useState('1');
	const [expiresOn, setExpiresOn] = useState('');
	const [shelf, setShelf] = useState<(typeof shelfCodes)[number]>('cupboard');
	const [pending, setPending] = useState(false);

	const submit = async () => {
		onError(null);
		const parsedQuantity = parseStockCount(quantity);
		const parsedSafety = parseStockCount(safety);
		if (parsedQuantity === null || parsedSafety === null) {
			onError(t('badCount', language));
			return;
		}
		const expiry = parseExpiry(expiresOn);
		if (!expiry.ok) {
			onError(t('badDate', language));
			return;
		}
		if (name.trim().length === 0) {
			onError(t('needName', language));
			return;
		}
		const request = {
			clientMutationId: clientId('create'),
			name,
			category,
			unit,
			quantity: parsedQuantity,
			safetyQuantity: parsedSafety,
			expiresOn: expiry.value,
			shelf,
			occurredAt: Date.now(),
		};
		const online = await deviceOnline();
		if (!online) {
			const queue = await loadQueue();
			await queueItemCreate(queue, request);
			setName('');
			setExpiresOn('');
			onError(t('queuedTake', language));
			return;
		}
		setPending(true);
		try {
			await create({
				spaceId,
				name,
				category,
				unit,
				quantity: parsedQuantity,
				safetyQuantity: parsedSafety,
				expiresOn: expiry.value,
				shelf,
			});
			setName('');
			setExpiresOn('');
		} catch (failure) {
			const code = convexErrorCode(failure);
			if (code === 'STOCK_INVALID' || code === 'PURCHASE_INVALID') {
				onError(appFailureText(failure, language));
			} else {
				const queue = await loadQueue();
				await queueItemCreate(queue, request);
				onError(t('queuedTake', language));
			}
		} finally {
			setPending(false);
		}
	};

	return (
		<View style={screen.panel}>
			<Text style={screen.section}>{t('addGoods', language)}</Text>
			<Text style={screen.label}>{t('name', language)}</Text>
			<TextInput
				accessibilityLabel={t('name', language)}
				value={name}
				onChangeText={setName}
				style={screen.field}
			/>
			<View style={{ height: 12 }} />
			<CodeField
				label={t('kind', language)}
				value={category}
				codes={categoryCodes}
				labelOf={(code) => categoryLabel(code, language)}
				onChange={setCategory}
			/>
			<View style={{ height: 12 }} />
			<CodeField
				label={t('unit', language)}
				value={unit}
				codes={unitCodes}
				labelOf={(code) => unitLabel(code, language)}
				onChange={setUnit}
			/>
			<View style={{ height: 12 }} />
			<Text style={screen.label}>{t('quantity', language)}</Text>
			<TextInput
				accessibilityLabel={t('quantity', language)}
				value={quantity}
				onChangeText={setQuantity}
				keyboardType="number-pad"
				style={screen.field}
			/>
			<View style={{ height: 12 }} />
			<Text style={screen.label}>{t('safety', language)}</Text>
			<TextInput
				accessibilityLabel={t('safety', language)}
				value={safety}
				onChangeText={setSafety}
				keyboardType="number-pad"
				style={screen.field}
			/>
			<View style={{ height: 12 }} />
			<Text style={screen.label}>{t('expires', language)}</Text>
			<TextInput
				accessibilityLabel={t('expires', language)}
				value={expiresOn}
				onChangeText={setExpiresOn}
				placeholder="2026-12-01"
				autoCapitalize="none"
				style={screen.field}
			/>
			<View style={{ height: 12 }} />
			<CodeField
				label={t('place', language)}
				value={shelf}
				codes={shelfCodes}
				labelOf={(code) => shelfLabel(code, language)}
				onChange={setShelf}
			/>
			<View style={{ height: 12 }} />
			<Pressable
				accessibilityRole="button"
				disabled={pending}
				onPress={() => void submit()}
				style={screen.take}
			>
				<Text style={screen.takeLabel}>
					{pending ? t('putting', language) : t('put', language)}
				</Text>
			</Pressable>
		</View>
	);
}
