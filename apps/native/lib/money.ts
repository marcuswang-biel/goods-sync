/** Comma-groups a non-negative whole number. Hermes has no en-HK locale data. */
function groupThousands(value: number): string {
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** HK$ with grouped whole dollars and two cents, no space after the sign. */
export function formatCents(cents: number): string {
	const negative = cents < 0;
	const absolute = Math.abs(cents);
	const dollars = groupThousands(Math.floor(absolute / 100));
	const fraction = String(absolute % 100).padStart(2, '0');
	return `${negative ? '-' : ''}HK$${dollars}.${fraction}`;
}

/** Turns a typed dollar amount into cents. Blank, zero, and extra decimals are refused. */
export function dollarsToCents(raw: string): number | null {
	const trimmed = raw.trim();
	if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
	const cents = Math.round(Number(trimmed) * 100);
	if (cents <= 0 || cents > 10_000_000) return null;
	return cents;
}
