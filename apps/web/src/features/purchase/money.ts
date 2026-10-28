/** HK$ with grouped whole dollars and two cents, no space after the sign. */
export function formatCents(cents: number): string {
	const negative = cents < 0;
	const absolute = Math.abs(cents);
	const dollars = Math.floor(absolute / 100).toLocaleString('en-HK');
	const fraction = String(absolute % 100).padStart(2, '0');
	return `${negative ? '-' : ''}HK$${dollars}.${fraction}`;
}
