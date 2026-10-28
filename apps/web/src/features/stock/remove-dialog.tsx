import { Trans } from '@lingui/react/macro';
import { useEffect, useRef } from 'react';

/** Native dialog so Escape and focus stay with the platform. */
export function ConfirmRemove({
	name,
	busy,
	onClose,
	onConfirm,
}: {
	name: string | null;
	busy: boolean;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const ref = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = ref.current;
		if (!dialog) return;
		if (name && !dialog.open) dialog.showModal();
		if (!name && dialog.open) dialog.close();
	}, [name]);

	return (
		<dialog
			ref={ref}
			className="w-[min(24rem,calc(100%-2rem))] rounded-[8px] border border-[#e6e6e6] bg-white p-4 text-[#0a0a0a] backdrop:bg-[#0a0a0a]/20"
			onClose={onClose}
		>
			{name && (
				<>
					<h2 className="text-base font-medium">
						<Trans>拿掉 {name}</Trans>
					</h2>
					<p className="mt-2 text-sm">
						<Trans>貨架數量和領用記錄會一起刪掉。採購記錄仍保留名稱。</Trans>
					</p>
					<div className="mt-4 flex justify-end gap-3">
						<button type="button" className="h-9 px-3 text-sm" disabled={busy} onClick={onClose}>
							<Trans>取消</Trans>
						</button>
						<button
							type="button"
							className="h-9 rounded-[6px] bg-[#141414] px-3 text-sm text-white disabled:opacity-50"
							disabled={busy}
							onClick={onConfirm}
						>
							<Trans>刪除</Trans>
						</button>
					</div>
				</>
			)}
		</dialog>
	);
}
