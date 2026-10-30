import { Trans } from '@lingui/react/macro';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useConvexAuth } from 'convex/react';

import { SignInPanel } from '@/auth';
import Loader from '@/components/loader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Sign-in route. */
export const Route = createFileRoute('/sign-in')({
	component: SignInPage,
});

/** Sign-in form. An existing session goes straight to the board. */
function SignInPage() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	if (isLoading) return <Loader />;
	if (isAuthenticated) return <Navigate to="/" replace />;

	return (
		<div className="flex min-h-full w-full items-center px-4 py-10">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>
						<h1>
							<Trans>登入物資</Trans>
						</h1>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<SignInPanel />
				</CardContent>
			</Card>
		</div>
	);
}
