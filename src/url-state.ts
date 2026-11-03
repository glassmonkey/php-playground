export function isAutoCompleteEnabled(searchParams: URLSearchParams): boolean {
	return searchParams.get('ac') !== '0';
}

export function withAutoComplete(
	searchParams: URLSearchParams,
	enabled: boolean
): URLSearchParams {
	const next = new URLSearchParams(searchParams);
	next.set('ac', enabled ? '1' : '0');
	return next;
}

export function withSearchParam(
	searchParams: URLSearchParams,
	key: string,
	value: string
): URLSearchParams {
	const next = new URLSearchParams(searchParams);
	next.set(key, value);
	return next;
}
