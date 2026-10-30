import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronLeft, ClipboardList, LayoutDashboard, LogOut, Menu, Package } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { useSignOut } from '@/auth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { LocaleSwitcher } from './locale-switcher';

const COLLAPSED_KEY = 'goods-sidebar-collapsed';
const PHONE_QUERY = '(max-width: 767px)';

/** A phone starts on the icon rail. A stored choice only applies on a wider window. */
function initialCollapsed() {
	if (typeof window === 'undefined') return false;
	try {
		if (window.matchMedia(PHONE_QUERY).matches) return true;
		return window.localStorage.getItem(COLLAPSED_KEY) === '1';
	} catch {
		return false;
	}
}

/** Remembers a desktop collapse. A phone always reopens on the icon rail. */
function rememberCollapsed(collapsed: boolean) {
	try {
		if (window.matchMedia(PHONE_QUERY).matches) return;
		window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
	} catch {
		// The rail still toggles for this visit.
	}
}

/** Signed-in chrome: a collapsible rail, then the page. */
export function AppShell({ children }: { children: ReactNode }) {
	const { t } = useLingui();
	const signOut = useSignOut();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const [collapsed, setCollapsed] = useState(initialCollapsed);

	const toggle = (next: boolean) => {
		setCollapsed(next);
		rememberCollapsed(next);
	};

	const itemClass = collapsed ? 'size-10 px-0' : 'h-9 w-full justify-start px-3';

	return (
		<div className="bg-muted/20 flex h-dvh min-h-0 overflow-hidden">
			<aside
				className={cn(
					'bg-background flex h-full min-h-0 shrink-0 flex-col border-r',
					collapsed ? 'w-16' : 'w-64',
				)}
			>
				<div className="flex h-12 items-center px-2">
					{collapsed ? (
						<div className="flex w-full justify-center">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={t`展開側欄`}
								onClick={() => toggle(false)}
							>
								<Menu />
							</Button>
						</div>
					) : (
						<div className="flex w-full items-center gap-1">
							<Link
								to="/"
								className="hover:bg-muted/60 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1"
							>
								<img src="/favicon.svg" alt="" className="size-6 shrink-0 rounded-md" />
								<span className="truncate text-sm font-semibold">物資</span>
							</Link>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={t`收合側欄`}
								onClick={() => toggle(true)}
							>
								<ChevronLeft />
							</Button>
						</div>
					)}
				</div>
				<Separator />
				<nav
					className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-3"
					aria-label={t`目錄`}
				>
					<Button
						variant={pathname === '/' ? 'secondary' : 'ghost'}
						className={itemClass}
						aria-label={t`看板`}
						nativeButton={false}
						render={<Link to="/" />}
					>
						{collapsed ? <LayoutDashboard /> : <LayoutDashboard data-icon="inline-start" />}
						{collapsed ? null : <Trans>看板</Trans>}
					</Button>
					<Button
						variant={pathname === '/stock' ? 'secondary' : 'ghost'}
						className={itemClass}
						aria-label={t`貨架`}
						nativeButton={false}
						render={<Link to="/stock" search={{ q: '' }} />}
					>
						{collapsed ? <Package /> : <Package data-icon="inline-start" />}
						{collapsed ? null : <Trans>貨架</Trans>}
					</Button>
					<Button
						variant={pathname === '/purchases' ? 'secondary' : 'ghost'}
						className={itemClass}
						aria-label={t`採購`}
						nativeButton={false}
						render={<Link to="/purchases" />}
					>
						{collapsed ? <ClipboardList /> : <ClipboardList data-icon="inline-start" />}
						{collapsed ? null : <Trans>採購</Trans>}
					</Button>
				</nav>
				<div className="mt-auto">
					<Separator />
					<div
						className={cn(
							'flex gap-2',
							collapsed ? 'flex-col items-center px-2 py-3' : 'items-center px-3 py-3',
						)}
					>
						<LocaleSwitcher compact={collapsed} side="top" />
						<Button
							variant="destructive"
							size={collapsed ? 'icon-sm' : 'sm'}
							className={collapsed ? 'size-7' : 'min-w-0 flex-1'}
							aria-label={t`登出`}
							onClick={() => void signOut()}
						>
							{collapsed ? <LogOut /> : <Trans>登出</Trans>}
						</Button>
					</div>
				</div>
			</aside>
			<main className="bg-background h-full min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
		</div>
	);
}
