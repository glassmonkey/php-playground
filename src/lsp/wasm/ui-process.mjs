import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { Buffer } from 'node:buffer';
import { writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

export function fetchWithin(url, timeoutMs, signal) {
	return fetch(url, {
		signal: AbortSignal.any([
			AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs))),
			...(signal ? [signal] : []),
		]),
	});
}
export function runBounded(command, { cwd, env, timeoutMs, signal } = {}) {
	return new Promise((resolve) => {
		const stdout = [],
			stderr = [];
		let timedOut = false,
			spawnError,
			killTimer;
		const child = spawn(command[0], command.slice(1), {
			cwd,
			env,
			detached: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		const kill = (kind) => {
			if (child.pid)
				try {
					process.kill(-child.pid, kind);
				} catch (error) {
					if (error.code !== 'ESRCH') throw error;
				}
		};
		const stop = () => {
			timedOut = true;
			kill('SIGTERM');
			killTimer ??= setTimeout(() => kill('SIGKILL'), 5_000);
		};
		const timer = setTimeout(stop, timeoutMs);
		signal?.addEventListener('abort', stop, { once: true });
		if (signal?.aborted) stop();
		child.stdout.on('data', (data) => stdout.push(data));
		child.stderr.on('data', (data) => stderr.push(data));
		child.once('error', (error) => {
			spawnError = String(error);
		});
		// close follows exit and the draining of stdout/stderr. Never resolve at exit.
		child.once('close', (code, terminationSignal) => {
			clearTimeout(timer);
			clearTimeout(killTimer);
			signal?.removeEventListener('abort', stop);
			resolve({
				exitCode: timedOut
					? 124
					: spawnError
						? 127
						: typeof code === 'number'
							? code
							: 128 + (constants.signals[terminationSignal] ?? 0),
				rawExitCode: code,
				signal: terminationSignal,
				deadlineReached: timedOut,
				spawnError: spawnError ?? null,
				closeObserved: true,
				stdout: Buffer.concat(stdout),
				stderr: Buffer.concat(stderr),
			});
		});
	});
}
export async function journalProcess(directory, name, command, options) {
	const save = async (suffix, data) => {
		const path = join(directory, name + suffix);
		await writeFile(path, JSON.stringify(data, null, 2) + '\n', {
			flag: 'wx',
		});
		await chmod(path, 0o444);
	};
	await save('.process.START.json', {
		startedAt: new Date().toISOString(),
		command,
		timeoutMs: options.timeoutMs,
	});
	const result = await runBounded(command, options);
	const { stdout, stderr, ...terminal } = result;
	await writeFile(join(directory, name + '.stdout.log'), stdout, {
		flag: 'wx',
	});
	await writeFile(join(directory, name + '.stderr.log'), stderr, {
		flag: 'wx',
	});
	await save('.process.result.json', terminal);
	await save('.process.EXIT.json', {
		...terminal,
		finishedAt: new Date().toISOString(),
	});
	return terminal;
}
