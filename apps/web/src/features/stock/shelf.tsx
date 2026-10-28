import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { api } from '@goods/backend/convex/_generated/api';
import { isExpiring, isShort } from '@goods/domain/stock';
import { convexErrorCode } from '@goods/shared/convex-error';
import { isAppErrorCode } from '@goods/shared/error-codes';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { REJECTION_MESSAGES, STOCK_ERROR_MESSAGES } from '@/features/stock/errors';
import { CATEGORY_LABELS, SHELF_LABELS, UNIT_LABELS } from '@/features/stock/labels';
import { LevelBar, StockAmount } from '@/features/stock/level-bar';
import { todayIso } from '@/features/stock/money';
import { ConfirmRemove } from '@/features/stock/remove-dialog';

/** Full shelf table: search, take, and delete. Delete stays off the board. */
export function ShelfTable({
	spaceId,
	query,
	onSearch,
}: {
	spaceId: Id<'spaces'>;
	query: string;
	onSearch: (query: string) => void;
}) {
	const { t } = useLingui();
	const board = useQuery(convexQuery(api.stock.board, { spaceId, today: todayIso() }));
	const sync = useConvexMutation(api.stock.sync);
	const remove = useConvexMutation(api.stock.remove);
	const [error, setError] = useState<string | null>(null);
	const [removing, setRemoving] = useState<{ id: Id<'items'>; name: string } | null>(null);
	const [removingBusy, setRemovingBusy] = useState(false);
	const needle = query.trim().toLowerCase();
	const items = (board.data?.items ?? []).filter((item) =>
		needle.length === 0 ? true : item.name.toLowerCase().includes(needle),
	);

	/** Records a one-unit take against the item's current version. */
	const take = async (itemId: Id<'items'>, version: number) => {
		setError(null);
		try {
			const result = await sync({
				spaceId,
				itemId,
				ops: [
					{
						clientMutationId: crypto.randomUUID(),
						kind: 'consume',
						quantity: 1,
						occurredAt: Date.now(),
						causalParentClientId: null,
						observedVersion: version,
					},
				],
			});
			const rejected = result.results.find((row) => row.outcome === 'rejected');
			if (rejected?.rejectionCode) setError(t(REJECTION_MESSAGES[rejected.rejectionCode]));
		} catch (failure) {
			const code = convexErrorCode(failure);
			const descriptor = isAppErrorCode(code) ? STOCK_ERROR_MESSAGES[code] : undefined;
			setError(descriptor ? t(descriptor) : t`操作失敗，請再試一次。`);
		}
	};

	/** Deletes the good named in the confirm dialog, then closes it. */
	const confirmRemove = async () => {
		if (!removing) return;
		setError(null);
		setRemovingBusy(true);
		try {
			await remove({ spaceId, itemId: removing.id });
			setRemoving(null);
		} catch (failure) {
			const code = convexErrorCode(failure);
			const descriptor = isAppErrorCode(code) ? STOCK_ERROR_MESSAGES[code] : undefined;
			setError(descriptor ? t(descriptor) : t`操作失敗，請再試一次。`);
			setRemoving(null);
		} finally {
			setRemovingBusy(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-[1128px] px-4 py-6 lg:px-0">
			<div className="mb-3 flex items-baseline justify-between gap-3">
				<h1 className="text-[24px] leading-none font-medium">
					<Trans>貨架</Trans>
				</h1>
				<p className="text-sm text-[#6b6b6b] tabular-nums">
					<Trans>{items.length} 樣</Trans>
				</p>
			</div>
			<AddItem spaceId={spaceId} onError={setError} />
			{error && (
				<p id="shelf-error" role="alert" className="mb-3 text-sm text-[#831c1e]">
					{error}
				</p>
			)}
			<form className="mb-3" onSubmit={(event) => event.preventDefault()}>
				<label className="grid max-w-sm gap-2 text-sm">
					<Trans>搜尋物資</Trans>
					<input
						type="search"
						value={query}
						onChange={(event) => {
							onSearch(event.target.value);
						}}
						className={fieldClass}
					/>
				</label>
			</form>
			{board.isPending ? (
				<p className="text-sm">{t`正在讀這個空間的貨架。`}</p>
			) : items.length === 0 ? (
				<p className="text-sm text-[#6b6b6b]">{t`沒有符合的物資。`}</p>
			) : (
				<div className="overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-white">
					<table className="hidden w-full text-sm md:table">
						<thead>
							<tr className="text-left text-xs text-[#6b6b6b]">
								<th className="px-4 py-2 font-normal">
									<Trans>物資</Trans>
								</th>
								<th className="px-4 py-2 font-normal">
									<Trans>貨架位置</Trans>
								</th>
								<th className="px-4 py-2 font-normal">
									<Trans>在架上</Trans>
								</th>
								<th className="px-4 py-2 text-right font-normal">
									<Trans>安全</Trans>
								</th>
								<th className="px-4 py-2 text-right font-normal">
									<Trans>到期</Trans>
								</th>
								<th className="px-4 py-2 font-normal">
									<span className="sr-only">
										<Trans>領用或刪除</Trans>
									</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{items.map((item) => (
								<tr key={item._id} className="border-t border-[#f0f0f0]">
									<td className="px-4 py-2">
										{item.name}
										{isExpiring(item.freshness) && (
											<span className="ml-2 text-xs text-[#1d5fbf]">
												<Trans>即將過期</Trans>
											</span>
										)}
										{!isExpiring(item.freshness) && isShort(item.supply) && (
											<span className="ml-2 text-xs text-[#1d5fbf]">
												<Trans>不夠了</Trans>
											</span>
										)}
									</td>
									<td className="px-4 py-2 text-[#6b6b6b]">{t(SHELF_LABELS[item.shelf])}</td>
									<td className="px-4 py-2">
										<span className="flex w-full items-center justify-start gap-3">
											<LevelBar quantity={item.quantity} safetyQuantity={item.safetyQuantity} />
											<StockAmount
												quantity={item.quantity}
												unit={t(UNIT_LABELS[item.unit])}
												safetyQuantity={item.safetyQuantity}
												className={
													item.quantity === 0
														? 'text-[#6b6b6b]'
														: isAttentionish(item)
															? 'text-[#1d5fbf]'
															: ''
												}
											/>
										</span>
									</td>
									<td className="px-4 py-2 text-right text-[#6b6b6b] tabular-nums">
										{item.safetyQuantity}
									</td>
									<td className="px-4 py-2 text-right text-[#6b6b6b] tabular-nums">
										{item.expiresOn ?? '—'}
									</td>
									<td className="px-4 py-2 text-right">
										{item.quantity > 0 && (
											<button
												type="button"
												className="h-9 text-sm hover:underline disabled:opacity-50"
												disabled={removingBusy}
												onClick={() => void take(item._id, item.version)}
											>
												<Trans>領用</Trans>
											</button>
										)}
										<button
											type="button"
											className="ml-3 h-9 text-sm text-[#831c1e] hover:underline disabled:opacity-50"
											disabled={removingBusy}
											aria-label={t`刪除 ${item.name}`}
											onClick={() => setRemoving({ id: item._id, name: item.name })}
										>
											<Trans>刪除</Trans>
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<ul className="md:hidden">
						{items.map((item) => (
							<li
								key={item._id}
								className="flex min-h-11 items-center gap-3 border-t border-[#f0f0f0] px-4 py-2 first:border-t-0"
							>
								<div className="min-w-0">
									<p className="truncate text-sm">{item.name}</p>
									<p className="text-xs text-[#6b6b6b]">
										{t(SHELF_LABELS[item.shelf])} · {item.expiresOn ?? '—'}
									</p>
								</div>
								<div className="flex items-center gap-3">
									<LevelBar
										quantity={item.quantity}
										safetyQuantity={item.safetyQuantity}
										className="w-16 shrink-0"
									/>
									<StockAmount
										quantity={item.quantity}
										unit={t(UNIT_LABELS[item.unit])}
										safetyQuantity={item.safetyQuantity}
									/>
									{item.quantity > 0 && (
										<button
											type="button"
											className="h-11 text-sm disabled:opacity-50"
											disabled={removingBusy}
											onClick={() => void take(item._id, item.version)}
										>
											<Trans>領用</Trans>
										</button>
									)}
									<button
										type="button"
										className="h-11 text-sm text-[#831c1e] disabled:opacity-50"
										disabled={removingBusy}
										aria-label={t`刪除 ${item.name}`}
										onClick={() => setRemoving({ id: item._id, name: item.name })}
									>
										<Trans>刪除</Trans>
									</button>
								</div>
							</li>
						))}
					</ul>
				</div>
			)}
			<ConfirmRemove
				name={removing?.name ?? null}
				busy={removingBusy}
				onClose={() => setRemoving(null)}
				onConfirm={() => void confirmRemove()}
			/>
		</div>
	);
}

/** Shared outline for the shelf form controls. */
const fieldClass = 'h-10 rounded-[6px] border border-[#d4d4d4] bg-white px-3';

/** English category codes stored on an item. The label is translated in the form. */
const categoryCodes = [
	'snack',
	'coffee',
	'tissue',
	'dairy',
	'fresh',
	'paper',
	'seasoning',
	'supply',
	'drink',
	'staple',
	'fruit',
	'frozen',
	'care',
] as const;
/** English unit codes stored on an item. */
const unitCodes = ['carton', 'slab', 'bag', 'roll', 'bottle', 'ream', 'can', 'piece'] as const;
/** English shelf codes stored on an item. */
const shelfCodes = ['fridge', 'tearoom', 'washroom', 'sink', 'cupboard', 'printroom'] as const;

/** True when the form posted a known category code. */
function isCategory(value: string): value is (typeof categoryCodes)[number] {
	return categoryCodes.some((code) => code === value);
}

/** True when the form posted a known unit code. */
function isUnit(value: string): value is (typeof unitCodes)[number] {
	return unitCodes.some((code) => code === value);
}

/** True when the form posted a known shelf code. */
function isShelf(value: string): value is (typeof shelfCodes)[number] {
	return shelfCodes.some((code) => code === value);
}

/** Form that places a new good on the shelf. The heading is the only "add" label. */
function AddItem({
	spaceId,
	onError,
}: {
	spaceId: Id<'spaces'>;
	onError: (message: string | null) => void;
}) {
	const { t } = useLingui();
	const create = useConvexMutation(api.stock.create);
	const [name, setName] = useState('');
	const [category, setCategory] = useState<keyof typeof CATEGORY_LABELS>('snack');
	const [unit, setUnit] = useState<keyof typeof UNIT_LABELS>('bag');
	const [quantity, setQuantity] = useState('1');
	const [safety, setSafety] = useState('1');
	const [expiresOn, setExpiresOn] = useState('');
	const [shelf, setShelf] = useState<keyof typeof SHELF_LABELS>('cupboard');

	/** Validates the form and creates the good. Integers only; expiry is optional. */
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		onError(null);
		const parsedQuantity = Number(quantity);
		const parsedSafety = Number(safety);
		if (!Number.isInteger(parsedQuantity) || !Number.isInteger(parsedSafety)) {
			onError(t`數量和安全警戒都要是整數。`);
			return;
		}
		try {
			await create({
				spaceId,
				name,
				category,
				unit,
				quantity: parsedQuantity,
				safetyQuantity: parsedSafety,
				expiresOn: expiresOn === '' ? null : expiresOn,
				shelf,
			});
			setName('');
			setExpiresOn('');
		} catch (failure) {
			const code = convexErrorCode(failure);
			const descriptor = isAppErrorCode(code) ? STOCK_ERROR_MESSAGES[code] : undefined;
			onError(descriptor ? t(descriptor) : t`操作失敗，請再試一次。`);
		}
	};

	return (
		<section id="add-item" className="mb-4 rounded-[8px] border border-[#e6e6e6] bg-white p-4">
			<h2 className="text-base font-medium">
				<Trans>增加新物資</Trans>
			</h2>
			<form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-4 md:grid-cols-4">
				<label className="grid gap-2 text-sm md:col-span-2">
					<Trans>名稱</Trans>
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						required
						className={fieldClass}
					/>
				</label>
				<label className="grid gap-2 text-sm">
					<Trans>種類</Trans>
					<select
						value={category}
						onChange={(event) => {
							const next = event.target.value;
							if (isCategory(next)) setCategory(next);
						}}
						className={fieldClass}
					>
						{categoryCodes.map((code) => (
							<option key={code} value={code}>
								{t(CATEGORY_LABELS[code])}
							</option>
						))}
					</select>
				</label>
				<label className="grid gap-2 text-sm">
					<Trans>規格</Trans>
					<select
						value={unit}
						onChange={(event) => {
							const next = event.target.value;
							if (isUnit(next)) setUnit(next);
						}}
						className={fieldClass}
					>
						{unitCodes.map((code) => (
							<option key={code} value={code}>
								{t(UNIT_LABELS[code])}
							</option>
						))}
					</select>
				</label>
				<label className="grid gap-2 text-sm">
					<Trans>數量</Trans>
					<input
						value={quantity}
						onChange={(event) => setQuantity(event.target.value)}
						inputMode="numeric"
						className={`${fieldClass} tabular-nums`}
					/>
				</label>
				<label className="grid gap-2 text-sm">
					<Trans>安全警戒</Trans>
					<input
						value={safety}
						onChange={(event) => setSafety(event.target.value)}
						inputMode="numeric"
						className={`${fieldClass} tabular-nums`}
					/>
				</label>
				<label className="grid gap-2 text-sm">
					<Trans>到期</Trans>
					<input
						type="date"
						value={expiresOn}
						onChange={(event) => setExpiresOn(event.target.value)}
						className={fieldClass}
					/>
				</label>
				<label className="grid gap-2 text-sm">
					<Trans>貨架位置</Trans>
					<select
						value={shelf}
						onChange={(event) => {
							const next = event.target.value;
							if (isShelf(next)) setShelf(next);
						}}
						className={fieldClass}
					>
						{shelfCodes.map((code) => (
							<option key={code} value={code}>
								{t(SHELF_LABELS[code])}
							</option>
						))}
					</select>
				</label>
				<div className="md:self-end">
					<button type="submit" className="h-9 rounded-[6px] bg-[#141414] px-3 text-sm text-white">
						<Trans>放上貨架</Trans>
					</button>
				</div>
			</form>
		</section>
	);
}

/** True when a stocked item is expiring or under its safety line. Empty shelves are not badged. */
function isAttentionish(item: {
	freshness: 'undated' | 'ok' | 'soon' | 'expired';
	supply: 'ok' | 'low' | 'out';
	quantity: number;
}): boolean {
	return item.quantity > 0 && (isExpiring(item.freshness) || isShort(item.supply));
}
