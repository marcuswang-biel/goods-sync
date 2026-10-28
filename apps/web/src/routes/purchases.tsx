import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { api } from '@goods/backend/convex/_generated/api';
import { unitsToRestock } from '@goods/domain/stock';
import { convexErrorCode } from '@goods/shared/convex-error';
import { isAppErrorCode } from '@goods/shared/error-codes';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';

import { RequireAuth } from '@/components/require-auth';
import { REJECTION_MESSAGES, STOCK_ERROR_MESSAGES } from '@/features/stock/errors';
import { CATEGORY_LABELS, SHELF_LABELS, UNIT_LABELS } from '@/features/stock/labels';
import { formatCents, todayIso } from '@/features/stock/money';
import { useActiveSpace } from '@/features/stock/space';

export const Route = createFileRoute('/purchases')({
	component: () => (
		<RequireAuth>
			<PurchasesPage />
		</RequireAuth>
	),
});

function PurchasesPage() {
	const { t } = useLingui();
	const { active, isPending } = useActiveSpace();
	if (isPending) return <p className="px-4 py-8 text-sm">{t`正在讀你的空間。`}</p>;
	if (!active) return <p className="px-4 py-8 text-sm">{t`你還沒有加入任何空間。`}</p>;
	return <PurchaseList spaceId={active._id} />;
}

function PurchaseList({ spaceId }: { spaceId: Id<'spaces'> }) {
	const { t } = useLingui();
	const list = useQuery(convexQuery(api.purchases.list, { spaceId }));
	const board = useQuery(convexQuery(api.stock.board, { spaceId, today: todayIso() }));
	const sync = useConvexMutation(api.purchases.sync);
	const [error, setError] = useState<string | null>(null);
	const [name, setName] = useState('');
	const [quantity, setQuantity] = useState('1');
	const [dollars, setDollars] = useState('');
	const [linked, setLinked] = useState('');

	const describe = (failure: unknown) => {
		const code = convexErrorCode(failure);
		const descriptor = isAppErrorCode(code) ? STOCK_ERROR_MESSAGES[code] : undefined;
		return descriptor ? t(descriptor) : t`操作失敗，請再試一次。`;
	};

	const buy = async (lineClientMutationId: string) => {
		setError(null);
		try {
			const results = await sync({
				spaceId,
				ops: [
					{
						tag: 'buy',
						clientMutationId: crypto.randomUUID(),
						lineClientMutationId,
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

	const add = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		const parsedQuantity = Number(quantity);
		const parsedDollars = Number(dollars);
		if (
			!Number.isInteger(parsedQuantity) ||
			parsedQuantity <= 0 ||
			!Number.isFinite(parsedDollars)
		) {
			setError(t`請填整數數量和金額。`);
			return;
		}
		const estimatedCents = Math.round(parsedDollars * 100);
		try {
			const results = await sync({
				spaceId,
				ops: [
					{
						tag: 'add',
						clientMutationId: crypto.randomUUID(),
						name,
						quantity: parsedQuantity,
						estimatedCents,
						linkedItemId:
							(board.data?.items ?? []).find((item) => item._id === linked)?._id ?? null,
						occurredAt: Date.now(),
					},
				],
			});
			const rejected = results.find((row) => row.outcome === 'rejected');
			if (rejected?.rejectionCode) {
				setError(t(REJECTION_MESSAGES[rejected.rejectionCode]));
				return;
			}
			setName('');
			setDollars('');
		} catch (failure) {
			setError(describe(failure));
		}
	};

	const lines = list.data?.lines ?? [];
	const open = lines.filter((line) => line.status === 'open');
	const total = open.reduce((sum, line) => sum + line.estimatedCents, 0);
	const perPerson = open.reduce((sum, line) => sum + (line.perPersonCents ?? 0), 0);
	const remainder = open.reduce((sum, line) => sum + (line.remainderCents ?? 0), 0);
	const budget = list.data?.budgetCents;
	const office = list.data?.kind === 'office';

	return (
		<div className="mx-auto grid w-full max-w-[1128px] gap-3 px-4 py-6 lg:px-0">
			<div className="flex items-end justify-between gap-3">
				<h1 className="text-[24px] leading-none font-medium">
					<Trans>採購</Trans>
				</h1>
				<p className="text-[30px] leading-none font-bold tabular-nums">{formatCents(total)}</p>
			</div>
			<p className="text-sm">
				{office ? (
					<Trans>
						未採購合計 {formatCents(total)}，部門預算 {formatCents(budget ?? 0)}。
					</Trans>
				) : (
					<Trans>
						未採購合計 {formatCents(total)}，按 {list.data?.memberCount ?? 0} 人分，每人{' '}
						{formatCents(perPerson)}，餘數 {formatCents(remainder)} 由勾選的人墊上。
					</Trans>
				)}
			</p>
			{error && (
				<p role="alert" className="text-sm text-[#831c1e]">
					{error}
				</p>
			)}
			<ShortfallPurchase
				spaceId={spaceId}
				items={board.data?.items ?? []}
				openLinkedIds={open.flatMap((line) => (line.linkedItemId ? [line.linkedItemId] : []))}
				onError={setError}
			/>
			<section className="rounded-[8px] border border-[#e6e6e6] bg-white">
				{list.isPending ? (
					<p className="p-4 text-sm">{t`正在讀採購清單。`}</p>
				) : lines.length === 0 ? (
					<p className="p-4 text-sm text-[#6b6b6b]">{t`清單是空的。`}</p>
				) : (
					<ul>
						{lines.map((line, index) => (
							<li key={line._id} className="border-b border-[#f0f0f0] px-4 py-2 last:border-b-0">
								<div className="flex min-h-11 items-center gap-3">
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm">{line.name}</p>
										<p className="text-xs text-[#6b6b6b]">
											{line.quantity} · {formatCents(line.estimatedCents)}
											{line.status === 'open' && line.perPersonCents !== null && (
												<>
													{' '}
													· <Trans>每人 {formatCents(line.perPersonCents)}</Trans>
												</>
											)}
											{line.status === 'bought' && <Trans> · 已採購</Trans>}
											{line.status === 'open' && !line.fitsBudget && <Trans> · 預算不夠</Trans>}
										</p>
									</div>
									<p className="text-sm font-bold tabular-nums">
										{formatCents(line.estimatedCents)}
									</p>
									{line.status === 'open' && (
										<button
											type="button"
											className={
												index === lines.findIndex((row) => row.status === 'open')
													? 'h-9 rounded-[6px] bg-[#141414] px-3 text-sm text-white'
													: 'h-9 text-sm hover:underline'
											}
											onClick={() => void buy(line.clientMutationId)}
										>
											<Trans>已採購</Trans>
										</button>
									)}
									{line.status === 'bought' && line.linkedItemId !== null && (
										<p className="text-sm text-[#6b6b6b]">
											<Trans>已入庫</Trans>
										</p>
									)}
								</div>
								{line.status === 'bought' && line.linkedItemId === null && (
									<ReceiveLine
										spaceId={spaceId}
										lineClientMutationId={line.clientMutationId}
										items={board.data?.items ?? []}
										onError={setError}
									/>
								)}
							</li>
						))}
					</ul>
				)}
			</section>
			<section className="rounded-[8px] border border-[#e6e6e6] bg-white p-4">
				<h2 className="text-base font-medium">
					<Trans>補一筆</Trans>
				</h2>
				<form onSubmit={(event) => void add(event)} className="mt-4 grid gap-4 md:grid-cols-4">
					<label className="grid gap-2 text-sm md:col-span-2">
						<Trans>名稱</Trans>
						<input
							value={name}
							onChange={(event) => setName(event.target.value)}
							required
							className="h-10 rounded-[6px] border border-[#d4d4d4] bg-white px-3"
						/>
					</label>
					<label className="grid gap-2 text-sm">
						<Trans>數量</Trans>
						<input
							value={quantity}
							onChange={(event) => setQuantity(event.target.value)}
							inputMode="numeric"
							className="h-10 rounded-[6px] border border-[#d4d4d4] bg-white px-3 tabular-nums"
						/>
					</label>
					<label className="grid gap-2 text-sm">
						<Trans>金額 HK$</Trans>
						<input
							value={dollars}
							onChange={(event) => setDollars(event.target.value)}
							inputMode="decimal"
							className="h-10 rounded-[6px] border border-[#d4d4d4] bg-white px-3 tabular-nums"
						/>
					</label>
					<label className="grid gap-2 text-sm md:col-span-2">
						<Trans>入到哪一項庫存</Trans>
						<select
							value={linked}
							onChange={(event) => setLinked(event.target.value)}
							className="h-10 rounded-[6px] border border-[#d4d4d4] bg-white px-3"
						>
							<option value="">{t`不連庫存`}</option>
							{(board.data?.items ?? []).map((item) => (
								<option key={item._id} value={item._id}>
									{item.name}
								</option>
							))}
						</select>
					</label>
					<div className="md:col-span-2 md:self-end">
						<button
							type="submit"
							className="h-9 rounded-[6px] border border-[#d4d4d4] bg-white px-3 text-sm"
						>
							<Trans>加入清單</Trans>
						</button>
					</div>
				</form>
			</section>
		</div>
	);
}

const priceField = 'h-10 w-28 rounded-[6px] border border-[#d4d4d4] bg-white px-3 tabular-nums';

function ShortfallPurchase({
	spaceId,
	items,
	openLinkedIds,
	onError,
}: {
	spaceId: Id<'spaces'>;
	items: ReadonlyArray<{
		_id: Id<'items'>;
		name: string;
		unit: keyof typeof UNIT_LABELS;
		quantity: number;
		safetyQuantity: number;
		shortfall: number;
	}>;
	openLinkedIds: ReadonlyArray<Id<'items'>>;
	onError: (message: string | null) => void;
}) {
	const { t } = useLingui();
	const sync = useConvexMutation(api.purchases.sync);
	const [pending, setPending] = useState(false);
	const linked = new Set(openLinkedIds);
	const short = items
		.flatMap((item) => {
			const buy = unitsToRestock(item.quantity, item.safetyQuantity);
			return buy === 0 ? [] : [{ ...item, buy }];
		})
		.toSorted((left, right) => right.buy - left.buy);
	const missing = short.filter((item) => !linked.has(item._id));

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (missing.length === 0) return;
		onError(null);
		const data = new FormData(event.currentTarget);
		const ops = [];
		for (const item of missing) {
			const raw = data.get(item._id);
			const dollars = typeof raw === 'string' ? Number(raw) : Number.NaN;
			const estimatedCents = Math.round(dollars * 100);
			if (!Number.isFinite(dollars) || estimatedCents <= 0) {
				onError(t`每一項都要填金額，才能一起分帳。`);
				return;
			}
			ops.push({
				tag: 'add' as const,
				clientMutationId: crypto.randomUUID(),
				name: item.name,
				quantity: item.buy,
				estimatedCents,
				linkedItemId: item._id,
				occurredAt: Date.now(),
			});
		}
		if (ops.length > 40) {
			onError(t`一次最多建立 40 筆。`);
			return;
		}
		setPending(true);
		try {
			const results = await sync({ spaceId, ops });
			const rejected = results.find((row) => row.outcome === 'rejected');
			if (rejected?.rejectionCode) onError(t(REJECTION_MESSAGES[rejected.rejectionCode]));
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
				<p className="mt-3 text-sm text-[#6b6b6b]">
					<Trans>沒有低於安全警戒的物資。</Trans>
				</p>
			) : (
				<form onSubmit={(event) => void submit(event)} className="mt-3">
					<ul>
						{short.map((item) => (
							<li key={item._id} className="border-b border-[#f0f0f0] py-2 last:border-b-0">
								{linked.has(item._id) ? (
									<div className="flex min-h-11 items-center gap-3">
										<span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
										<span className="shrink-0 text-sm text-[#1d5fbf] tabular-nums">
											<Trans>補 {item.buy}</Trans> {t(UNIT_LABELS[item.unit])}
										</span>
										<span className="text-sm text-[#6b6b6b]">
											<Trans>已在清單</Trans>
										</span>
									</div>
								) : (
									<label className="flex min-h-11 items-center gap-3">
										<span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
										<span className="shrink-0 text-sm text-[#1d5fbf] tabular-nums">
											<Trans>補 {item.buy}</Trans> {t(UNIT_LABELS[item.unit])}
										</span>
										<input
											name={item._id}
											inputMode="decimal"
											required
											placeholder={t`金額`}
											className={priceField}
										/>
									</label>
								)}
							</li>
						))}
					</ul>
					{missing.length > 0 && (
						<button
							type="submit"
							disabled={pending}
							className="mt-4 h-9 rounded-[6px] bg-[#141414] px-3 text-sm text-white disabled:opacity-50"
						>
							<Trans>建立採購記錄</Trans>
						</button>
					)}
				</form>
			)}
		</section>
	);
}

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
const unitCodes = ['carton', 'slab', 'bag', 'roll', 'bottle', 'ream', 'can', 'piece'] as const;
const shelfCodes = ['fridge', 'tearoom', 'washroom', 'sink', 'cupboard', 'printroom'] as const;

function isCategory(value: string): value is (typeof categoryCodes)[number] {
	return categoryCodes.some((code) => code === value);
}
function isUnit(value: string): value is (typeof unitCodes)[number] {
	return unitCodes.some((code) => code === value);
}
function isShelf(value: string): value is (typeof shelfCodes)[number] {
	return shelfCodes.some((code) => code === value);
}

function ReceiveLine({
	spaceId,
	lineClientMutationId,
	items,
	onError,
}: {
	spaceId: Id<'spaces'>;
	lineClientMutationId: string;
	items: ReadonlyArray<{ _id: Id<'items'>; name: string }>;
	onError: (message: string | null) => void;
}) {
	const { t } = useLingui();
	const sync = useConvexMutation(api.purchases.sync);
	const [mode, setMode] = useState<'existing' | 'new'>(items.length > 0 ? 'existing' : 'new');
	const [itemId, setItemId] = useState<string>(items[0]?._id ?? '');
	const [category, setCategory] = useState<(typeof categoryCodes)[number]>('snack');
	const [unit, setUnit] = useState<(typeof unitCodes)[number]>('bag');
	const [safety, setSafety] = useState('1');
	const [expiresOn, setExpiresOn] = useState('');
	const [shelf, setShelf] = useState<(typeof shelfCodes)[number]>('cupboard');
	const fieldClass = 'h-10 rounded-[6px] border border-[#d4d4d4] bg-white px-3';

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		onError(null);
		const clientMutationId = crypto.randomUUID();
		const occurredAt = Date.now();
		try {
			if (mode === 'existing') {
				const chosen = items.find((item) => item._id === itemId);
				if (!chosen) {
					onError(t`先選一項貨架上的貨物。`);
					return;
				}
				const results = await sync({
					spaceId,
					ops: [
						{
							tag: 'receive',
							mode: 'existing',
							clientMutationId,
							lineClientMutationId,
							occurredAt,
							itemId: chosen._id,
						},
					],
				});
				const rejected = results.find((row) => row.outcome === 'rejected');
				if (rejected?.rejectionCode) onError(t(REJECTION_MESSAGES[rejected.rejectionCode]));
				return;
			}
			const safetyQuantity = Number(safety);
			if (!Number.isInteger(safetyQuantity)) {
				onError(t`安全警戒要是整數。`);
				return;
			}
			const results = await sync({
				spaceId,
				ops: [
					{
						tag: 'receive',
						mode: 'new',
						clientMutationId,
						lineClientMutationId,
						occurredAt,
						category,
						unit,
						safetyQuantity,
						expiresOn: expiresOn === '' ? null : expiresOn,
						shelf,
					},
				],
			});
			const rejected = results.find((row) => row.outcome === 'rejected');
			if (rejected?.rejectionCode) onError(t(REJECTION_MESSAGES[rejected.rejectionCode]));
		} catch (failure) {
			const code = convexErrorCode(failure);
			const descriptor = isAppErrorCode(code) ? STOCK_ERROR_MESSAGES[code] : undefined;
			onError(descriptor ? t(descriptor) : t`操作失敗，請再試一次。`);
		}
	};

	return (
		<details className="mt-2 border-t border-[#f0f0f0] pt-2">
			<summary className="cursor-pointer text-sm">
				<Trans>入庫</Trans>
			</summary>
			<form onSubmit={(event) => void submit(event)} className="mt-3 grid gap-3 md:grid-cols-4">
				<label className="grid gap-2 text-sm">
					<Trans>入到哪裡</Trans>
					<select
						value={mode}
						onChange={(event) => {
							const next = event.target.value;
							if (next === 'existing' || next === 'new') setMode(next);
						}}
						className={fieldClass}
					>
						<option value="existing">{t`已有的貨物`}</option>
						<option value="new">{t`新的一項`}</option>
					</select>
				</label>
				{mode === 'existing' ? (
					<label className="grid gap-2 text-sm md:col-span-2">
						<Trans>貨架上的貨物</Trans>
						<select
							value={itemId}
							onChange={(event) => setItemId(event.target.value)}
							className={fieldClass}
						>
							{items.map((item) => (
								<option key={item._id} value={item._id}>
									{item.name}
								</option>
							))}
						</select>
					</label>
				) : (
					<>
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
					</>
				)}
				<div className="md:self-end">
					<button type="submit" className="h-9 rounded-[6px] bg-[#141414] px-3 text-sm text-white">
						<Trans>入庫</Trans>
					</button>
				</div>
			</form>
		</details>
	);
}
