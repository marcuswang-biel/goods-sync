import { Button } from '@goods/web-ui';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useNavigate } from '@tanstack/react-router';
import { useConvexAuth } from 'convex/react';
import { useState, type FormEvent } from 'react';

import { useSignOut } from '@/auth';
import { useActiveSpace } from '@/features/stock/space';

import { LocaleSwitcher } from './locale-switcher';

function Mark() {
	return (
		<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
			<path d="M2 5.5h16M2 10h12M2 14.5h8" fill="none" stroke="currentColor" strokeWidth="1.5" />
		</svg>
	);
}

const linkClass = 'text-sm text-[#6b6b6b] hover:text-[#0a0a0a]';
const activeLinkClass = 'text-sm text-[#0a0a0a]';

export default function Header() {
	const { isAuthenticated } = useConvexAuth();
	const { spaces, active, select } = useActiveSpace(isAuthenticated);
	const signOut = useSignOut();
	const navigate = useNavigate();
	const { t } = useLingui();
	const [menuOpen, setMenuOpen] = useState(false);
	const [query, setQuery] = useState('');

	const submitSearch = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void navigate({ to: '/stock', search: { q: query.trim() } });
		setMenuOpen(false);
	};

	return (
		<header className="border-b border-[#e6e6e6] bg-[#f2f4f7]">
			{/* 1128px column: 12×83px + 11×12px. At 1440 the gutters are 156px; at 1512 they are 192px. */}
			<div className="mx-auto flex h-12 w-full max-w-[1128px] items-center gap-3 px-4 lg:px-0">
				<Link to="/" className="flex items-center gap-2 text-sm font-medium text-[#0a0a0a]">
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
					{isAuthenticated && (
						<form onSubmit={submitSearch} className="hidden md:block">
							<label htmlFor="shelf-search" className="sr-only">
								<Trans>搜尋物資</Trans>
							</label>
							<input
								id="shelf-search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								className="h-9 w-56 rounded-[6px] border border-[#d4d4d4] bg-white px-3 text-sm"
							/>
						</form>
					)}
					{isAuthenticated && active && (
						<label className="hidden items-center md:flex">
							<span className="sr-only">
								<Trans>空間</Trans>
							</span>
							<select
								className="h-9 rounded-[6px] border border-[#d4d4d4] bg-white px-2 text-sm"
								value={active._id}
								onChange={(event) => {
									const next = spaces.find((space) => space._id === event.target.value);
									if (next) select(next._id);
								}}
							>
								{spaces.map((space) => (
									<option key={space._id} value={space._id}>
										{space.name}
									</option>
								))}
							</select>
						</label>
					)}
					<LocaleSwitcher />
					{isAuthenticated && (
						<Button
							variant="ghost"
							size="sm"
							className="hidden shadow-none md:inline-flex"
							onClick={() => void signOut()}
						>
							<Trans>登出</Trans>
						</Button>
					)}
					{isAuthenticated && (
						<button
							type="button"
							className="inline-flex h-11 items-center px-2 text-sm md:hidden"
							aria-expanded={menuOpen}
							onClick={() => setMenuOpen((open) => !open)}
						>
							<Trans>選單</Trans>
						</button>
					)}
				</div>
			</div>
			{menuOpen && isAuthenticated && (
				<div className="border-t border-[#e6e6e6] px-4 py-3 md:hidden">
					<nav className="grid gap-1" aria-label={t`目錄`}>
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
					{active && (
						<select
							className="mt-2 h-11 w-full rounded-[6px] border border-[#d4d4d4] bg-white px-2 text-sm"
							aria-label={t`空間`}
							value={active._id}
							onChange={(event) => {
								const next = spaces.find((space) => space._id === event.target.value);
								if (next) select(next._id);
							}}
						>
							{spaces.map((space) => (
								<option key={space._id} value={space._id}>
									{space.name}
								</option>
							))}
						</select>
					)}
					<button
						type="button"
						className="mt-2 flex h-11 items-center text-sm"
						onClick={() => void signOut()}
					>
						<Trans>登出</Trans>
					</button>
				</div>
			)}
		</header>
	);
}
