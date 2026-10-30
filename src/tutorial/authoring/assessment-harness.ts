import AssessmentWorker from '../assessment-worker?worker';
import type {
	AssessmentRequest,
	AssessmentResponse,
} from '../assessment-worker';
import type { TutorialVersion } from '../config';
import type { ExerciseCase, JSONValue } from '../types';

type RunState =
	| { status: 'running' }
	| { status: 'complete'; response: AssessmentResponse }
	| { status: 'error'; message: string }
	| { status: 'stopped' }
	| { status: 'timeout' };

declare global {
	interface Window {
		tutorialWasmHarness: {
			start(input: {
				requestId?: string;
				version: TutorialVersion;
				code: string;
				cases?: ExerciseCase[];
				runInput?: JSONValue;
				timeoutMs?: number;
			}): string;
			read(id: string): RunState | undefined;
			stop(id: string): void;
		};
	}
}

const workers = new Map<string, Worker>();
const states = new Map<string, RunState>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function clear(id: string) {
	workers.get(id)?.terminate();
	workers.delete(id);
	const timer = timers.get(id);
	if (timer) clearTimeout(timer);
	timers.delete(id);
}

const harness: Window['tutorialWasmHarness'] = {
	start({
		version,
		code,
		cases,
		runInput,
		timeoutMs = 30_000,
		requestId = crypto.randomUUID(),
	}) {
		const id = crypto.randomUUID();
		const worker = new AssessmentWorker();
		workers.set(id, worker);
		states.set(id, { status: 'running' });
		timers.set(
			id,
			setTimeout(() => {
				clear(id);
				states.set(id, { status: 'timeout' });
			}, timeoutMs)
		);
		worker.onmessage = ({ data }: MessageEvent<AssessmentResponse>) => {
			if (data.requestId !== requestId) return;
			clear(id);
			states.set(id, { status: 'complete', response: data });
		};
		worker.onerror = (event) => {
			clear(id);
			states.set(id, { status: 'error', message: event.message });
		};
		const request: AssessmentRequest =
			runInput === undefined
				? { requestId, version, code, cases: cases ?? [] }
				: {
						requestId,
						version,
						code,
						cases: [],
						action: 'run',
						input: runInput,
					};
		worker.postMessage(request);
		return id;
	},
	read(id) {
		return states.get(id);
	},
	stop(id) {
		if (!workers.has(id)) return;
		clear(id);
		states.set(id, { status: 'stopped' });
	},
};

window.tutorialWasmHarness = harness;
