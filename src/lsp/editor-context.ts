import type * as Monaco from 'monaco-editor';
import type { Version } from '../php-wasm/php';

type TokenLines = ReturnType<typeof Monaco.editor.tokenize>;
function tokenAt(tokens: TokenLines, line: number, column: number) {
	return tokens[line]?.filter((token) => token.offset <= column).at(-1);
}

/** Eligibility only: supplement Monaco's missing heredoc state without changing the document/tokenizer. */
export function isPhpIdentifierContext(
	source: string,
	line: number,
	column: number,
	phpVersion: Version,
	tokenize: typeof Monaco.editor.tokenize
): boolean {
	const lines = source.split('\n');
	const offsets = [0];
	for (let index = 0; index < lines.length - 1; index++)
		offsets.push(offsets[index] + lines[index].length + 1);
	const target = offsets[line] + column;
	const flexible = !['5.6', '7.0', '7.1', '7.2'].includes(phpVersion);
	let masked = source;
	let tokens = tokenize(masked, 'php');
	// PHP requires a newline after the label. Only a PHP operator token can open an opaque interval.
	const opener =
		/<<<[ \t]*(?:(["'])([a-zA-Z_\x80-\uffff][a-zA-Z0-9_\x80-\uffff]*)\1|([a-zA-Z_\x80-\uffff][a-zA-Z0-9_\x80-\uffff]*))[ \t]*\r?\n/g;
	let match: RegExpExecArray | null;
	while ((match = opener.exec(source))) {
		if (match.index > target) break;
		const openLine = source.slice(0, match.index).split('\n').length - 1;
		const token = tokenAt(
			tokens,
			openLine,
			match.index - offsets[openLine]
		);
		if (token?.language !== 'php' || token.type !== 'delimiter.php')
			continue;
		const label = match[2] ?? match[3];
		const closing = flexible
			? new RegExp(`^([ \\t]*)${label}(?![a-zA-Z0-9_\\x80-\\uffff])`)
			: new RegExp(`^()${label};?\\r?$`);
		let end = source.length;
		for (let index = openLine + 1; index < lines.length; index++) {
			const close = closing.exec(lines[index]);
			if (!close) continue;
			const indent = close[1];
			// An invalid/mixed indentation is ambiguous PHP, so do not expose the remaining body as code.
			if (
				(indent.includes(' ') && indent.includes('\t')) ||
				lines
					.slice(openLine + 1, index)
					.some(
						(body) => body.trim() !== '' && !body.startsWith(indent)
					)
			)
				break;
			end = offsets[index] + indent.length + label.length;
			break;
		}
		if (target >= match.index && target < end) return false;
		// Replace each UTF-16 code unit, retaining offsets/newlines and restoring state after the closing label.
		masked =
			masked.slice(0, match.index) +
			source.slice(match.index, end).replace(/[^\r\n]/g, ' ') +
			masked.slice(end);
		tokens = tokenize(masked, 'php');
		opener.lastIndex = end;
	}
	const token = tokenAt(tokens, line, column);
	return (
		token?.language === 'php' &&
		['identifier.php', 'variable.php'].includes(token.type)
	);
}
