import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { api } from '@goods/backend/convex/_generated/api';
import { unitsToRestock } from '@goods/domain/purchase';
import { convexErrorCode } from '@goods/shared/convex-error';
import { isAppErrorCode } from '@goods/shared/error-codes';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState, type FormEvent } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemFooter,
	ItemGroup,
	ItemSeparator,
	ItemTitle,
} from '@/components/ui/item';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { REJECTION_MESSAGES, STOCK_ERROR_MESSAGES } from '@/features/stock/errors';
import { UNIT_LABELS } from '@/features/stock/labels';
import { todayIso } from '@/features/stock/money';

import { formatCents } from './money';

/** How many trips one page of the purchase record shows. */
const PURCHASE_PAGE_SIZE = 4;

/** Open total, the suggested buy form, and the paged record of trips. */
export function PurchaseList({ spaceId }: { spaceId: Id<'spaces'> }) {
	const { t } = useLingui();
	const list = useQuery(convexQuery(api.purchases.list, { spaceId }));
	const board = useQuery(convexQuery(api.stock.board, { spaceId, today: todayIso() }));
	const sync = useConvexMutation(api.purchases.sync);
	const [error, setError] = useState<string | null>(null);
	const [page, setPage] = useState(0);

	/** Turns a Convex or rejection failure into a sentence for the alert. */
	const describe = (failure: unknown) => {
		const code = convexErrorCode(failure);
		const descriptor = isAppErrorCode(code) ? STOCK_ERROR_MESSAGES[code] : undefined;
		return descriptor ? t(descriptor) : t`操作失敗，請再試一次。`;
	};

	/** Marks an open trip bought and restocks every good still linked to it. */
	const buy = async (purchaseClientMutationId: string) => {
		setError(null);
		try {
			const results = await sync({
				spaceId,
				ops: [
					{
						tag: 'buy',
						clientMutationId: crypto.randomUUID(),
						purchaseClientMutationId,
						occurredAt: Date.now(),
					},
				],
			});
			const rejected = results.find((row) => row.outcome === 'rejected');
			if (rejected?.rejectionCode) setError(t(REJECTION_MESSAGES[rejected.rejectionCode]));
		} catch (failure) {
			setError(describe(failure));
		}
	};

	const purchases = list.data?.purchases ?? [];
	const open = purchases.filter((purchase) => purchase.status === 'open');
	const total = open.reduce((sum, purchase) => sum + purchase.totalCents, 0);
	const openItemIds = open.flatMap((purchase) =>
		purchase.items.flatMap((item) => (item.itemId === null ? [] : [item.itemId])),
	);
	const firstOpen = purchases.find((purchase) => purchase.status === 'open');
	const pageCount = Math.ceil(purchases.length / PURCHASE_PAGE_SIZE);
	const safePage = pageCount === 0 ? 0 : Math.min(page, pageCount - 1);
	const visible = purchases.slice(
		safePage * PURCHASE_PAGE_SIZE,
		safePage * PURCHASE_PAGE_SIZE + PURCHASE_PAGE_SIZE,
	);

	return (
		<div className="flex w-full flex-col gap-3 px-4 py-6">
			<div className="flex items-end justify-between gap-3">
				<h1 className="text-2xl leading-none font-medium">
					<Trans>採購</Trans>
				</h1>
				<p className="text-3xl leading-none font-bold tabular-nums">{formatCents(total)}</p>
			</div>
			<p className="text-muted-foreground text-sm">
				<Trans>未採購合計</Trans>
			</p>
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			<ShortfallPurchase
				spaceId={spaceId}
				items={board.data?.items ?? []}
				openItemIds={openItemIds}
				onError={setError}
			/>
			<Card>
				<CardHeader className="border-b">
					<CardTitle>
						<h2>
							<Trans>採購記錄</Trans>
						</h2>
					</CardTitle>
				</CardHeader>
				<CardContent>
					{list.isPending ? (
						<div aria-busy="true" className="flex flex-col gap-2">
							<Skeleton className="h-4 w-40" />
							<span className="sr-only">{t`正在讀採購清單。`}</span>
						</div>
					) : purchases.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyDescription>{t`清單是空的。`}</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<ItemGroup className="gap-0">
							{visible.map((purchase, index) => (
								<Fragment key={purchase._id}>
									{index > 0 && <ItemSeparator />}
									<Item size="sm">
										<ItemContent className="min-w-0">
											{purchase.items.map((item) => (
												<Fragment key={item._id}>
													<ItemTitle>{item.name}</ItemTitle>
													{purchase.status === 'open' ? (
														<BuyAmount spaceId={spaceId} item={item} onError={setError} />
													) : (
														<ItemDescription>
															<Trans>補 {item.quantity}</Trans>
															{item.unit ? ` ${t(UNIT_LABELS[item.unit])}` : ''}
														</ItemDescription>
													)}
												</Fragment>
											))}
										</ItemContent>
										<ItemFooter>
											{purchase.status === 'bought' && (
												<Badge variant="secondary">
													<Trans>已採購</Trans>
												</Badge>
											)}
											<ItemActions>
												<span className="font-medium tabular-nums">
													{formatCents(purchase.totalCents)}
												</span>
												{purchase.status === 'open' && (
													<Button
														variant={purchase._id === firstOpen?._id ? 'default' : 'ghost'}
														size="sm"
														onClick={() => void buy(purchase.clientMutationId)}
													>
														<Trans>已採購</Trans>
													</Button>
												)}
											</ItemActions>
										</ItemFooter>
									</Item>
								</Fragment>
							))}
						</ItemGroup>
					)}
					{pageCount > 1 && (
						<>
							<Separator />
							<Pagination aria-label={t`採購記錄分頁`} className="justify-end">
								<PaginationContent>
									<PaginationItem>
										<Button
											variant="ghost"
											size="sm"
											disabled={safePage === 0}
											onClick={() => setPage(safePage - 1)}
										>
											<Trans>上一頁</Trans>
										</Button>
									</PaginationItem>
									{Array.from({ length: pageCount }, (_, index) => (
										<PaginationItem key={index}>
											<Button
												variant={index === safePage ? 'default' : 'ghost'}
												size="icon"
												aria-label={t`第 ${index + 1} 頁`}
												aria-current={index === safePage ? 'page' : undefined}
												onClick={() => setPage(index)}
												className="tabular-nums"
											>
												{index + 1}
											</Button>
										</PaginationItem>
									))}
									<PaginationItem>
										<Button
											variant="ghost"
											size="sm"
											disabled={safePage >= pageCount - 1}
											onClick={() => setPage(safePage + 1)}
										>
											<Trans>下一頁</Trans>
										</Button>
									</PaginationItem>
								</PaginationContent>
							</Pagination>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

/** Editable buy on an open trip. Leaving the field writes 1–99 back to the server. */
function BuyAmount({
	spaceId,
	item,
	onError,
}: {
	spaceId: Id<'spaces'>;
	item: {
		_id: Id<'purchaseItems'>;
		name: string;
		unit: keyof typeof UNIT_LABELS | null;
		quantity: number;
	};
	onError: (message: string | null) => void;
}) {
	const { t } = useLingui();
	const setQuantity = useConvexMutation(api.purchases.setQuantity);
	const [draft, setDraft] = useState<string | null>(null);
	const shown = draft ?? String(item.quantity);

	/** Saves the typed quantity. Zero is not allowed once the line is already on a trip. */
	const commit = async (raw: string) => {
		const quantity = parseBuy(raw, 1);
		if (quantity === null) {
			setDraft(null);
			onError(t`補貨數量要是 1 到 99 的整數。`);
			return;
		}
		if (quantity === item.quantity) {
			setDraft(null);
			return;
		}
		onError(null);
		try {
			await setQuantity({ spaceId, purchaseItemId: item._id, quantity });
			setDraft(null);
		} catch (failure) {
			const code = convexErrorCode(failure);
			const descriptor = isAppErrorCode(code) ? STOCK_ERROR_MESSAGES[code] : undefined;
			onError(descriptor ? t(descriptor) : t`操作失敗，請再試一次。`);
		}
	};

	return (
		<Field orientation="horizontal" className="w-fit">
			<FieldLabel htmlFor={`buy-${item._id}`}>
				<Trans>補</Trans>
			</FieldLabel>
			<Input
				id={`buy-${item._id}`}
				type="number"
				inputMode="numeric"
				min={1}
				max={99}
				step={1}
				aria-label={t`補 ${item.name}`}
				value={shown}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={(event) => void commit(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						event.currentTarget.blur();
					}
				}}
				className="w-14"
			/>
			{item.unit ? <span>{t(UNIT_LABELS[item.unit])}</span> : null}
		</Field>
	);
}

/**
 * Parses a typed buy. `min` is 0 on the draft form, where zero leaves the good
 * off the new trip, and 1 on a line that is already saved.
 */
function parseBuy(raw: string, min = 0): number | null {
	if (!/^\d{1,2}$/.test(raw)) return null;
	const quantity = Number(raw);
	if (quantity < min) return null;
	return quantity;
}

/** Goods at or under the safety line. The suggested quantity can be changed before the trip is created. */
function ShortfallPurchase({
	spaceId,
	items,
	openItemIds,
	onError,
}: {
	spaceId: Id<'spaces'>;
	items: ReadonlyArray<{
		_id: Id<'items'>;
		name: string;
		unit: keyof typeof UNIT_LABELS;
		quantity: number;
		safetyQuantity: number;
	}>;
	openItemIds: ReadonlyArray<Id<'items'>>;
	onError: (message: string | null) => void;
}) {
	const { t } = useLingui();
	const sync = useConvexMutation(api.purchases.sync);
	const [pending, setPending] = useState(false);
	const [amounts, setAmounts] = useState<Readonly<Record<string, string>>>({});
	const linked = new Set(openItemIds);
	const short = items
		.flatMap((item) => {
			const buy = unitsToRestock(item.quantity, item.safetyQuantity);
			return buy === 0 ? [] : [{ ...item, buy }];
		})
		.sort((left, right) => right.buy - left.buy);
	const missing = short.filter((item) => !linked.has(item._id));

	/** Creates one open trip from the goods still missing, using the edited quantities. */
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (missing.length === 0 || pending) return;
		onError(null);
		const raw = new FormData(event.currentTarget).get('total');
		const dollars = typeof raw === 'string' ? Number(raw) : Number.NaN;
		const totalCents = Math.round(dollars * 100);
		if (!Number.isFinite(dollars) || totalCents <= 0) {
			onError(t`請填這次採購的總計。`);
			return;
		}
		const lines: { itemId: Id<'items'>; quantity: number }[] = [];
		for (const item of missing) {
			const quantity = parseBuy(amounts[item._id] ?? String(item.buy));
			if (quantity === null) {
				onError(t`補貨數量要是 0 到 99 的整數。`);
				return;
			}
			if (quantity > 0) lines.push({ itemId: item._id, quantity });
		}
		if (lines.length === 0) {
			onError(t`至少補一樣。`);
			return;
		}
		setPending(true);
		try {
			const results = await sync({
				spaceId,
				ops: [
					{
						tag: 'add',
						clientMutationId: crypto.randomUUID(),
						totalCents,
						occurredAt: Date.now(),
						items: lines,
					},
				],
			});
			const rejected = results.find((row) => row.outcome === 'rejected');
			if (rejected?.rejectionCode) onError(t(REJECTION_MESSAGES[rejected.rejectionCode]));
			else setAmounts({});
		} catch (failure) {
			const code = convexErrorCode(failure);
			const descriptor = isAppErrorCode(code) ? STOCK_ERROR_MESSAGES[code] : undefined;
			onError(descriptor ? t(descriptor) : t`操作失敗，請再試一次。`);
		} finally {
			setPending(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h2>
						<Trans>低於安全警戒</Trans>
					</h2>
				</CardTitle>
			</CardHeader>
			<CardContent>
				{short.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyDescription>{t`沒有低於安全警戒的物資。`}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
						<ItemGroup className="gap-0">
							{short.map((item, index) => (
								<Fragment key={item._id}>
									{index > 0 && <ItemSeparator />}
									<Item size="sm">
										<ItemContent className="min-w-0">
											<ItemTitle>{item.name}</ItemTitle>
										</ItemContent>
										<ItemActions>
											{linked.has(item._id) ? (
												<Badge variant="secondary">
													<Trans>已在清單</Trans>
												</Badge>
											) : (
												<Field orientation="horizontal" className="w-fit">
													<FieldLabel htmlFor={`restock-${item._id}`}>
														<Trans>補</Trans>
													</FieldLabel>
													<Input
														id={`restock-${item._id}`}
														type="number"
														inputMode="numeric"
														min={0}
														max={99}
														step={1}
														required
														aria-label={t`補 ${item.name}`}
														value={amounts[item._id] ?? String(item.buy)}
														onChange={(event) => {
															const value = event.target.value;
															setAmounts((current) => ({ ...current, [item._id]: value }));
														}}
														className="w-14"
													/>
													<span>{t(UNIT_LABELS[item.unit])}</span>
												</Field>
											)}
										</ItemActions>
									</Item>
								</Fragment>
							))}
						</ItemGroup>
						{missing.length > 0 && (
							<div className="flex flex-wrap items-end justify-between gap-3">
								<Field className="w-28">
									<FieldLabel htmlFor="purchase-total">
										<Trans>總計 HK$</Trans>
									</FieldLabel>
									<Input
										id="purchase-total"
										name="total"
										required
										inputMode="decimal"
										className="tabular-nums"
									/>
								</Field>
								<Button type="submit" disabled={pending}>
									<Trans>建立採購記錄</Trans>
								</Button>
							</div>
						)}
					</form>
				)}
			</CardContent>
		</Card>
	);
}
