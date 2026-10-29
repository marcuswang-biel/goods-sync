import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { setLocale, t, useLocale } from '@/lib/copy';

import { authClient } from './auth-client';

/** Email and password sign-in, or a new account, against the same auth as the web app. */
export function SignInScreen() {
	const language = useLocale();
	const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const handleSubmit = async () => {
		setPending(true);
		setError(null);
		const result =
			mode === 'signIn'
				? await authClient.signIn.email({ email: email.trim(), password })
				: await authClient.signUp.email({
						email: email.trim(),
						password,
						name: name.trim() || email.trim(),
					});
		setPending(false);
		if (result.error) setError(result.error.message ?? t('signInFailed', language));
	};

	return (
		<SafeAreaView style={styles.page}>
			<View style={styles.form}>
				<View style={styles.top}>
					<Text style={styles.title}>
						{mode === 'signIn' ? t('signIn', language) : t('signUp', language)}
					</Text>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t('language', language)}
						onPress={() => setLocale(language === 'en' ? 'zh-Hant' : 'en')}
						style={styles.lang}
					>
						<Text>{t('language', language)}</Text>
					</Pressable>
				</View>
				{mode === 'signUp' && (
					<TextInput
						accessibilityLabel={t('name', language)}
						style={styles.input}
						placeholder={t('name', language)}
						autoComplete="name"
						value={name}
						onChangeText={setName}
					/>
				)}
				<TextInput
					accessibilityLabel={t('email', language)}
					style={styles.input}
					placeholder="dev@example.com"
					autoCapitalize="none"
					autoComplete="email"
					keyboardType="email-address"
					value={email}
					onChangeText={setEmail}
				/>
				<TextInput
					accessibilityLabel={t('password', language)}
					style={styles.input}
					placeholder={t('password', language)}
					secureTextEntry
					autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
					value={password}
					onChangeText={setPassword}
				/>
				{error && <Text style={styles.error}>{error}</Text>}
				<Pressable
					accessibilityRole="button"
					style={styles.button}
					onPress={() => void handleSubmit()}
					disabled={pending}
				>
					{pending ? (
						<ActivityIndicator color="#ffffff" />
					) : (
						<Text style={styles.buttonText}>
							{mode === 'signIn' ? t('signIn', language) : t('signUp', language)}
						</Text>
					)}
				</Pressable>
				<Pressable
					accessibilityRole="button"
					onPress={() => {
						setMode(mode === 'signIn' ? 'signUp' : 'signIn');
						setError(null);
					}}
					style={styles.link}
				>
					<Text>{mode === 'signIn' ? t('noAccount', language) : t('haveAccount', language)}</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	page: { flex: 1, backgroundColor: '#f2f4f7' },
	form: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
	top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	title: { fontSize: 24, fontWeight: '500', color: '#0a0a0a', marginBottom: 8 },
	lang: { minHeight: 44, justifyContent: 'center' },
	input: {
		borderWidth: 1,
		borderColor: '#e6e6e6',
		borderRadius: 8,
		backgroundColor: '#ffffff',
		padding: 12,
		fontSize: 16,
		color: '#0a0a0a',
		minHeight: 44,
	},
	error: { color: '#c4242a', fontSize: 14 },
	button: {
		backgroundColor: '#141414',
		borderRadius: 8,
		minHeight: 44,
		alignItems: 'center',
		justifyContent: 'center',
	},
	buttonText: { color: '#ffffff', fontWeight: '500', fontSize: 16 },
	link: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
