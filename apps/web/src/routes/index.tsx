import { useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';

import { RequireAuth } from '@/components/require-auth';
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
	if (isPending) return <p className="px-4 py-8 text-sm lg:px-0">{t`正在讀你的空間。`}</p>;
	if (isError) {
		return (
			<p className="px-4 py-8 text-sm lg:px-0" role="alert">
				{t`讀不到空間，請再試一次。`}
			</p>
		);
	}
	if (!active) {
		return (
			<p className="mx-auto max-w-[1128px] px-4 py-8 text-sm lg:px-0">
				{t`你還沒有加入任何空間。`}
			</p>
		);
	}
	return <Board spaceId={active._id} />;
}
