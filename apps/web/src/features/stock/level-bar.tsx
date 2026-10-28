/** Remaining quantity against the safety line. The track ends at whichever is larger. */
export function LevelBar({
	quantity,
	safetyQuantity,
}: {
	quantity: number;
	safetyQuantity: number;
}) {
	const scale = Math.max(quantity, safetyQuantity, 1);
	const fill = (quantity / scale) * 100;
	const short = quantity <= safetyQuantity;
	const mark =
		quantity > safetyQuantity && safetyQuantity > 0 ? (safetyQuantity / scale) * 100 : null;

	return (
		<span className="relative inline-block h-2 w-24 shrink-0 bg-[#e6e6e6]" aria-hidden="true">
			<span
				className="absolute inset-y-0 left-0"
				style={{
					width: `${fill}%`,
					background: quantity === 0 ? 'transparent' : short ? '#1d5fbf' : '#0a0a0a',
				}}
			/>
			{mark !== null && (
				<span className="absolute inset-y-0 w-0.5 bg-[#f2f4f7]" style={{ left: `${mark}%` }} />
			)}
		</span>
	);
}
