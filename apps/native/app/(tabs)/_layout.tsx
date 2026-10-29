import { Tabs } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useSignOut } from '@/auth';
import { setLocale, t, useLocale } from '@/lib/copy';

function SignOutButton() {
	const signOut = useSignOut();
	const language = useLocale();
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center' }}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t('language', language)}
				onPress={() => setLocale(language === 'en' ? 'zh-Hant' : 'en')}
				style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
			>
				<Text style={{ fontSize: 14, color: '#0a0a0a' }}>{t('language', language)}</Text>
			</Pressable>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t('signOut', language)}
				onPress={() => void signOut()}
				style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}
			>
				<Text style={{ fontSize: 14, color: '#0a0a0a' }}>{t('signOut', language)}</Text>
			</Pressable>
		</View>
	);
}

/** The three jobs on the phone: the board, the shelf, and purchases. */
export default function TabsLayout() {
	const language = useLocale();
	return (
		<Tabs
			screenOptions={{
				headerTitle: t('goods', language),
				headerStyle: { backgroundColor: '#f2f4f7' },
				headerShadowVisible: false,
				headerRight: SignOutButton,
				tabBarActiveTintColor: '#0a0a0a',
				tabBarInactiveTintColor: '#6b6b6b',
				tabBarStyle: { backgroundColor: '#f2f4f7', borderTopColor: '#e6e6e6' },
			}}
		>
			<Tabs.Screen name="index" options={{ title: t('board', language) }} />
			<Tabs.Screen name="shelf" options={{ title: t('shelf', language) }} />
			<Tabs.Screen name="purchases" options={{ title: t('purchases', language) }} />
		</Tabs>
	);
}
