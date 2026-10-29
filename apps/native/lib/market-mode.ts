import { useSyncExternalStore } from 'react';

let market = false;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

/** Whether takes and purchase checks stay on the phone until a merge. */
export function getMarket(): boolean {
	return market;
}

/** Turns supermarket mode on or off for every tab. */
export function setMarket(next: boolean) {
	market = next;
	emit();
}

/** The shared supermarket switch. */
export function useMarket(): boolean {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getMarket,
		getMarket,
	);
}
