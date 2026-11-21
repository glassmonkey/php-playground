import type * as Monaco from 'monaco-editor';
import type { Version } from '../php-wasm/php';
import { isPhpIdentifierContext } from './editor-context';

// Pinned CDN0.55.1 DOM compatibility, not a typed Monaco widget-state API.
function hasVisibleSuggestions(
	editor: Monaco.editor.IStandaloneCodeEditor
): boolean {
	const widget = editor.getDomNode()?.querySelector('.suggest-widget');
	const view = widget?.ownerDocument.defaultView;
	if (!widget || !view) return false;
	const style = view.getComputedStyle(widget),
		box = widget.getBoundingClientRect();
	return (
		style.display !== 'none' &&
		style.visibility === 'visible' &&
		box.width > 0 &&
		box.height > 0
	);
}

/** Add only the word-middle interaction that Monaco's automatic trigger excludes. */
export function bindNaturalMiddleCompletion({
	editor,
	model,
	monaco,
	signal,
	phpVersion,
}: {
	editor: Monaco.editor.IStandaloneCodeEditor;
	model: Monaco.editor.ITextModel;
	monaco: typeof Monaco;
	signal: AbortSignal;
	phpVersion: Version;
}): Monaco.IDisposable {
	let disposed = false;
	let composing = false;
	let pending:
		| { key: string; version: number; line: number; column: number }
		| undefined;
	const subscriptions: Monaco.IDisposable[] = [];
	const current = () =>
		!disposed &&
		!signal.aborted &&
		!model.isDisposed() &&
		editor.getModel() === model &&
		model.getLanguageId() === 'php';
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		pending = undefined;
		signal.removeEventListener('abort', dispose);
		for (const subscription of subscriptions) subscription.dispose();
	};
	if (signal.aborted) return { dispose };
	signal.addEventListener('abort', dispose, { once: true });
	subscriptions.push(
		editor.onKeyDown((event) => {
			pending = undefined;
			const key = event.browserEvent.key;
			if (
				!current() ||
				!editor.hasTextFocus() ||
				composing ||
				event.browserEvent.isComposing ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey ||
				!/^[a-zA-Z0-9_\u0080-\u{10ffff}]$/u.test(key)
			)
				return;
			const selections = editor.getSelections();
			const position = editor.getPosition();
			if (
				!position ||
				selections?.length !== 1 ||
				!selections[0].isEmpty()
			)
				return;
			const word = model.getWordAtPosition(position);
			if (
				!word ||
				position.column <= word.startColumn ||
				position.column >= word.endColumn ||
				hasVisibleSuggestions(editor)
			)
				return;
			pending = {
				key,
				version: model.getVersionId(),
				line: position.lineNumber,
				column: position.column,
			};
		})
	);
	subscriptions.push(
		editor.onKeyUp(() => {
			pending = undefined;
		})
	);
	subscriptions.push(
		editor.onDidCompositionStart(() => {
			composing = true;
			pending = undefined;
		})
	);
	subscriptions.push(
		editor.onDidCompositionEnd(() => {
			composing = false;
			pending = undefined;
		})
	);
	subscriptions.push(
		editor.onDidBlurEditorText(() => {
			pending = undefined;
		})
	);
	subscriptions.push(editor.onDidChangeModel(dispose));
	subscriptions.push(editor.onDidDispose(dispose));
	subscriptions.push(
		editor.onDidChangeModelContent((event) => {
			const input = pending;
			pending = undefined;
			if (
				!input ||
				!current() ||
				event.isFlush ||
				event.isUndoing ||
				event.isRedoing ||
				event.changes.length !== 1
			)
				return;
			const change = event.changes[0];
			if (
				change.text !== input.key ||
				change.rangeLength !== 0 ||
				change.range.startLineNumber !== input.line ||
				change.range.endLineNumber !== input.line ||
				change.range.startColumn !== input.column ||
				change.range.endColumn !== input.column ||
				event.versionId !== input.version + 1
			)
				return;
			// The model event precedes the editor's cursor update. Recheck every binding after that turn.
			queueMicrotask(() => {
				const position = editor.getPosition();
				const selections = editor.getSelections();
				if (
					selections?.length !== 1 ||
					!selections[0].isEmpty() ||
					!current() ||
					composing ||
					!editor.hasTextFocus() ||
					model.getVersionId() !== event.versionId ||
					position?.lineNumber !== input.line ||
					position.column !== input.column + input.key.length
				)
					return;
				// Preserve an already-open completion interaction instead of restarting its selection/resolve.
				if (hasVisibleSuggestions(editor)) return;
				const source = model.getValue();
				let eligible = false;
				try {
					eligible = isPhpIdentifierContext(
						source,
						input.line - 1,
						input.column - 2,
						phpVersion,
						monaco.editor.tokenize
					);
				} catch {
					return;
				} // Missing/failed tokenization must not expose opaque text as code.
				if (!eligible) return;
				if (!current() || model.getVersionId() !== event.versionId)
					return;
				editor.trigger(
					'natural-middle-completion',
					'editor.action.triggerSuggest',
					{}
				);
			});
		})
	);
	return { dispose };
}
