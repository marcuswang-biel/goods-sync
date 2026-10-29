/** A client id short enough for the offline queue. */
export function clientId(prefix: string): string {
	const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
	return `${prefix}-${random}`.slice(0, 80);
}
