import { Trans } from '@lingui/react/macro';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useConvexAuth } from 'convex/react';

import { SignInPanel } from '@/auth';
import Loader from '@/components/loader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
		<div className="flex min-h-full w-full items-center justify-center p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="items-center text-center">
					<CardTitle>
						<h1 className="text-2xl font-semibold text-balance">
							<Trans>登入物資</Trans>
						</h1>
					</CardTitle>
					<CardDescription className="text-pretty">
						<Trans>登入以查看貨架、領用和採購</Trans>
					</CardDescription>
				</CardHeader>
				<CardContent>
					<SignInPanel />
				</CardContent>
			</Card>
		</div>
	);
}
