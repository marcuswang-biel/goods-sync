import { createRootRouteWithContext, HeadContent, Outlet } from '@tanstack/react-router';
import { useConvexAuth } from 'convex/react';

import { AppShell } from '@/components/app-shell';
import { LocaleSwitcher } from '@/components/locale-switcher';

import '../index.css';

/** Empty router context. This app does not pass data through the router. */
export type RouterAppContext = Record<string, never>;

/** Root route: the header, then the matched page. */
export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [{ title: '物資' }],
	}),
});

/** Signed-in pages use the rail. Signed-out pages keep the language menu above the form. */
function RootComponent() {
	const { isAuthenticated } = useConvexAuth();

	return (
		<>
			<HeadContent />
			{isAuthenticated ? (
				<AppShell>
					<Outlet />
				</AppShell>
			) : (
				<div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)]">
					<header className="flex h-12 items-center justify-end px-4">
						<LocaleSwitcher />
					</header>
					<main className="min-h-0 overflow-auto">
						<Outlet />
					</main>
				</div>
			)}
		</>
	);
}
