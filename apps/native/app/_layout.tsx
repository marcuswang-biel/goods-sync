import { useConvexAuth } from 'convex/react';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, SignInScreen } from '@/auth';
import { EnsureShelf } from '@/components/ensure-shelf';
import { convex } from '@/lib/convex';
import { loadLocale } from '@/lib/copy';

/** Phone shell: sign in, or the three tabs. */
export default function RootLayout() {
	useEffect(() => {
		void loadLocale();
	}, []);
	return (
		<AuthProvider client={convex}>
			<EnsureShelf />
			<StatusBar style="auto" />
			<Gate />
		</AuthProvider>
	);
}

function Gate() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	if (isLoading) {
		return (
			<View
				style={{
					flex: 1,
					alignItems: 'center',
					justifyContent: 'center',
					backgroundColor: '#f2f4f7',
				}}
			>
				<ActivityIndicator />
			</View>
		);
	}
	if (!isAuthenticated) return <SignInScreen />;
	return <Slot />;
}
