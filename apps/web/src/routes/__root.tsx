import { createRootRouteWithContext, HeadContent, Outlet } from '@tanstack/react-router';

import Header from '@/components/header';

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

/** Page chrome under the header. */
function RootComponent() {
	return (
		<>
			<HeadContent />
			<div className="grid h-svh grid-rows-[auto_minmax(0,1fr)]">
				<Header />
				<main className="min-h-0 overflow-auto">
					<Outlet />
				</main>
			</div>
		</>
	);
}
