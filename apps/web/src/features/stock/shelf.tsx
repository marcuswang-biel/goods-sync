import type { Id } from '@goods/backend/convex/_generated/dataModel';

import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { api } from '@goods/backend/convex/_generated/api';
import { isExpiring, isShort } from '@goods/domain/stock';
import { convexErrorCode } from '@goods/shared/convex-error';
import { isAppErrorCode } from '@goods/shared/error-codes';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
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
		<div className="mx-auto flex w-full max-w-[1128px] flex-col gap-3 px-4 py-6 lg:px-0">
			<div className="flex items-baseline justify-between gap-3">
				<h1 className="text-2xl leading-none font-medium">
					<Trans>貨架</Trans>
				</h1>
				<p className="text-muted-foreground text-sm tabular-nums">
					<Trans>{items.length} 樣</Trans>
				</p>
			</div>
			<AddItem spaceId={spaceId} onError={setError} />
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			<form onSubmit={(event) => event.preventDefault()}>
				<Field className="max-w-sm">
					<FieldLabel htmlFor="shelf-search">
						<Trans>搜尋物資</Trans>
					</FieldLabel>
					<Input
						id="shelf-search"
						type="search"
						value={query}
						onChange={(event) => {
							onSearch(event.target.value);
						}}
					/>
				</Field>
			</form>
			{board.isPending ? (
				<div aria-busy="true" className="flex flex-col gap-2">
					<Skeleton className="h-4 w-48" />
					<span className="sr-only">{t`正在讀貨架。`}</span>
				</div>
			) : items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyDescription>{t`沒有符合的物資。`}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<>
					<Table className="hidden md:table">
						<TableHeader>
							<TableRow>
								<TableHead>
									<Trans>物資</Trans>
								</TableHead>
								<TableHead>
									<Trans>貨架位置</Trans>
								</TableHead>
								<TableHead>
									<Trans>在架上</Trans>
								</TableHead>
								<TableHead className="text-right">
									<Trans>安全</Trans>
								</TableHead>
								<TableHead className="text-right">
									<Trans>到期</Trans>
								</TableHead>
								<TableHead>
									<span className="sr-only">
										<Trans>領用或刪除</Trans>
									</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((item) => (
								<TableRow key={item._id}>
									<TableCell>
										<span className="inline-flex items-center gap-2">
											{item.name}
											{isExpiring(item.freshness) && (
												<Badge variant="outline">
													<Trans>即將過期</Trans>
												</Badge>
											)}
											{!isExpiring(item.freshness) && isShort(item.supply) && (
												<Badge variant="outline">
													<Trans>不夠了</Trans>
												</Badge>
											)}
										</span>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{t(SHELF_LABELS[item.shelf])}
									</TableCell>
									<TableCell>
										<span className="flex w-full items-center justify-start gap-3">
											<LevelBar quantity={item.quantity} safetyQuantity={item.safetyQuantity} />
											<StockAmount
												quantity={item.quantity}
												unit={t(UNIT_LABELS[item.unit])}
												safetyQuantity={item.safetyQuantity}
											/>
										</span>
									</TableCell>
									<TableCell className="text-muted-foreground text-right tabular-nums">
										{item.safetyQuantity}
									</TableCell>
									<TableCell className="text-muted-foreground text-right tabular-nums">
										{item.expiresOn ?? '—'}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex items-center justify-end gap-1">
											{item.quantity > 0 && (
												<Button
													variant="ghost"
													size="sm"
													disabled={removingBusy}
													onClick={() => void take(item._id, item.version)}
												>
													<Trans>領用</Trans>
												</Button>
											)}
											<Button
												variant="destructive"
												size="sm"
												disabled={removingBusy}
												aria-label={t`刪除 ${item.name}`}
												onClick={() => setRemoving({ id: item._id, name: item.name })}
											>
												<Trans>刪除</Trans>
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
					<ul className="bg-card ring-foreground/10 flex flex-col rounded-xl ring-1 md:hidden">
						{items.map((item) => (
							<li
								key={item._id}
								className="flex min-h-11 items-center gap-3 border-b px-4 py-2 last:border-b-0"
							>
								<div className="min-w-0">
									<p className="truncate text-sm">{item.name}</p>
									<p className="text-muted-foreground text-xs">
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
										<Button
											variant="ghost"
											size="sm"
											disabled={removingBusy}
											onClick={() => void take(item._id, item.version)}
										>
											<Trans>領用</Trans>
										</Button>
									)}
									<Button
										variant="destructive"
										size="sm"
										disabled={removingBusy}
										aria-label={t`刪除 ${item.name}`}
										onClick={() => setRemoving({ id: item._id, name: item.name })}
									>
										<Trans>刪除</Trans>
									</Button>
								</div>
							</li>
						))}
					</ul>
				</>
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
		<Card>
			<CardHeader>
				<CardTitle>
					<h2>
						<Trans>增加新物資</Trans>
					</h2>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<form onSubmit={(event) => void submit(event)}>
					<FieldGroup>
						<div className="grid gap-5 md:grid-cols-4">
							<Field className="md:col-span-2">
								<FieldLabel htmlFor="item-name">
									<Trans>名稱</Trans>
								</FieldLabel>
								<Input
									id="item-name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									required
								/>
							</Field>
							<CodeSelect
								id="item-category"
								label={<Trans>種類</Trans>}
								value={category}
								codes={categoryCodes}
								labelOf={(code) => t(CATEGORY_LABELS[code])}
								onValueChange={setCategory}
							/>
							<CodeSelect
								id="item-unit"
								label={<Trans>規格</Trans>}
								value={unit}
								codes={unitCodes}
								labelOf={(code) => t(UNIT_LABELS[code])}
								onValueChange={setUnit}
							/>
							<Field>
								<FieldLabel htmlFor="item-quantity">
									<Trans>數量</Trans>
								</FieldLabel>
								<Input
									id="item-quantity"
									value={quantity}
									onChange={(event) => setQuantity(event.target.value)}
									inputMode="numeric"
									className="tabular-nums"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="item-safety">
									<Trans>安全警戒</Trans>
								</FieldLabel>
								<Input
									id="item-safety"
									value={safety}
									onChange={(event) => setSafety(event.target.value)}
									inputMode="numeric"
									className="tabular-nums"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="item-expires">
									<Trans>到期</Trans>
								</FieldLabel>
								<Input
									id="item-expires"
									type="date"
									value={expiresOn}
									onChange={(event) => setExpiresOn(event.target.value)}
								/>
							</Field>
							<CodeSelect
								id="item-shelf"
								label={<Trans>貨架位置</Trans>}
								value={shelf}
								codes={shelfCodes}
								labelOf={(code) => t(SHELF_LABELS[code])}
								onValueChange={setShelf}
							/>
							<div className="md:self-end">
								<Button type="submit">
									<Trans>放上貨架</Trans>
								</Button>
							</div>
						</div>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}

/** A labeled select whose value is one of a fixed English code list. */
function CodeSelect<Code extends string>({
	id,
	label,
	value,
	codes,
	labelOf,
	onValueChange,
}: {
	id: string;
	label: ReactNode;
	value: Code;
	codes: readonly Code[];
	labelOf: (code: Code) => string;
	onValueChange: (code: Code) => void;
}) {
	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Select
				value={value}
				onValueChange={(next) => {
					if (next !== null && codes.some((code) => code === next)) onValueChange(next);
				}}
			>
				<SelectTrigger id={id} className="w-full">
					<SelectValue>
						{(selected) => {
							const match = codes.find((code) => code === selected);
							return match === undefined ? null : labelOf(match);
						}}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{codes.map((code) => (
							<SelectItem key={code} value={code}>
								{labelOf(code)}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</Field>
	);
}
