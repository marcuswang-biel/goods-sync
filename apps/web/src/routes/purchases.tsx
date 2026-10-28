import { useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';

import { RequireAuth } from '@/components/require-auth';
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
	if (isPending) return <p className="px-4 py-8 text-sm">{t`正在讀貨架。`}</p>;
	if (!active) return <p className="px-4 py-8 text-sm">{t`還沒有貨架。`}</p>;
	return <PurchaseList spaceId={active._id} />;
}
