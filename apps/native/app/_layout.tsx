import { api } from '@goods/backend/convex/_generated/api';
import { useConvexAuth, useMutation } from 'convex/react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider } from '@/auth';
import { convex } from '@/lib/convex';

/** Gives a signed-in account their shelf before the home screen reads it. */
function EnsureShelf() {
	const { isAuthenticated } = useConvexAuth();
	const ensure = useMutation(api.spaces.ensureMine);
	useEffect(() => {
		if (!isAuthenticated) return;
		void ensure({});
	}, [isAuthenticated, ensure]);
	return null;
}

/** Phone shell: auth, then a stack titled 物資. */
export default function RootLayout() {
	return (
		<AuthProvider client={convex}>
			<EnsureShelf />
			<Stack screenOptions={{ headerTitle: '物資' }} />
			<StatusBar style="auto" />
		</AuthProvider>
	);
}
