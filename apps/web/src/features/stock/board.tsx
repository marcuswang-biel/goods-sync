import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { api } from '@goods/backend/convex/_generated/api';
import { compareUrgency, isAttention, isExpiring, isShort } from '@goods/domain/stock';
import { convexErrorCode } from '@goods/shared/convex-error';
import { isAppErrorCode } from '@goods/shared/error-codes';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { REJECTION_MESSAGES, STOCK_ERROR_MESSAGES } from '@/features/stock/errors';
import { SHELF_LABELS, UNIT_LABELS } from '@/features/stock/labels';
import { LevelBar } from '@/features/stock/level-bar';
import { todayIso } from '@/features/stock/money';

const panel = 'rounded-[8px] border border-[#e6e6e6] bg-white';

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
	shortfall: number;
};

function figureClass(attention: boolean, zero: boolean): string {
	if (zero || !attention) return 'text-[#6b6b6b]';
	return 'text-[#1d5fbf]';
}

export function Board({ spaceId }: { spaceId: Id<'spaces'> }) {
	const { t } = useLingui();
	const board = useQuery(convexQuery(api.stock.board, { spaceId, today: todayIso() }));
	const sync = useConvexMutation(api.stock.sync);
	const [error, setError] = useState<string | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);

	const describe = (failure: unknown) => {
		const code = convexErrorCode(failure);
		const descriptor = isAppErrorCode(code) ? STOCK_ERROR_MESSAGES[code] : undefined;
		return descriptor ? t(descriptor) : t`操作失敗，請再試一次。`;
	};

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
	const attention = items.filter((item) => isAttention(item));
	const lead = [...attention].sort(compareUrgency)[0] ?? null;
	const expiring = items.filter((item) => isExpiring(item.freshness));
	const short = items.filter((item) => isShort(item.supply));
	const onHand = items.reduce((sum, item) => sum + item.quantity, 0);
	const attentionCount = attention.length;
	const unit = (code: keyof typeof UNIT_LABELS) => t(UNIT_LABELS[code]);
	const shelf = (code: keyof typeof SHELF_LABELS) => t(SHELF_LABELS[code]);
	const shelves = [...new Set(items.map((item) => item.shelf))];

	return (
		<div className="mx-auto grid w-full max-w-[1128px] gap-3 px-4 py-6 lg:px-0">
			<div className="grid grid-cols-12 items-start gap-3">
				<div className="col-span-12 lg:col-span-8">
					<h1 className="text-[24px] leading-none font-medium">{board.data.space.name}</h1>
					<p className="mt-3 max-w-[40rem] text-sm leading-6">
						{lead ? (
							<Trans>
								{attentionCount} 樣要處理，最先是 {lead.name}。
							</Trans>
						) : (
							<Trans>現在沒有要先吃掉或補貨的物資。</Trans>
						)}
					</p>
				</div>
				<div className="col-span-12 flex items-end justify-between gap-3 lg:col-span-4 lg:justify-end">
					<div>
						<p
							className={`text-[30px] leading-none tabular-nums ${attentionCount === 0 ? 'text-[#6b6b6b]' : 'text-[#1d5fbf]'}`}
						>
							{attentionCount}
						</p>
						<p className="mt-1 text-xs text-[#6b6b6b]">
							<Trans>要處理</Trans>
						</p>
					</div>
					<div className="flex items-center gap-3">
						{short.length > 0 && lead && lead.quantity > 0 && (
							<Link to="/purchases" className="text-sm">
								<Trans>一鍵採購</Trans>
							</Link>
						)}
						{lead && lead.quantity > 0 ? (
							<button
								type="button"
								className="h-9 rounded-[6px] bg-[#141414] px-3 text-sm text-white active:opacity-80 disabled:opacity-50"
								disabled={pendingId !== null}
								onClick={() => void take(lead)}
							>
								<Trans>領走 1 {unit(lead.unit)}</Trans>
							</button>
						) : (
							<Link
								to="/purchases"
								className="inline-flex h-9 items-center rounded-[6px] bg-[#141414] px-3 text-sm text-white"
							>
								<Trans>一鍵採購</Trans>
							</Link>
						)}
					</div>
				</div>
			</div>

			{error && (
				<p role="alert" className="text-sm text-[#831c1e]">
					{error}
				</p>
			)}

			<section className={`${panel} grid grid-cols-3`} aria-label={t`數量`}>
				{[
					{ label: t`要先吃掉`, value: expiring.length },
					{ label: t`不夠了`, value: short.length },
					{ label: t`在架上`, value: onHand },
				].map((cell, index) => (
					<div
						key={cell.label}
						className={`px-4 py-3 ${index > 0 ? 'border-l border-[#f0f0f0]' : ''}`}
					>
						<p className="text-xs text-[#6b6b6b]">{cell.label}</p>
						<p className="mt-1 text-base tabular-nums">{cell.value}</p>
					</div>
				))}
			</section>

			<div className="grid grid-cols-12 items-start gap-3">
				<section className={`${panel} col-span-12 p-4 lg:col-span-8`}>
					<div className="mb-3 flex items-baseline justify-between">
						<h2 className="text-base font-medium">
							<Trans>貨架</Trans>
						</h2>
						<span className="flex gap-4 text-sm">
							<Link to="/stock" search={{ q: '' }} hash="add-item">
								<Trans>放上貨架</Trans>
							</Link>
							<Link to="/stock" search={{ q: '' }}>
								<Trans>查看全部</Trans>
							</Link>
						</span>
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
												<span
													className={`w-14 text-right text-sm tabular-nums ${figureClass(isAttention(item), item.quantity === 0)}`}
												>
													{item.quantity}
													<span className="ml-1 text-xs text-[#6b6b6b]">{unit(item.unit)}</span>
												</span>
												{item.quantity > 0 && item._id !== lead?._id && (
													<button
														type="button"
														className="h-9 text-sm underline-offset-2 hover:underline disabled:opacity-50"
														disabled={pendingId !== null}
														onClick={() => void take(item)}
													>
														<Trans>領用</Trans>
													</button>
												)}
											</li>
										))}
								</ul>
							</div>
						))
					)}
				</section>

				<div className="col-span-12 grid gap-3 lg:col-span-4">
					<Shortfall items={items} />
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
					title={t`要先吃掉`}
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

function Shortfall({ items }: { items: readonly BoardItem[] }) {
	const rows = items
		.filter((item) => item.shortfall > 0)
		.sort((left, right) => right.shortfall - left.shortfall);
	const max = rows.reduce((peak, row) => Math.max(peak, row.shortfall), 0);
	return (
		<section className={`${panel} p-4`}>
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="text-base font-medium">
					<Trans>離安全庫存還差</Trans>
				</h2>
				{rows.length > 0 && (
					<Link to="/purchases" className="text-sm">
						<Trans>一鍵採購</Trans>
					</Link>
				)}
			</div>
			{rows.length === 0 ? (
				<p className="mt-3 text-sm text-[#6b6b6b]">
					<Trans>沒有短少。差 0。</Trans>
				</p>
			) : (
				<ul className="mt-3">
					{rows.map((row) => (
						<li key={row._id} className="mb-3 last:mb-0">
							<div className="flex items-baseline justify-between text-sm">
								<span>{row.name}</span>
								<span className="text-[#1d5fbf] tabular-nums">{row.shortfall}</span>
							</div>
							<div className="mt-1 flex h-2.5">
								<span
									className="h-2.5 rounded-full bg-[#1d5fbf]"
									style={{ width: `${(row.shortfall / max) * 88}%` }}
								/>
							</div>
						</li>
					))}
					<p className="mt-2 text-xs text-[#6b6b6b]">
						<Trans>最長的條是差 {max}。</Trans>
					</p>
				</ul>
			)}
		</section>
	);
}

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
