import { useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';

import { RequireAuth } from '@/components/require-auth';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveSpace } from '@/features/space/space';
import { ShelfTable } from '@/features/stock/shelf';

/** Reads the shelf search string. Anything else in the query is ignored. */
function readQuery(search: unknown): { q: string } {
	if (typeof search !== 'object' || search === null || !('q' in search)) return { q: '' };
	return { q: typeof search.q === 'string' ? search.q : '' };
}

/** Shelf route. `q` is the name filter. */
export const Route = createFileRoute('/stock')({
	validateSearch: readQuery,
	component: () => (
		<RequireAuth>
			<StockPage />
		</RequireAuth>
	),
});

/** The shelf for the account's one place, filtered by the name in the query. */
function StockPage() {
	const { q } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { active, isPending } = useActiveSpace();
	const { t } = useLingui();
	if (isPending) {
		return (
			<div aria-busy="true" className="px-4 py-8">
				<Skeleton className="h-4 w-40" />
				<span className="sr-only">{t`正在讀貨架。`}</span>
			</div>
		);
	}
	if (!active) {
		return (
			<div className="px-4 py-8">
				<Empty>
					<EmptyHeader>
						<EmptyDescription>{t`還沒有貨架。`}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}
	return (
		<ShelfTable
			spaceId={active._id}
			query={q}
			onSearch={(next) => void navigate({ search: { q: next }, replace: true })}
		/>
	);
}
