import { useLingui } from '@lingui/react/macro';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { activateLocale, APP_LOCALES, isAppLocale, LOCALE_LABELS, SOURCE_LOCALE } from '@/lib/i18n';

export function LocaleSwitcher() {
	const { i18n, t } = useLingui();
	const locale = isAppLocale(i18n.locale) ? i18n.locale : SOURCE_LOCALE;

	return (
		<ToggleGroup
			variant="outline"
			size="sm"
			spacing={0}
			aria-label={t`語言`}
			value={[locale]}
			onValueChange={(groupValue) => {
				const next = groupValue[0];
				if (isAppLocale(next)) void activateLocale(next);
			}}
		>
			{APP_LOCALES.map((value) => (
				<ToggleGroupItem key={value} value={value}>
					{LOCALE_LABELS[value]}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
