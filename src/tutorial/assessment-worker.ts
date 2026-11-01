/// <reference lib="webworker" />
import { initPHP } from '../workers/php-worker';
import type { PHP } from '../php-wasm/php';
import type { TutorialVersion } from './config';
import type { AssessmentResult, ExerciseCase, JSONValue } from './types';

export interface AssessmentRequest {
	requestId: string;
	version: TutorialVersion;
	code: string;
	cases: ExerciseCase[];
	action?: 'run';
	input?: JSONValue;
}
export interface AssessmentResponse {
	requestId: string;
	results: AssessmentResult[];
	output?: string;
	error?: string;
}

function assessCase(
	php: PHP,
	code: string,
	test: ExerciseCase
): AssessmentResult {
	const directory = `/tmp/tutorial-${crypto.randomUUID()}`;
	const result: AssessmentResult = {
		id: test.id,
		label: test.label,
		status: 'error',
		message: '',
	};
	const files = ['learner.php', 'input.json', 'checker.php', 'result.json'];
	php.mkdirTree(directory);
	try {
		php.writeFile(`${directory}/learner.php`, code);
		php.writeFile(`${directory}/input.json`, JSON.stringify(test.input));
		php.writeFile(`${directory}/checker.php`, test.checkPhp);
		// Keep protocol data out of stdout. Learner source is a file, never PHP string interpolation.
		const response = php.run({
			code: `
$__tutorial_assess = static function () {
 try {
  $__tutorial_input = json_decode(file_get_contents('${directory}/input.json'), true);
  if (json_last_error() !== JSON_ERROR_NONE) { throw new RuntimeException('Invalid exercise input JSON.'); }
  $__tutorial_buffer_level = ob_get_level();
  ob_start();
  try {
   $__tutorial_run = static function ($input) { return include '${directory}/learner.php'; };
   $__tutorial_return = $__tutorial_run($__tutorial_input);
   if (ob_get_level() !== $__tutorial_buffer_level + 1) { throw new RuntimeException('The exercise changed output buffering. Restore the output buffer before returning.'); }
   $__tutorial_output = ob_get_contents();
  } finally {
   while (ob_get_level() > $__tutorial_buffer_level) { ob_end_clean(); }
  }
  $__tutorial_checker = include '${directory}/checker.php';
  $__tutorial_check = $__tutorial_checker($__tutorial_input, $__tutorial_output, $__tutorial_return);
  if (!is_array($__tutorial_check) || !isset($__tutorial_check['passed']) || !is_bool($__tutorial_check['passed']) || !isset($__tutorial_check['message']) || !is_string($__tutorial_check['message'])) {
   throw new RuntimeException('The exercise checker returned an invalid result.');
  }
  return ['status' => $__tutorial_check['passed'] ? 'passed' : 'failed', 'message' => $__tutorial_check['message']];
 } catch (Exception $__tutorial_error) {
  return ['status' => 'error', 'message' => get_class($__tutorial_error) . ': ' . $__tutorial_error->getMessage()];
 } catch (Throwable $__tutorial_error) {
  return ['status' => 'error', 'message' => get_class($__tutorial_error) . ': ' . $__tutorial_error->getMessage()];
 }
};
$__tutorial_result = $__tutorial_assess();
file_put_contents('${directory}/result.json', json_encode($__tutorial_result));
`,
		});
		if (response.exitCode !== 0 || response.errors.trim()) {
			result.message =
				response.errors.trim() ||
				`PHP stopped before checking completed (exit ${response.exitCode}).`;
			return result;
		}
		let decoded: unknown;
		try {
			decoded = JSON.parse(
				php.readFileAsText(`${directory}/result.json`)
			);
		} catch {
			result.message =
				'The program ended before the checker returned a result.';
			return result;
		}
		if (
			!decoded ||
			typeof decoded !== 'object' ||
			!('status' in decoded) ||
			!['passed', 'failed', 'error'].includes(String(decoded.status)) ||
			!('message' in decoded) ||
			typeof decoded.message !== 'string'
		) {
			result.message = 'The exercise checker returned an invalid result.';
			return result;
		}
		return {
			...result,
			status: decoded.status as AssessmentResult['status'],
			message: decoded.message,
		};
	} catch (error) {
		return {
			...result,
			message: error instanceof Error ? error.message : String(error),
		};
	} finally {
		for (const file of files) {
			try {
				php.unlink(`${directory}/${file}`);
			} catch {
				/* Not every execution produces a result file. */
			}
		}
	}
}

self.onmessage = async ({ data }: MessageEvent<AssessmentRequest>) => {
	try {
		const php = await initPHP(data.version);
		if (data.action === 'run') {
			const directory = `/tmp/tutorial-run-${crypto.randomUUID()}`;
			php.mkdirTree(directory);
			php.writeFile(`${directory}/learner.php`, data.code);
			php.writeFile(
				`${directory}/input.json`,
				JSON.stringify(data.input ?? null)
			);
			const response = php.run({
				code: `$__tutorial_input = json_decode(file_get_contents('${directory}/input.json'), true);
if (json_last_error() !== JSON_ERROR_NONE) { throw new RuntimeException('Invalid program input JSON.'); }
$__tutorial_run = static function ($input) { include '${directory}/learner.php'; };
$__tutorial_run($__tutorial_input);`,
			});
			self.postMessage({
				requestId: data.requestId,
				results: [],
				output: new TextDecoder().decode(response.body),
				error:
					response.errors ||
					(response.exitCode !== 0
						? `PHP stopped (exit ${response.exitCode}).`
						: undefined),
			} satisfies AssessmentResponse);
			return;
		}
		const results = data.cases.map((test) =>
			assessCase(php, data.code, test)
		);
		self.postMessage({
			requestId: data.requestId,
			results,
		} satisfies AssessmentResponse);
	} catch (error) {
		self.postMessage({
			requestId: data.requestId,
			results: [],
			error: error instanceof Error ? error.message : String(error),
		} satisfies AssessmentResponse);
	}
};
