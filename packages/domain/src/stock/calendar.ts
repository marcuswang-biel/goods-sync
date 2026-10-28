const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when `value` is a real calendar day, not only a well-shaped string. */
export function isRealIsoDate(value: string): boolean {
	const match = ISO_DATE.exec(value);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const utc = new Date(Date.UTC(year, month - 1, day));
	return (
		utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
	);
}

/** Adds calendar days to an ISO date. The caller has already checked both inputs. */
export function addIsoDays(isoDate: string, days: number): string {
	const match = ISO_DATE.exec(isoDate);
	if (!match) return isoDate;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
