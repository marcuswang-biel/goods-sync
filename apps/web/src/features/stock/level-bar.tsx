import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

/** Share of the safety line still on the shelf. Above the line this passes 100. */
export function remainingPercent(quantity: number, safetyQuantity: number): number {
	if (safetyQuantity <= 0) return quantity > 0 ? 100 : 0;
	return Math.round((quantity / safetyQuantity) * 100);
}

/** Full track is the safety line. The fill stops at 100 even when the shelf holds more. */
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

	return <Progress value={covered} aria-hidden="true" className={className} />;
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
