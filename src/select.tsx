import React from 'react';
import Select from 'react-select';
import { Version, versions } from './php-wasm/php';

const phpOptions = versions.map((v) => ({
	value: v,
	label: v,
}));

export default function SelectPHP({
	version,
	onChange,
}: {
	version: Version;
	onChange: (version: Version) => void;
}) {
	const versionIndex = versions.findIndex((v) => v == version);
	const currentPhpOption = phpOptions[versionIndex];

	return (
		<Select
			styles={{
				option: (baseStyles, state) => ({
					...baseStyles,
					color: 'black',
					fontSize: '14px',
				}),
				control: (baseStyles, state) => ({
					...baseStyles,
					color: 'black',
					fontSize: '14px',
				}),
			}}
			options={phpOptions}
			defaultValue={currentPhpOption}
			onChange={(option) => {
				if (option !== currentPhpOption) {
					onChange(option?.value ?? currentPhpOption.value);
				}
			}}
		/>
	);
}
