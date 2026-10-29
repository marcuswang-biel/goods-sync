import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { api } from '@goods/backend/convex/_generated/api';
import { useMutation } from 'convex/react';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { t, useLocale } from '@/lib/copy';
import { clientId } from '@/lib/ids';
import { getMarket, useMarket } from '@/lib/market-mode';
import { takeNote } from '@/lib/messages';
import { deviceOnline } from '@/lib/network';
import { loadQueue, queueMovement } from '@/lib/offline-queue';
import { lastQueuedMovement } from '@/lib/sync-plan';

/** Takes one unit. Supermarket mode and a dead network keep it on the phone. */
export function useConsume(spaceId: Id<'spaces'> | undefined) {
	const sync = useMutation(api.stock.sync);
	const language = useLocale();
	const market = useMarket();
	const [note, setNote] = useState<string | null>(null);
	const [queued, setQueued] = useState(0);

	// Stable so the focus listener is not subscribed again on every render.
	const refresh = useCallback(() => {
		void loadQueue().then((queue) => setQueued(queue.length));
	}, []);
	useFocusEffect(refresh);

	const take = async (item: { _id: Id<'items'>; version: number }) => {
		if (!spaceId) return;
		const occurredAt = Date.now();
		const clientMutationId = clientId('take');
		const queue = await loadQueue();
		const parent = lastQueuedMovement(queue, item._id);
		const online = !getMarket() && (await deviceOnline());
		if (online) {
			try {
				const result = await sync({
					spaceId,
					itemId: item._id,
					ops: [
						{
							clientMutationId,
							kind: 'consume',
							quantity: 1,
							occurredAt,
							causalParentClientId: parent,
							observedVersion: item.version,
						},
					],
				});
				setNote(takeNote(result.results, language));
				return;
			} catch {
				// The take stays on the phone until the next merge.
			}
		}
		const next = await queueMovement(queue, {
			clientMutationId,
			itemId: item._id,
			kind: 'consume',
			quantity: 1,
			occurredAt,
			observedVersion: item.version,
		});
		setQueued(next.length);
		setNote(t('queuedTake', language));
	};

	return { take, note, queued, market };
}
