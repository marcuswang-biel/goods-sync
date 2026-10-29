import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';

import { t, useLocale } from '@/lib/copy';

import { screen } from './screen-styles';

/** A field that opens a list of stored codes and shows the Chinese label. */
export function CodeField<Code extends string>({
	label,
	value,
	codes,
	labelOf,
	onChange,
}: {
	label: string;
	value: Code;
	codes: readonly Code[];
	labelOf: (code: Code) => string;
	onChange: (code: Code) => void;
}) {
	const language = useLocale();
	const [open, setOpen] = useState(false);
	return (
		<View>
			<Text style={screen.label}>{label}</Text>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={label}
				onPress={() => setOpen(true)}
				style={screen.field}
			>
				<Text style={{ fontSize: 16, color: '#0a0a0a' }}>{labelOf(value)}</Text>
			</Pressable>
			<Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t('close', language)}
					onPress={() => setOpen(false)}
					style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,10,10,0.4)' }}
				>
					<View
						style={{
							maxHeight: '70%',
							backgroundColor: '#ffffff',
							borderTopLeftRadius: 8,
							borderTopRightRadius: 8,
						}}
					>
						<FlatList
							data={codes}
							keyExtractor={(code) => code}
							renderItem={({ item }) => (
								<Pressable
									accessibilityRole="button"
									onPress={() => {
										onChange(item);
										setOpen(false);
									}}
									style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}
								>
									<Text style={{ fontSize: 16, color: item === value ? '#1d5fbf' : '#0a0a0a' }}>
										{labelOf(item)}
									</Text>
								</Pressable>
							)}
						/>
					</View>
				</Pressable>
			</Modal>
		</View>
	);
}
