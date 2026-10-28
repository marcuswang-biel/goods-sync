import { Trans } from '@lingui/react/macro';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useConvexAuth } from 'convex/react';

import { SignInPanel } from '@/auth';
import Loader from '@/components/loader';

export const Route = createFileRoute('/sign-in')({
	component: SignInPage,
});

function SignInPage() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	if (isLoading) return <Loader />;
	if (isAuthenticated) return <Navigate to="/" replace />;

	return (
		<div className="mx-auto flex min-h-full w-full max-w-[1128px] items-center px-4 py-10 lg:px-0">
			<div className="w-full max-w-sm">
				<h1 className="text-[24px] leading-none font-medium">
					<Trans>登入物資</Trans>
				</h1>
				<p className="mt-3 text-sm/6">
					<Trans>凱是 dev@example.com，阿澄是 roommate@example.com，密碼都是 devpassword。</Trans>
					{/* taste-skill-ignore */}
				</p>
				<div className="mt-6">
					<SignInPanel />
				</div>
			</div>
		</div>
	);
}
