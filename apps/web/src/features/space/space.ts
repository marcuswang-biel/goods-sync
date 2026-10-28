import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { api } from '@goods/backend/convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/** The shelf this account belongs to. A new account receives an empty one. */
export function useActiveSpace(enabled = true) {
	const ensure = useConvexMutation(api.spaces.ensureMine);
	const [ensured, setEnsured] = useState(false);
	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		void ensure({})
			.catch(() => undefined)
			.finally(() => {
				if (!cancelled) setEnsured(true);
			});
		return () => {
			cancelled = true;
		};
	}, [enabled, ensure]);

	const spaces = useQuery({ ...convexQuery(api.spaces.listMine, {}), enabled });
	const list = spaces.data ?? [];

	return {
		active: list[0] ?? null,
		isPending: spaces.isPending || (enabled && !ensured),
		isError: spaces.isError,
	};
}
