import { Trans } from '@lingui/react/macro';
import { useState } from 'react';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';

/** Confirm before a good, and its take history, leave the shelf. */
export function ConfirmRemove({
	name: itemName,
	busy,
	onClose,
	onConfirm,
}: {
	name: string | null;
	busy: boolean;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const [name, setName] = useState(itemName ?? '');
	if (itemName !== null && itemName !== name) setName(itemName);

	return (
		<AlertDialog
			open={itemName !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>拿掉 {name}</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>貨架數量和領用記錄會一起刪掉。採購記錄仍保留名稱。</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={busy}>
						<Trans>取消</Trans>
					</AlertDialogCancel>
					<AlertDialogAction variant="destructive" disabled={busy} onClick={onConfirm}>
						{busy && <Spinner data-icon="inline-start" />}
						<Trans>刪除</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
