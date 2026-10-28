import { convexQuery } from '@convex-dev/react-query';
import { api } from '@goods/backend/convex/_generated/api';
import { useQuery } from '@tanstack/react-query';

/** The one place this account keeps stock in. */
export function useActiveSpace(enabled = true) {
	const spaces = useQuery({ ...convexQuery(api.spaces.listMine, {}), enabled });
	const list = spaces.data ?? [];

	return {
		active: list[0] ?? null,
		isPending: spaces.isPending,
		isError: spaces.isError,
	};
}
