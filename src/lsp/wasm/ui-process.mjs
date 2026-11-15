import { spawn, execFileSync, spawnSync } from 'node:child_process';
import { constants } from 'node:os';
import { Buffer } from 'node:buffer';
import { writeFile, chmod, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { createReadStream, openSync, closeSync } from 'node:fs';

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

// Stream binary identity and the text-only diff separately; WASM contents never enter a git output buffer.
export async function hashFile(path) {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return { bytes: (await stat(path)).size, sha256: hash.digest('hex') };
}
export async function captureSource(root, directory) {
	const head = execFileSync('git', ['rev-parse', 'HEAD'], {
		cwd: root,
		encoding: 'utf8',
		timeout: 5000,
	}).trim();
	const path = join(directory, 'source.diff');
	const fd = openSync(path, 'wx');
	let result;
	try {
		result = spawnSync(
			'git',
			[
				'diff',
				'--no-ext-diff',
				'--no-textconv',
				'HEAD',
				'--',
				'.',
				':(exclude,glob)**/*.wasm',
			],
			{
				cwd: root,
				timeout: 5000,
				stdio: ['ignore', fd, 'pipe'],
				maxBuffer: 65536,
			}
		);
	} finally {
		closeSync(fd);
	}
	if (result.error) throw result.error;
	if (result.status !== 0)
		throw new Error(`Text source capture exited ${result.status}`);
	if ((await stat(path)).size > 16 * 1024 * 1024)
		throw new Error('Text source diff exceeds 16 MiB evidence limit');
	const binaryFiles = [];
	const assets = join(root, 'assets/lsp/phpantom');
	for (const entry of (await readdir(assets)).sort()) {
		if (entry.endsWith('.wasm'))
			binaryFiles.push({
				path: relative(root, join(assets, entry)),
				...(await hashFile(join(assets, entry))),
			});
	}
	return {
		head,
		textDiff: { path: 'source.diff', ...(await hashFile(path)) },
		binaryFiles,
	};
}
