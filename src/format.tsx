import { Checkbox } from '@chakra-ui/react';

export type Format = 'html' | 'console';

export function SelectFormat({
	format,
	updateFormat,
}: {
	format: Format;
	updateFormat: (f: Format) => void;
}) {
	return (
		<Checkbox
			data-testid="checkbox-format"
			isChecked={format === 'html'}
			onChange={(e) => {
				updateFormat(e.target.checked ? 'html' : 'console');
			}}
		>
			HTML Preview
		</Checkbox>
	);
}
