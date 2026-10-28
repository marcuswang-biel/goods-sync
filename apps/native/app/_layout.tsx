import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/auth';
import { convex } from '@/lib/convex';

/** Phone shell: auth, then a stack titled 物資. */
export default function RootLayout() {
	return (
		<AuthProvider client={convex}>
			<Stack screenOptions={{ headerTitle: '物資' }} />
			<StatusBar style="auto" />
		</AuthProvider>
	);
}
