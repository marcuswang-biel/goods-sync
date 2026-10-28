import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { api } from '@goods/backend/convex/_generated/api';
import { isAttention, isExpiring, isShort } from '@goods/domain/stock';
import { convexErrorCode } from '@goods/shared/convex-error';
import { isAppErrorCode } from '@goods/shared/error-codes';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { REJECTION_MESSAGES, STOCK_ERROR_MESSAGES } from '@/features/stock/errors';
import { SHELF_LABELS, UNIT_LABELS } from '@/features/stock/labels';
import { LevelBar, StockAmount } from '@/features/stock/level-bar';
import { todayIso } from '@/features/stock/money';

/** One shelf row as the board query returns it. */
type BoardItem = {
	_id: Id<'items'>;
	name: string;
	unit: keyof typeof UNIT_LABELS;
	quantity: number;
	safetyQuantity: number;
	expiresOn: string | null;
	shelf: keyof typeof SHELF_LABELS;
	version: number;
	freshness: 'undated' | 'ok' | 'soon' | 'expired';
	supply: 'ok' | 'low' | 'out';
};

/** The live shelf for one place: take one unit, or open the full list. */
export function Board({ spaceId }: { spaceId: Id<'spaces'> }) {
	const { t } = useLingui();
	const board = useQuery(convexQuery(api.stock.board, { spaceId, today: todayIso() }));
	const sync = useConvexMutation(api.stock.sync);
	const [error, setError] = useState<string | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);

	/** Turns a Convex or rejection failure into a sentence for the alert. */
	const describe = (failure: unknown) => {
		const code = convexErrorCode(failure);
		const descriptor = isAppErrorCode(code) ? STOCK_ERROR_MESSAGES[code] : undefined;
		return descriptor ? t(descriptor) : t`操作失敗，請再試一次。`;
	};

	/** Records a one-unit take. A later offline take can still reject this one. */
	const take = async (item: BoardItem) => {
		setError(null);
		setPendingId(item._id);
		try {
			const result = await sync({
				spaceId,
				itemId: item._id,
				ops: [
					{
						clientMutationId: crypto.randomUUID(),
						kind: 'consume',
						quantity: 1,
						occurredAt: Date.now(),
						causalParentClientId: null,
						observedVersion: item.version,
					},
				],
			});
			const rejected = result.results.find((row) => row.outcome === 'rejected');
			if (rejected?.rejectionCode) {
				const descriptor = REJECTION_MESSAGES[rejected.rejectionCode];
				setError(t(descriptor));
			}
		} catch (failure) {
			setError(describe(failure));
		} finally {
			setPendingId(null);
		}
	};

	if (board.isPending) {
		return (
			<div aria-busy="true" className="px-4 py-8 lg:px-0">
				<Skeleton className="h-4 w-48" />
				<span className="sr-only">{t`正在讀這個空間的貨架。`}</span>
			</div>
		);
	}
	if (board.isError || !board.data) {
		return (
			<div className="px-4 py-8 lg:px-0">
				<Alert variant="destructive">
					<AlertDescription>{t`讀不到貨架，請再試一次。`}</AlertDescription>
				</Alert>
			</div>
		);
	}

	const items = board.data.items;
	const expiring = items.filter((item) => isExpiring(item.freshness));
	const short = items.filter((item) => isShort(item.supply));
	const unit = (code: keyof typeof UNIT_LABELS) => t(UNIT_LABELS[code]);
	const shelf = (code: keyof typeof SHELF_LABELS) => t(SHELF_LABELS[code]);
	const shelves = [...new Set(items.map((item) => item.shelf))];

	return (
		<div className="mx-auto flex w-full max-w-[1128px] flex-col gap-3 px-4 py-6 lg:px-0">
			<h1 className="text-2xl leading-none font-medium">{board.data.space.name}</h1>

			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<div className="grid grid-cols-12 items-start gap-3">
				<Card className="col-span-12 lg:col-span-8">
					<CardHeader>
						<CardTitle>
							<h2>
								<Trans>貨架</Trans>
							</h2>
						</CardTitle>
						<CardAction>
							<Button
								variant="link"
								nativeButton={false}
								render={<Link to="/stock" search={{ q: '' }} />}
							>
								<Trans>查看全部</Trans>
							</Button>
						</CardAction>
					</CardHeader>
					<CardContent>
						{items.length === 0 ? (
							<Empty>
								<EmptyHeader>
									<EmptyDescription>
										<Trans>這個空間還沒有公共物資。</Trans>
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<div className="flex flex-col gap-3">
								{shelves.map((code) => (
									<div key={code} className="flex flex-col gap-1">
										<h3 className="text-muted-foreground text-xs">{shelf(code)}</h3>
										<ul>
											{items
												.filter((item) => item.shelf === code)
												.map((item) => (
													<li
														key={item._id}
														className="flex min-h-11 items-center gap-3 border-b last:border-b-0"
													>
														<span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
														{isAttention(item) && item.quantity > 0 && (
															<Badge variant="outline">
																{isExpiring(item.freshness) ? (
																	<Trans>即將過期</Trans>
																) : (
																	<Trans>不夠了</Trans>
																)}
															</Badge>
														)}
														<LevelBar
															quantity={item.quantity}
															safetyQuantity={item.safetyQuantity}
														/>
														<StockAmount
															quantity={item.quantity}
															unit={unit(item.unit)}
															safetyQuantity={item.safetyQuantity}
														/>
														<span className="flex w-12 shrink-0 items-center justify-end">
															{item.quantity > 0 && (
																<Button
																	variant="ghost"
																	size="sm"
																	disabled={pendingId !== null}
																	onClick={() => void take(item)}
																>
																	<Trans>領用</Trans>
																</Button>
															)}
														</span>
													</li>
												))}
										</ul>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="col-span-12 lg:col-span-4">
					<CardHeader>
						<CardTitle>
							<h2>
								<Trans>最近的領用</Trans>
							</h2>
						</CardTitle>
					</CardHeader>
					<CardContent>
						{board.data.movements.length === 0 ? (
							<Empty>
								<EmptyHeader>
									<EmptyDescription>
										<Trans>還沒有人領用。較早的離線領用會留下，較晚的那一筆會被拒絕。</Trans>
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<ul>
								{board.data.movements.slice(0, 4).map((movement) => (
									<li
										key={movement._id}
										className="flex min-h-11 items-center gap-2 border-b text-sm last:border-b-0"
									>
										<span className="min-w-0 flex-1 truncate">
											{movement.actorLabel} {movement.kind === 'consume' ? t`領走` : t`補上`}{' '}
											{movement.quantity} {unit(movement.unit)} {movement.itemName}
										</span>
										{movement.outcome === 'rejected' && (
											<Badge variant="destructive">
												<Trans>沒扣成</Trans>
											</Badge>
										)}
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-12 items-start gap-3">
				<Queue
					title={t`即將過期`}
					rows={expiring}
					unit={unit}
					empty={t`三天內沒有要到期的物資。`}
				/>
				<Queue
					title={t`不夠了`}
					rows={short}
					unit={unit}
					empty={t`沒有低於安全庫存的物資。`}
					purchase
				/>
			</div>
		</div>
	);
}

/** Up to four expiring or short goods. The short queue links to purchases. */
function Queue({
	title,
	rows,
	unit,
	empty,
	purchase = false,
}: {
	title: string;
	rows: readonly BoardItem[];
	unit: (code: keyof typeof UNIT_LABELS) => string;
	empty: string;
	purchase?: boolean;
}) {
	return (
		<Card className="col-span-12 lg:col-span-6">
			<CardHeader>
				<CardTitle>
					<h2>{title}</h2>
				</CardTitle>
				{purchase && rows.length > 0 && (
					<CardAction>
						<Button variant="link" nativeButton={false} render={<Link to="/purchases" />}>
							<Trans>一鍵採購</Trans>
						</Button>
					</CardAction>
				)}
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyDescription>{empty}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<ul>
						{rows.slice(0, 4).map((item) => (
							<li
								key={item._id}
								className="flex min-h-11 items-center justify-between gap-3 border-b text-sm last:border-b-0"
							>
								<span className="truncate">{item.name}</span>
								<span className="text-muted-foreground shrink-0 tabular-nums">
									{item.expiresOn ?? '—'}
									<span className="text-foreground ml-3">{item.quantity}</span>
									<span className="ml-1">{unit(item.unit)}</span>
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
