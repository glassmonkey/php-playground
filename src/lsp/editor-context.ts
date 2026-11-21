import type * as Monaco from 'monaco-editor';
import type { Version } from '../php-wasm/php';

type Span = { start: number; end: number; mask: boolean };
const identifier = /[a-zA-Z0-9_\x80-\uffff]/;
const heredocHeader =
	/<<<[ \t]*(?:(["'])([a-zA-Z_\x80-\uffff][a-zA-Z0-9_\x80-\uffff]*)\1|([a-zA-Z_\x80-\uffff][a-zA-Z0-9_\x80-\uffff]*))[ \t]*\r?\n/y;

function heredocEnd(
	source: string,
	body: number,
	label: string,
	flexible: boolean
): number {
	const closing = flexible
		? new RegExp(`^([ \\t]*)${label}(?![a-zA-Z0-9_\\x80-\\uffff])`)
		: new RegExp(`^()${label};?\\r?$`);
	let lineStart = body;
	const bodyLines: string[] = [];
	while (lineStart < source.length) {
		const newline = source.indexOf('\n', lineStart);
		const lineEnd = newline < 0 ? source.length : newline;
		const line = source.slice(lineStart, lineEnd);
		const close = closing.exec(line);
		if (close) {
			const indent = close[1];
			if (
				(indent.includes(' ') && indent.includes('\t')) ||
				bodyLines.some(
					(text) =>
						!/^[ \t\r]*$/.test(text) && !text.startsWith(indent)
				)
			)
				return source.length;
			return lineStart + indent.length + label.length;
		}
		bodyLines.push(line);
		lineStart = lineEnd + 1;
	}
	return source.length;
}
function readHeredoc(
	source: string,
	start: number,
	flexible: boolean
): number | undefined {
	heredocHeader.lastIndex = start;
	const header = heredocHeader.exec(source);
	return header
		? heredocEnd(
				source,
				start + header[0].length,
				header[2] ?? header[3],
				flexible
			)
		: undefined;
}

// Quote/interpolation balance only locates the end of an opaque string; it never parses expressions.
function quotedEnd(source: string, start: number, flexible: boolean): number {
	const stack: ({ quote: string } | { braces: number })[] = [
		{ quote: source[start] },
	];
	let index = start + 1;
	while (index < source.length) {
		const state = stack.at(-1)!;
		const char = source[index];
		if ('quote' in state) {
			if (char === '\\') {
				index += 2;
				continue;
			}
			if (char === state.quote) {
				stack.pop();
				index++;
				if (stack.length === 0) return index;
				continue;
			}
			if (
				state.quote !== "'" &&
				((char === '{' && source[index + 1] === '$') ||
					(char === '$' && source[index + 1] === '{'))
			) {
				stack.push({ braces: 1 });
				index += 2;
				continue;
			}
		} else {
			if (char === '"' || char === "'" || char === '`') {
				stack.push({ quote: char });
				index++;
				continue;
			}
			if (source.startsWith('/*', index)) {
				const end = source.indexOf('*/', index + 2);
				if (end < 0) return source.length;
				index = end + 2;
				continue;
			}
			if (source.startsWith('//', index) || char === '#') {
				const end = source.indexOf('\n', index);
				if (end < 0) return source.length;
				index = end + 1;
				continue;
			}
			if (source.startsWith('<<<', index)) {
				const end = readHeredoc(source, index, flexible);
				if (end !== undefined) {
					index = end;
					continue;
				}
			}
			if (char === '{') state.braces++;
			if (char === '}' && --state.braces === 0) stack.pop();
		}
		index++;
	}
	return source.length;
}

/** A single code/opaque scan, not an AST, diagnostic, or candidate parser. */
function lexicalSpans(source: string, phpVersion: Version): Span[] {
	const spans: Span[] = [];
	const flexible = !['5.6', '7.0', '7.1', '7.2'].includes(phpVersion);
	const attributes = phpVersion.startsWith('8.');
	// The app's existing convertCodeToPhpPlayground also accepts bare <? followed by whitespace.
	const open = /<\?(?:php(?=\s|$)|=|(?=\s))/gi;
	let index = 0;
	let code = false;
	while (index < source.length) {
		if (!code) {
			open.lastIndex = index;
			const tag = open.exec(source);
			const end = tag?.index ?? source.length;
			spans.push({ start: index, end, mask: true });
			if (!tag) break;
			index = end + tag[0].length;
			spans.push({ start: end, end: index, mask: false });
			code = true;
			continue;
		}
		if (source.startsWith('?>', index)) {
			spans.push({ start: index, end: index + 2, mask: false });
			index += 2;
			code = false;
			continue;
		}
		const start = index,
			char = source[index];
		if (char === '"' || char === "'" || char === '`') {
			index = quotedEnd(source, index, flexible);
		} else if (source.startsWith('/*', index)) {
			const end = source.indexOf('*/', index + 2);
			index = end < 0 ? source.length : end + 2;
		} else if (attributes && source.startsWith('#[', index)) {
			// Only remove the marker that the CDN misreads as a line comment. Brackets remain PHP code.
			spans.push({ start: index, end: index + 1, mask: true });
			index++;
			continue;
		} else if (char === '#' || source.startsWith('//', index)) {
			// A PHP closing tag also terminates a line comment; it is not opaque like a block comment.
			const newline = source.indexOf('\n', index),
				close = source.indexOf('?>', index);
			index = Math.min(
				newline < 0 ? source.length : newline,
				close < 0 ? source.length : close
			);
		} else if (source.startsWith('<<<', index)) {
			const end = readHeredoc(source, index, flexible);
			if (end === undefined) {
				index++;
				continue;
			}
			index = end;
		} else {
			index++;
			continue;
		}
		spans.push({ start, end: index, mask: true });
	}
	return spans;
}

/** Eligibility copy preserves original UTF16 positions; the model and global grammar are untouched. */
export function isPhpIdentifierContext(
	source: string,
	line: number,
	column: number,
	phpVersion: Version,
	tokenize: typeof Monaco.editor.tokenize
): boolean {
	const lines = source.split('\n');
	const target =
		lines
			.slice(0, line)
			.reduce((length, text) => length + text.length + 1, 0) + column;
	const spans = lexicalSpans(source, phpVersion);
	if (
		!identifier.test(source[target] ?? '') ||
		spans.some((span) => target >= span.start && target < span.end)
	)
		return false;
	const copy = source.split('');
	for (const span of spans)
		if (span.mask)
			for (let index = span.start; index < span.end; index++) {
				if (copy[index] !== '\r' && copy[index] !== '\n')
					copy[index] = ' ';
			}
	const tokens = tokenize(copy.join(''), 'php');
	const token = tokens[line]
		?.filter((token) => token.offset <= column)
		.at(-1);
	return (
		token?.language === 'php' &&
		['identifier.php', 'variable.php'].includes(token.type)
	);
}
