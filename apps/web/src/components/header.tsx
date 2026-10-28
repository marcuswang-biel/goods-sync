import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { useConvexAuth } from 'convex/react';
import { useState } from 'react';

import { useSignOut } from '@/auth';
import { Button } from '@/components/ui/button';

import { LocaleSwitcher } from './locale-switcher';

/** Wordmark bars. Decorative; the link text is the name. */
function Mark() {
	return (
		<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
			<path d="M2 5.5h16M2 10h12M2 14.5h8" fill="none" stroke="currentColor" strokeWidth="1.5" />
		</svg>
	);
}

/** Nav link when the route is not current. */
const linkClass = 'text-sm text-muted-foreground hover:text-foreground';
/** Nav link on the current route. */
const activeLinkClass = 'text-sm text-foreground';

/** App chrome: board, shelf, and purchases. The place is not switched here. */
export default function Header() {
	const { isAuthenticated } = useConvexAuth();
	const signOut = useSignOut();
	const { t } = useLingui();
	const [menuOpen, setMenuOpen] = useState(false);

	return (
		<header className="bg-background border-b">
			<div className="flex h-12 w-full items-center gap-3 px-4">
				<Link to="/" className="flex items-center gap-2 text-sm font-medium">
					<Mark />
					物資
				</Link>
				{isAuthenticated && (
					<nav className="ml-4 hidden items-center gap-4 md:flex" aria-label={t`目錄`}>
						<Link
							to="/"
							activeOptions={{ exact: true }}
							className={linkClass}
							activeProps={{ className: activeLinkClass }}
						>
							<Trans>看板</Trans>
						</Link>
						<Link
							to="/stock"
							search={{ q: '' }}
							className={linkClass}
							activeProps={{ className: activeLinkClass }}
						>
							<Trans>貨架</Trans>
						</Link>
						<Link
							to="/purchases"
							className={linkClass}
							activeProps={{ className: activeLinkClass }}
						>
							<Trans>採購</Trans>
						</Link>
					</nav>
				)}
				<div className="ml-auto flex items-center gap-2">
					<LocaleSwitcher />
					{isAuthenticated && (
						<Button
							variant="ghost"
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
				<div className="border-t px-4 py-3 md:hidden">
					<nav className="flex flex-col gap-1" aria-label={t`目錄`}>
						<Link
							to="/"
							className="flex h-11 items-center text-sm"
							onClick={() => setMenuOpen(false)}
						>
							<Trans>看板</Trans>
						</Link>
						<Link
							to="/stock"
							search={{ q: '' }}
							className="flex h-11 items-center text-sm"
							onClick={() => setMenuOpen(false)}
						>
							<Trans>貨架</Trans>
						</Link>
						<Link
							to="/purchases"
							className="flex h-11 items-center text-sm"
							onClick={() => setMenuOpen(false)}
						>
							<Trans>採購</Trans>
						</Link>
					</nav>
					<Button variant="ghost" className="mt-2" onClick={() => void signOut()}>
						<Trans>登出</Trans>
					</Button>
				</div>
			)}
		</header>
	);
}
