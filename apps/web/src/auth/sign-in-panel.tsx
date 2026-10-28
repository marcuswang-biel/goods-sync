import { Trans, useLingui } from '@lingui/react/macro';
import { useState, type FormEvent } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

import { authClient } from './auth-client';

/** Whether the form is signing in or creating an account. */
type Mode = 'signIn' | 'signUp';

/** Email + password sign-in, with a sign-up mode for new accounts. */
export function SignInPanel() {
	const { t } = useLingui();
	const [mode, setMode] = useState<Mode>('signIn');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [name, setName] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	/** Sends the email form to Better Auth. A failure stays on this form. */
	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setPending(true);
		setError(null);
		const result =
			mode === 'signIn'
				? await authClient.signIn.email({ email, password })
				: await authClient.signUp.email({ email, password, name: name.trim() || email });
		setPending(false);
		if (result.error) {
			setError(result.error.message ?? t`登入失敗`);
		}
	};

	return (
		<form onSubmit={handleSubmit}>
			<FieldGroup>
				{mode === 'signUp' && (
					<Field>
						<FieldLabel htmlFor="sign-in-name">
							<Trans>名稱</Trans>
						</FieldLabel>
						<Input
							id="sign-in-name"
							autoComplete="name"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
				)}
				<Field>
					<FieldLabel htmlFor="sign-in-email">
						<Trans>電郵</Trans>
					</FieldLabel>
					<Input
						id="sign-in-email"
						type="email"
						autoComplete="username email"
						placeholder={'dev@example.com' /* taste-skill-ignore: seeded local account */}
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="sign-in-password">
						<Trans>密碼</Trans>
					</FieldLabel>
					<Input
						id="sign-in-password"
						type="password"
						autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
						minLength={8}
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						required
					/>
				</Field>
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<Button type="submit" className="w-full" disabled={pending}>
					{pending && <Spinner data-icon="inline-start" />}
					{mode === 'signIn' ? <Trans>登入</Trans> : <Trans>建立帳戶</Trans>}
				</Button>
				<Button
					type="button"
					variant="link"
					className="w-full"
					onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
				>
					{mode === 'signIn' ? <Trans>還沒有帳戶？建立一個</Trans> : <Trans>已有帳戶？登入</Trans>}
				</Button>
			</FieldGroup>
		</form>
	);
}
