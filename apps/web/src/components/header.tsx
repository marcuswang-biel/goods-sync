import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useRouterState } from '@tanstack/react-router';
import { useConvexAuth } from 'convex/react';
import { useState } from 'react';

import { useSignOut } from '@/auth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import { LocaleSwitcher } from './locale-switcher';

/** Wordmark bars. Decorative; the link text is the name. */
function Mark() {
	return (
		<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
			<path d="M2 5.5h16M2 10h12M2 14.5h8" fill="none" stroke="currentColor" strokeWidth="1.5" />
		</svg>
	);
}

/** Board, shelf, and purchases. `stacked` is the phone menu. */
function Directory({ stacked, onNavigate }: { stacked: boolean; onNavigate?: () => void }) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const itemClass = stacked ? 'h-11 w-full justify-start' : undefined;

	return (
		<>
			<Button
				variant={pathname === '/' ? 'secondary' : 'ghost'}
				size={stacked ? 'default' : 'sm'}
				className={itemClass}
				nativeButton={false}
				render={<Link to="/" onClick={onNavigate} />}
			>
				<Trans>看板</Trans>
			</Button>
			<Button
				variant={pathname === '/stock' ? 'secondary' : 'ghost'}
				size={stacked ? 'default' : 'sm'}
				className={itemClass}
				nativeButton={false}
				render={<Link to="/stock" search={{ q: '' }} onClick={onNavigate} />}
			>
				<Trans>貨架</Trans>
			</Button>
			<Button
				variant={pathname === '/purchases' ? 'secondary' : 'ghost'}
				size={stacked ? 'default' : 'sm'}
				className={itemClass}
				nativeButton={false}
				render={<Link to="/purchases" onClick={onNavigate} />}
			>
				<Trans>採購</Trans>
			</Button>
		</>
	);
}

/** App chrome: board, shelf, and purchases. The place is not switched here. */
export default function Header() {
	const { isAuthenticated } = useConvexAuth();
	const signOut = useSignOut();
	const { t } = useLingui();
	const [menuOpen, setMenuOpen] = useState(false);

	return (
		<header className="bg-background">
			<div className="flex h-12 w-full items-center gap-3 px-4">
				<Link to="/" className="flex items-center gap-2 text-sm font-medium">
					<Mark />
					物資
				</Link>
				{isAuthenticated && (
					<nav className="ml-4 hidden items-center gap-1 md:flex" aria-label={t`目錄`}>
						<Directory stacked={false} />
					</nav>
				)}
				<div className="ml-auto flex items-center gap-2">
					<LocaleSwitcher />
					{isAuthenticated && (
						<Button
							variant="destructive"
							size="sm"
							className="hidden md:inline-flex"
							onClick={() => void signOut()}
						>
							<Trans>登出</Trans>
						</Button>
					)}
					{isAuthenticated && (
						<Button
							variant="ghost"
							size="sm"
							className="md:hidden"
							aria-expanded={menuOpen}
							onClick={() => setMenuOpen((open) => !open)}
						>
							<Trans>選單</Trans>
						</Button>
					)}
				</div>
			</div>
			{menuOpen && isAuthenticated && (
				<>
					<Separator className="md:hidden" />
					<div className="flex flex-col gap-1 px-4 py-3 md:hidden">
						<nav className="flex flex-col gap-1" aria-label={t`目錄`}>
							<Directory stacked onNavigate={() => setMenuOpen(false)} />
						</nav>
						<Button
							variant="destructive"
							className="h-11 w-full justify-start"
							onClick={() => void signOut()}
						>
							<Trans>登出</Trans>
						</Button>
					</div>
				</>
			)}
			<Separator />
		</header>
	);
}
