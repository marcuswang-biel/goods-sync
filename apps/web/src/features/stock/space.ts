import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { convexQuery } from '@convex-dev/react-query';
import { api } from '@goods/backend/convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

const SPACE_KEY = 'goods-active-space';

function storedSpaceId(): string | null {
	if (typeof window === 'undefined') return null;
	return window.localStorage.getItem(SPACE_KEY);
}

/** The spaces this account belongs to, and the one the board is showing. */
export function useActiveSpace(enabled = true) {
	const spaces = useQuery({ ...convexQuery(api.spaces.listMine, {}), enabled });
	const [picked, setPicked] = useState<string | null>(storedSpaceId);
	const list = spaces.data ?? [];
	const active = list.find((space) => space._id === picked) ?? list[0] ?? null;

	const select = (spaceId: Id<'spaces'>) => {
		setPicked(spaceId);
		window.localStorage.setItem(SPACE_KEY, spaceId);
	};

	return {
		spaces: list,
		active,
		select,
		isPending: spaces.isPending,
		isError: spaces.isError,
	};
}
