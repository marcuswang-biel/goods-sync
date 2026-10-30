import { useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';

import { RequireAuth } from '@/components/require-auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveSpace } from '@/features/space/space';
import { Board } from '@/features/stock/board';

/** Board route. Signed-out visits are sent to sign in. */
export const Route = createFileRoute('/')({
	component: () => (
		<RequireAuth>
			<Overview />
		</RequireAuth>
	),
});

/** The board for the account's one place. */
function Overview() {
	const { t } = useLingui();
	const { active, isPending, isError } = useActiveSpace();
	if (isPending) {
		return (
			<div aria-busy="true" className="px-6 py-8 lg:px-6">
				<Skeleton className="h-4 w-40" />
				<span className="sr-only">{t`正在讀貨架。`}</span>
			</div>
		);
	}
	if (isError) {
		return (
			<div className="px-6 py-8">
				<Alert variant="destructive">
					<AlertDescription>{t`讀不到貨架，請再試一次。`}</AlertDescription>
				</Alert>
			</div>
		);
	}
	if (!active) {
		return (
			<div className="w-full px-6 py-8">
				<Empty>
					<EmptyHeader>
						<EmptyDescription>{t`還沒有貨架。`}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}
	return <Board spaceId={active._id} />;
}
