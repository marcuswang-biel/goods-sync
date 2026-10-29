import type { ReactNode } from 'react';

import { ActivityIndicator, Text, View } from 'react-native';

import { t, useLocale } from '@/lib/copy';

import { screen } from './screen-styles';

/** Loading and missing-shelf states shared by the three tabs. */
export function ShelfGate({
	pending,
	missing,
	children,
}: {
	pending: boolean;
	missing: boolean;
	children: ReactNode;
}) {
	const language = useLocale();
	if (pending) {
		return (
			<View style={screen.center}>
				<ActivityIndicator />
				<Text style={screen.muted}>{t('loading', language)}</Text>
			</View>
		);
	}
	if (missing) {
		return (
			<View style={screen.center}>
				<Text style={screen.muted}>{t('noShelf', language)}</Text>
			</View>
		);
	}
	return children;
}
