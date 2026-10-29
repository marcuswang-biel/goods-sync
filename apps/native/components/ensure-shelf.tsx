import { api } from '@goods/backend/convex/_generated/api';
import { useConvexAuth, useMutation } from 'convex/react';
import { useEffect } from 'react';

/** Gives a signed-in account their shelf before a tab reads it. */
export function EnsureShelf() {
	const { isAuthenticated } = useConvexAuth();
	const ensure = useMutation(api.spaces.ensureMine);
	useEffect(() => {
		if (!isAuthenticated) return;
		void ensure({});
	}, [isAuthenticated, ensure]);
	return null;
}
