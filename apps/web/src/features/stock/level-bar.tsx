import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

/** Share of the safety line still on the shelf. Above the line this passes 100. */
export function remainingPercent(quantity: number, safetyQuantity: number): number {
	if (safetyQuantity <= 0) return quantity > 0 ? 100 : 0;
	return Math.round((quantity / safetyQuantity) * 100);
}

/**
 * Gray is the safety line, always the full length. Black covers it up to that
 * line and stops at 100, even when more than the line is on the shelf.
 */
export function LevelBar({
	quantity,
	safetyQuantity,
	className = 'w-40 shrink-0',
}: {
	quantity: number;
	safetyQuantity: number;
	className?: string;
}) {
	const ratio = safetyQuantity > 0 ? quantity / safetyQuantity : quantity > 0 ? 1 : 0;
	const covered = Math.min(ratio, 1) * 100;

	return (
		<div className={cn('relative h-2', className)} aria-hidden="true">
			<div className="bg-input absolute inset-0" />
			<div className="bg-foreground absolute inset-y-0 left-0" style={{ width: `${covered}%` }} />
		</div>
	);
}

/** Quantity, a rule, then the percent of the safety line. The slots stay left-aligned across rows. */
export function StockAmount({
	quantity,
	unit,
	safetyQuantity,
	className = '',
}: {
	quantity: number;
	unit: string;
	safetyQuantity: number;
	className?: string;
}) {
	return (
		<span className={cn('inline-flex shrink-0 items-center gap-2 text-sm tabular-nums', className)}>
			<span className="w-16 text-left">
				{quantity}
				<span className="text-muted-foreground ml-1 text-xs">{unit}</span>
			</span>
			<Separator orientation="vertical" className="h-4" />
			<span className="text-left">{remainingPercent(quantity, safetyQuantity)}%</span>
		</span>
	);
}
