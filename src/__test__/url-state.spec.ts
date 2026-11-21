import { describe, expect, it } from 'vitest';
import { isAutoCompleteEnabled, withAutoComplete, withSearchParam } from '../url-state';

describe('isAutoCompleteEnabled', () => {
	it.each([
		{ value: null, want: true },
		{ value: '1', want: true },
		{ value: '0', want: false },
		{ value: 'true', want: true },
		{ value: '', want: true },
	])('reads ac=$value as $want', ({ value, want }) => {
		// Arrange
		const searchParams = new URLSearchParams();
		if (value !== null) searchParams.set('ac', value);

		// Act
		const got = isAutoCompleteEnabled(searchParams);

		// Assert
		expect(got).toBe(want);
	});
});

describe('withAutoComplete', () => {
	it.each([
		{ enabled: true, want: 'v=8.5&c=sample&f=html&extra=keep&ac=1' },
		{ enabled: false, want: 'v=8.5&c=sample&f=html&extra=keep&ac=0' },
	])('updates only ac when enabled=$enabled', ({ enabled, want }) => {
		// Arrange
		const searchParams = new URLSearchParams(
			'v=8.5&c=sample&f=html&extra=keep&ac=invalid'
		);

		// Act
		const got = withAutoComplete(searchParams, enabled).toString();

		// Assert
		expect(got).toBe(want);
	});
});

describe('withSearchParam', () => {
	it('preserves unrelated query parameters when updating a playground value', () => {
		// Arrange
		const searchParams = new URLSearchParams('v=8.5&c=old&f=html&ac=0&share=yes');

		// Act
		const got = withSearchParam(searchParams, 'c', 'new').toString();

		// Assert
		expect(got).toBe('v=8.5&c=new&f=html&ac=0&share=yes');
	});
});
