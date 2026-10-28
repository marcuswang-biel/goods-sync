import { useConvexAuth } from 'convex/react';
import { Link } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SignInScreen } from '@/auth';
import { PantryHome } from '@/components/pantry-home';

export default function HomeScreen() {
	const { isAuthenticated, isLoading } = useConvexAuth();

	if (isLoading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator />
			</View>
		);
	}
	if (!isAuthenticated) return <SignInScreen />;
	return (
		<View style={styles.page}>
			<PantryHome />
			<Link href="/purchases" style={styles.tab}>
				<Text style={styles.tabLabel}>採購</Text>
			</Link>
		</View>
	);
}

const styles = StyleSheet.create({
	page: { flex: 1, backgroundColor: '#f2f4f7' },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	tab: {
		minHeight: 48,
		alignItems: 'center',
		justifyContent: 'center',
		borderTopWidth: 1,
		borderTopColor: '#e6e6e6',
	},
	tabLabel: { fontSize: 14, color: '#0a0a0a' },
});
