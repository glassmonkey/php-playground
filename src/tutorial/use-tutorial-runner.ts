import { useEffect, useRef, useState } from 'react';
import PHPWorker from '../workers/php-worker?worker';
import AssessmentWorker from './assessment-worker?worker';
import type {
	AssessmentRequest,
	AssessmentResponse,
} from './assessment-worker';
import type { JSONValue } from './types';
import type { PHPResultMessage, RunPHPMessage } from '../workers/types';
import type { TutorialVersion } from './config';

type ActiveExecution = {
	worker: Worker;
	timer: ReturnType<typeof setTimeout>;
};

export function useTutorialRunner(version: TutorialVersion) {
	const active = useRef<ActiveExecution | undefined>(undefined);
	const [state, setState] = useState<{
		running: boolean;
		output: string;
		error: string;
		code: string | null;
	}>({ running: false, output: '', error: '', code: null });
	function dispose() {
		if (!active.current) return;
		active.current.worker.terminate();
		clearTimeout(active.current.timer);
		active.current = undefined;
	}
	useEffect(() => dispose, []);
	function run(code: string, input?: JSONValue) {
		if (input !== undefined) {
			runWithInput(code, input);
			return;
		}
		dispose();
		setState({ running: true, output: '', error: '', code });
		const worker = new PHPWorker();
		const requestId = crypto.randomUUID();
		const finish = (output: string, error = '') => {
			if (active.current?.worker !== worker) return;
			dispose();
			setState({ running: false, output, error, code });
		};
		const timer = setTimeout(
			() =>
				finish(
					'',
					'Execution timed out. Check your loop conditions and try again.'
				),
			30000
		);
		active.current = { worker, timer };
		worker.onmessage = ({ data }: MessageEvent<PHPResultMessage>) => {
			if (data.requestId === requestId) {
				const error =
					data.error ||
					data.errors?.trim() ||
					(data.exitCode !== undefined && data.exitCode !== 0
						? `PHP stopped (exit ${data.exitCode}).`
						: '');
				finish(data.result, error);
			}
		};
		worker.onerror = (event) => finish('', event.message);
		// The runtime accepts PHP source without the opening tag; preserve mixed HTML.
		const prefix = /^<\?(php)?\s+/;
		const source = prefix.test(code)
			? code.replace(prefix, '')
			: '?>' + code;
		worker.postMessage({
			requestId,
			version,
			code: source,
		} satisfies RunPHPMessage);
	}
	function runWithInput(code: string, input: JSONValue) {
		dispose();
		setState({ running: true, output: '', error: '', code });
		const worker = new AssessmentWorker();
		const requestId = crypto.randomUUID();
		const finish = (output: string, error = '') => {
			if (active.current?.worker !== worker) return;
			dispose();
			setState({ running: false, output, error, code });
		};
		const timer = setTimeout(
			() =>
				finish(
					'',
					'Execution timed out. Check your loop conditions and try again.'
				),
			30000
		);
		active.current = { worker, timer };
		worker.onmessage = ({ data }: MessageEvent<AssessmentResponse>) => {
			if (data.requestId === requestId)
				finish(data.output ?? '', data.error);
		};
		worker.onerror = (event) => finish('', event.message);
		worker.postMessage({
			requestId,
			version,
			code,
			cases: [],
			action: 'run',
			input,
		} satisfies AssessmentRequest);
	}

	function stop() {
		dispose();
		setState((previous) => ({
			...previous,
			running: false,
			error: 'Execution stopped.',
		}));
	}
	function reset() {
		dispose();
		setState({ running: false, output: '', error: '', code: null });
	}
	return { ...state, run, stop, reset };
}
