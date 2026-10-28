import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PurchaseScreen } from '@/components/purchase-screen';

export default function PurchasesRoute() {
	return (
		<View style={styles.page}>
			<PurchaseScreen />
			<Link href="/" style={styles.tab}>
				<Text style={styles.tabLabel}>貨架</Text>
			</Link>
		</View>
	);
}

const styles = StyleSheet.create({
	page: { flex: 1, backgroundColor: '#f2f4f7' },
	tab: {
		minHeight: 48,
		alignItems: 'center',
		justifyContent: 'center',
		borderTopWidth: 1,
		borderTopColor: '#e6e6e6',
	},
	tabLabel: { fontSize: 14, color: '#0a0a0a' },
});
