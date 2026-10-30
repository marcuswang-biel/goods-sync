import type { ReactNode } from 'react';

/** The signed-in page column. Groups sit further apart than the rows inside them. */
export function PageFrame({ children }: { children: ReactNode }) {
	return <div className="flex w-full flex-col gap-8 px-6 py-8">{children}</div>;
}

/** The page name. One per view, at the leading edge. */
export function PageTitle({ children }: { children: ReactNode }) {
	return <h1 className="text-2xl font-semibold text-balance">{children}</h1>;
}
