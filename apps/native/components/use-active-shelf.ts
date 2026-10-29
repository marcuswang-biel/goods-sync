import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { api } from '@goods/backend/convex/_generated/api';
import { useQuery } from 'convex/react';

import { todayIso } from '@/lib/shelf-view';

/** The shelf this account belongs to, and the board query for today. */
export function useActiveShelf() {
	const spaces = useQuery(api.spaces.listMine);
	const active = spaces?.[0] ?? null;
	const board = useQuery(
		api.stock.board,
		active ? { spaceId: active._id, today: todayIso() } : 'skip',
	);
	return {
		active,
		board,
		pending: spaces === undefined || (active !== null && board === undefined),
		missing: spaces !== undefined && spaces.length === 0,
	};
}

/** A shelf row the phone can take from. */
export type ShelfItem = {
	_id: Id<'items'>;
	name: string;
	unit: 'carton' | 'slab' | 'bag' | 'roll' | 'bottle' | 'ream' | 'can' | 'piece';
	quantity: number;
	safetyQuantity: number;
	expiresOn: string | null;
	shelf: 'fridge' | 'tearoom' | 'washroom' | 'sink' | 'cupboard' | 'printroom';
	version: number;
	freshness: 'undated' | 'ok' | 'soon' | 'expired';
	supply: 'ok' | 'low' | 'out';
};
