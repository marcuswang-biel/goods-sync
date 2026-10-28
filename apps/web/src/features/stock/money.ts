/** UTC calendar day, matching the dates the dev seed writes. */
export function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}
