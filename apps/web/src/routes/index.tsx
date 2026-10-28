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
			<div aria-busy="true" className="px-4 py-8 lg:px-0">
				<Skeleton className="h-4 w-40" />
				<span className="sr-only">{t`正在讀你的空間。`}</span>
			</div>
		);
	}
	if (isError) {
		return (
			<div className="px-4 py-8 lg:px-0">
				<Alert variant="destructive">
					<AlertDescription>{t`讀不到空間，請再試一次。`}</AlertDescription>
				</Alert>
			</div>
		);
	}
	if (!active) {
		return (
			<div className="mx-auto max-w-[1128px] px-4 py-8 lg:px-0">
				<Empty>
					<EmptyHeader>
						<EmptyDescription>{t`你還沒有加入任何空間。`}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}
	return <Board spaceId={active._id} />;
}
