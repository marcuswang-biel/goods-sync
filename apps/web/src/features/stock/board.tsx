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

import { REJECTION_MESSAGES, STOCK_ERROR_MESSAGES } from '@/features/stock/errors';
import { SHELF_LABELS, UNIT_LABELS } from '@/features/stock/labels';
import { LevelBar, StockAmount } from '@/features/stock/level-bar';
import { todayIso } from '@/features/stock/money';

/** Shared card chrome for the board panels. */
const panel = 'rounded-[8px] border border-[#e6e6e6] bg-white';

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

/** Ink for a quantity that needs attention. Gray when the shelf is fine or empty. */
function figureClass(attention: boolean, zero: boolean): string {
	if (zero || !attention) return 'text-[#6b6b6b]';
	return 'text-[#1d5fbf]';
}

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
		return <p className="px-4 py-8 text-sm lg:px-0">{t`正在讀這個空間的貨架。`}</p>;
	}
	if (board.isError || !board.data) {
		return (
			<p className="px-4 py-8 text-sm lg:px-0" role="alert">
				{t`讀不到貨架，請再試一次。`}
			</p>
		);
	}

	const items = board.data.items;
	const expiring = items.filter((item) => isExpiring(item.freshness));
	const short = items.filter((item) => isShort(item.supply));
	const unit = (code: keyof typeof UNIT_LABELS) => t(UNIT_LABELS[code]);
	const shelf = (code: keyof typeof SHELF_LABELS) => t(SHELF_LABELS[code]);
	const shelves = [...new Set(items.map((item) => item.shelf))];

	return (
		<div className="mx-auto grid w-full max-w-[1128px] gap-3 px-4 py-6 lg:px-0">
			<h1 className="text-[24px] leading-none font-medium">{board.data.space.name}</h1>

			{error && (
				<p role="alert" className="text-sm text-[#831c1e]">
					{error}
				</p>
			)}

			<div className="grid grid-cols-12 items-start gap-3">
				<section className={`${panel} col-span-12 p-4 lg:col-span-8`}>
					<div className="mb-3 flex items-baseline justify-between">
						<h2 className="text-base font-medium">
							<Trans>貨架</Trans>
						</h2>
						<Link to="/stock" search={{ q: '' }} className="text-sm">
							<Trans>查看全部</Trans>
						</Link>
					</div>
					{items.length === 0 ? (
						<p className="text-sm text-[#6b6b6b]">
							<Trans>這個空間還沒有公共物資。</Trans>
						</p>
					) : (
						shelves.map((code) => (
							<div key={code} className="mt-3 first:mt-0">
								<h3 className="text-xs text-[#6b6b6b]">{shelf(code)}</h3>
								<ul>
									{items
										.filter((item) => item.shelf === code)
										.map((item) => (
											<li
												key={item._id}
												className="flex min-h-11 items-center gap-3 border-b border-[#f0f0f0] last:border-b-0"
											>
												<span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
												<LevelBar quantity={item.quantity} safetyQuantity={item.safetyQuantity} />
												<StockAmount
													quantity={item.quantity}
													unit={unit(item.unit)}
													safetyQuantity={item.safetyQuantity}
													className={figureClass(isAttention(item), item.quantity === 0)}
												/>
												<span className="flex w-12 shrink-0 items-center justify-end">
													{item.quantity > 0 && (
														<button
															type="button"
															className="h-9 text-sm underline-offset-2 hover:underline disabled:opacity-50"
															disabled={pendingId !== null}
															onClick={() => void take(item)}
														>
															<Trans>領用</Trans>
														</button>
													)}
												</span>
											</li>
										))}
								</ul>
							</div>
						))
					)}
				</section>

				<div className="col-span-12 grid gap-3 lg:col-span-4">
					<section className={`${panel} p-4`}>
						<h2 className="text-base font-medium">
							<Trans>最近的領用</Trans>
						</h2>
						{board.data.movements.length === 0 ? (
							<p className="mt-3 text-sm leading-6 text-[#6b6b6b]">
								<Trans>還沒有人領用。較早的離線領用會留下，較晚的那一筆會被拒絕。</Trans>
							</p>
						) : (
							<ul className="mt-2">
								{board.data.movements.slice(0, 4).map((movement) => (
									<li
										key={movement._id}
										className="flex min-h-11 items-center gap-2 border-b border-[#f0f0f0] text-sm last:border-b-0"
									>
										<span className="min-w-0 flex-1 truncate">
											{movement.actorLabel} {movement.kind === 'consume' ? t`領走` : t`補上`}{' '}
											{movement.quantity} {unit(movement.unit)} {movement.itemName}
										</span>
										{movement.outcome === 'rejected' && (
											<span className="shrink-0 text-xs text-[#831c1e]">
												<Trans>沒扣成</Trans>
											</span>
										)}
									</li>
								))}
							</ul>
						)}
					</section>
				</div>
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
		<section className={`${panel} col-span-12 p-4 lg:col-span-6`}>
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="text-base font-medium">{title}</h2>
				{purchase && rows.length > 0 && (
					<Link to="/purchases" className="text-sm">
						<Trans>一鍵採購</Trans>
					</Link>
				)}
			</div>
			{rows.length === 0 ? (
				<p className="mt-3 text-sm text-[#6b6b6b]">{empty}</p>
			) : (
				<ul className="mt-2">
					{rows.slice(0, 4).map((item) => (
						<li
							key={item._id}
							className="flex min-h-11 items-center justify-between gap-3 border-b border-[#f0f0f0] text-sm last:border-b-0"
						>
							<span className="truncate">{item.name}</span>
							<span className="shrink-0 text-[#6b6b6b] tabular-nums">
								{item.expiresOn ?? '—'}
								<span className="ml-3 text-[#0a0a0a]">{item.quantity}</span>
								<span className="ml-1">{unit(item.unit)}</span>
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
