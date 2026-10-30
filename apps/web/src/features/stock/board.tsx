import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { api } from '@goods/backend/convex/_generated/api';
import { isAttention, isExpiring, isShort } from '@goods/domain/stock';
import { convexErrorCode } from '@goods/shared/convex-error';
import { isAppErrorCode } from '@goods/shared/error-codes';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Fragment, useState } from 'react';

import { PageFrame, PageTitle } from '@/components/page-frame';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemSeparator,
	ItemTitle,
} from '@/components/ui/item';
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
			<div aria-busy="true" className="px-6 py-8">
				<Skeleton className="h-4 w-48" />
				<span className="sr-only">{t`正在讀貨架。`}</span>
			</div>
		);
	}
	if (board.isError || !board.data) {
		return (
			<div className="px-6 py-8">
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
		<PageFrame>
			<PageTitle>
				<Trans>看板</Trans>
			</PageTitle>

			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<div className="grid grid-cols-12 items-start gap-4">
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
										<Trans>還沒有物資。</Trans>
									</EmptyDescription>
								</EmptyHeader>
								<EmptyContent>
									<Button nativeButton={false} render={<Link to="/stock" search={{ q: '' }} />}>
										<Trans>放上貨架</Trans>
									</Button>
								</EmptyContent>
							</Empty>
						) : (
							<div className="flex flex-col gap-3">
								{shelves.map((code) => (
									<ItemGroup key={code} className="gap-0">
										<h3 className="text-muted-foreground text-xs">{shelf(code)}</h3>
										{items
											.filter((item) => item.shelf === code)
											.map((item, index) => (
												<Fragment key={item._id}>
													{index > 0 && <ItemSeparator />}
													<Item size="sm">
														<ItemContent className="min-w-0">
															<ItemTitle>{item.name}</ItemTitle>
														</ItemContent>
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
														<ItemActions>
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
														</ItemActions>
													</Item>
												</Fragment>
											))}
									</ItemGroup>
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
							<ItemGroup className="gap-0">
								{board.data.movements.slice(0, 4).map((movement, index) => (
									<Fragment key={movement._id}>
										{index > 0 && <ItemSeparator />}
										<Item size="sm">
											<ItemContent className="min-w-0">
												<ItemTitle>
													{movement.actorLabel} {movement.kind === 'consume' ? t`領走` : t`補上`}{' '}
													{movement.quantity} {unit(movement.unit)} {movement.itemName}
												</ItemTitle>
											</ItemContent>
											{movement.outcome === 'rejected' && (
												<Badge variant="destructive">
													<Trans>沒扣成</Trans>
												</Badge>
											)}
										</Item>
									</Fragment>
								))}
							</ItemGroup>
						)}
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-12 items-start gap-4">
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
		</PageFrame>
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
					<ItemGroup className="gap-0">
						{rows.slice(0, 4).map((item, index) => (
							<Fragment key={item._id}>
								{index > 0 && <ItemSeparator />}
								<Item size="sm">
									<ItemContent className="min-w-0">
										<ItemTitle>{item.name}</ItemTitle>
									</ItemContent>
									<ItemDescription className="shrink-0 tabular-nums">
										{item.expiresOn ?? '—'} {item.quantity} {unit(item.unit)}
									</ItemDescription>
								</Item>
							</Fragment>
						))}
					</ItemGroup>
				)}
			</CardContent>
		</Card>
	);
}
