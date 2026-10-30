import { useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';

import { RequireAuth } from '@/components/require-auth';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { PurchaseList } from '@/features/purchase/list';
import { useActiveSpace } from '@/features/space/space';

/** Purchases route. */
export const Route = createFileRoute('/purchases')({
	component: () => (
		<RequireAuth>
			<PurchasesPage />
		</RequireAuth>
	),
});

/** Members see their trips. A signed-out visit is sent to sign in. */
function PurchasesPage() {
	const { t } = useLingui();
	const { active, isPending } = useActiveSpace();
	if (isPending) {
		return (
			<div aria-busy="true" className="px-6 py-8">
				<Skeleton className="h-4 w-40" />
				<span className="sr-only">{t`正在讀貨架。`}</span>
			</div>
		);
	}
	if (!active) {
		return (
			<div className="px-6 py-8">
				<Empty>
					<EmptyHeader>
						<EmptyDescription>{t`還沒有貨架。`}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}
	return <PurchaseList spaceId={active._id} />;
}
