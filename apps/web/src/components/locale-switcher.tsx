import { useLingui } from '@lingui/react/macro';
import { Earth } from 'lucide-react';

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { activateLocale, isAppLocale, SOURCE_LOCALE, type AppLocale } from '@/lib/i18n';

/** Short names shown in the language menu. */
const SHORT_LABELS: Record<AppLocale, string> = {
	en: 'EN',
	'zh-Hant': '繁',
};

const MENU_LOCALES = ['en', 'zh-Hant'] as const satisfies readonly AppLocale[];

const localeItems = MENU_LOCALES.map((value) => ({
	value,
	label: SHORT_LABELS[value],
}));

export function LocaleSwitcher() {
	const { i18n, t } = useLingui();
	const locale = isAppLocale(i18n.locale) ? i18n.locale : SOURCE_LOCALE;

	return (
		<Select
			items={localeItems}
			value={locale}
			onValueChange={(next) => {
				if (isAppLocale(next)) void activateLocale(next);
			}}
		>
			<SelectTrigger size="sm" aria-label={t`語言`}>
				<Earth />
				<SelectValue>
					{(selected) => {
						const match = MENU_LOCALES.find((value) => value === selected);
						return match === undefined ? null : SHORT_LABELS[match];
					}}
				</SelectValue>
			</SelectTrigger>
			<SelectContent className="min-w-0">
				<SelectGroup>
					{localeItems.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
