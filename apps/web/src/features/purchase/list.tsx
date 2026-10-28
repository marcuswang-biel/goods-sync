import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { api } from '@goods/backend/convex/_generated/api';
import { unitsToRestock } from '@goods/domain/purchase';
import { convexErrorCode } from '@goods/shared/convex-error';
import { isAppErrorCode } from '@goods/shared/error-codes';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

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
		<div className="mx-auto grid w-full max-w-[1128px] gap-3 px-4 py-6 lg:px-0">
			<div className="flex items-end justify-between gap-3">
				<h1 className="text-[24px] leading-none font-medium">
					<Trans>採購</Trans>
				</h1>
				<p className="text-[30px] leading-none font-bold tabular-nums">{formatCents(total)}</p>
			</div>
			<p className="text-sm">
				<Trans>未採購合計</Trans>
			</p>
			{error && (
				<p role="alert" className="text-sm text-[#831c1e]">
					{error}
				</p>
			)}
			<ShortfallPurchase
				spaceId={spaceId}
				items={board.data?.items ?? []}
				openItemIds={openItemIds}
				onError={setError}
			/>
			<section className="rounded-[8px] border border-[#e6e6e6] bg-white">
				<h2 className="border-b border-[#f0f0f0] px-4 py-3 text-base font-medium">
					<Trans>採購記錄</Trans>
				</h2>
				{list.isPending ? (
					<p className="p-4 text-sm">{t`正在讀採購清單。`}</p>
				) : purchases.length === 0 ? (
					<p className="p-4 text-sm text-[#6b6b6b]">{t`清單是空的。`}</p>
				) : (
					<ul>
						{visible.map((purchase) => (
							<li
								key={purchase._id}
								className="border-b border-[#f0f0f0] px-4 py-3 last:border-b-0"
							>
								<ul>
									{purchase.items.map((item) => (
										<li key={item._id} className="flex min-h-11 items-center gap-3">
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm">{item.name}</p>
												{purchase.status === 'open' ? (
													<BuyAmount spaceId={spaceId} item={item} onError={setError} />
												) : (
													<p className="text-xs text-[#6b6b6b]">
														<Trans>補 {item.quantity}</Trans>
														{item.unit ? ` ${t(UNIT_LABELS[item.unit])}` : ''}
													</p>
												)}
											</div>
										</li>
									))}
								</ul>
								<div className="flex min-h-11 items-center justify-end gap-3">
									{purchase.status === 'bought' && (
										<p className="mr-auto text-xs text-[#6b6b6b]">
											<Trans>已採購</Trans>
										</p>
									)}
									<p className="text-sm font-bold tabular-nums">
										{formatCents(purchase.totalCents)}
									</p>
									{purchase.status === 'open' && (
										<button
											type="button"
											className={
												purchase._id === firstOpen?._id
													? 'h-9 rounded-[6px] bg-[#141414] px-3 text-sm text-white'
													: 'h-9 text-sm hover:underline'
											}
											onClick={() => void buy(purchase.clientMutationId)}
										>
											<Trans>已採購</Trans>
										</button>
									)}
								</div>
							</li>
						))}
					</ul>
				)}
				{pageCount > 1 && (
					<nav
						aria-label={t`採購記錄分頁`}
						className="flex flex-wrap items-center justify-end gap-1 border-t border-[#f0f0f0] px-4 py-3"
					>
						<button
							type="button"
							disabled={safePage === 0}
							onClick={() => setPage(safePage - 1)}
							className="h-9 px-3 text-sm disabled:text-[#6b6b6b]"
						>
							<Trans>上一頁</Trans>
						</button>
						{Array.from({ length: pageCount }, (_, index) => (
							<button
								key={index}
								type="button"
								aria-label={t`第 ${index + 1} 頁`}
								aria-current={index === safePage ? 'page' : undefined}
								onClick={() => setPage(index)}
								className={
									index === safePage
										? 'h-9 min-w-9 rounded-[6px] bg-[#141414] px-2 text-sm text-white tabular-nums'
										: 'h-9 min-w-9 px-2 text-sm tabular-nums hover:underline'
								}
							>
								{index + 1}
							</button>
						))}
						<button
							type="button"
							disabled={safePage >= pageCount - 1}
							onClick={() => setPage(safePage + 1)}
							className="h-9 px-3 text-sm disabled:text-[#6b6b6b]"
						>
							<Trans>下一頁</Trans>
						</button>
					</nav>
				)}
			</section>
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
		<label className="mt-1 flex items-center gap-1.5 text-xs text-[#6b6b6b]">
			<Trans>補</Trans>
			<input
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
				className="h-8 w-14 rounded-[6px] border border-[#d4d4d4] bg-white px-2 text-right text-sm text-[#0a0a0a] tabular-nums"
			/>
			{item.unit ? t(UNIT_LABELS[item.unit]) : null}
		</label>
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
		.toSorted((left, right) => right.buy - left.buy);
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
		<section className="rounded-[8px] border border-[#e6e6e6] bg-white p-4">
			<h2 className="text-base font-medium">
				<Trans>低於安全警戒</Trans>
			</h2>
			{short.length === 0 ? (
				<p className="mt-3 text-sm text-[#6b6b6b]">{t`沒有低於安全警戒的物資。`}</p>
			) : (
				<form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-4">
					<ul>
						{short.map((item) => (
							<li key={item._id} className="flex min-h-11 items-center justify-between gap-3">
								<span className="truncate text-sm">{item.name}</span>
								{linked.has(item._id) ? (
									<span className="text-xs text-[#6b6b6b]">
										<Trans>已在清單</Trans>
									</span>
								) : (
									<label className="flex shrink-0 items-center gap-1.5 text-xs text-[#6b6b6b]">
										<Trans>補</Trans>
										<input
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
											className="h-8 w-14 rounded-[6px] border border-[#d4d4d4] bg-white px-2 text-right text-sm text-[#0a0a0a] tabular-nums"
										/>
										{t(UNIT_LABELS[item.unit])}
									</label>
								)}
							</li>
						))}
					</ul>
					{missing.length > 0 && (
						<div className="flex flex-wrap items-end justify-between gap-3">
							<label className="grid gap-2 text-sm">
								<Trans>總計 HK$</Trans>
								<input
									name="total"
									required
									inputMode="decimal"
									className="h-10 w-28 rounded-[6px] border border-[#d4d4d4] bg-white px-3 tabular-nums"
								/>
							</label>
							<button
								type="submit"
								disabled={pending}
								className="h-9 rounded-[6px] bg-[#141414] px-3 text-sm text-white disabled:opacity-50"
							>
								<Trans>建立採購記錄</Trans>
							</button>
						</div>
					)}
				</form>
			)}
		</section>
	);
}
