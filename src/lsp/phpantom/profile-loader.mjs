const profileUriRoot = 'phpantom-profile://php/';

export function isReservedPhpantomProfileUri(uri) {
	if (typeof uri !== 'string') return false;
	try {
		const parsed = new URL(uri);
		return (
			parsed.protocol === 'phpantom-profile:' && parsed.hostname === 'php'
		);
	} catch {
		return uri.toLowerCase().startsWith(profileUriRoot);
	}
}

export function validatePhpProfileManifest(manifest, phpVersion, baseUrl) {
	if (
		typeof manifest !== 'object' ||
		manifest === null ||
		manifest.schemaVersion !== 1 ||
		typeof manifest.profiles !== 'object' ||
		manifest.profiles === null
	) {
		throw new Error('PHP profile manifest must use schemaVersion 1.');
	}

	const profile = manifest.profiles[phpVersion];
	if (
		typeof profile !== 'object' ||
		profile === null ||
		!Array.isArray(profile.files) ||
		profile.files.length === 0
	) {
		throw new Error(
			`PHP profile manifest has no complete profile for ${phpVersion}.`
		);
	}

	const origin = new URL(baseUrl).origin;
	const logicalPaths = new Set();
	return profile.files.map((file) => {
		if (
			typeof file !== 'object' ||
			file === null ||
			typeof file.logicalPath !== 'string' ||
			typeof file.url !== 'string' ||
			!/^[a-f0-9]{64}$/.test(file.sha256)
		) {
			throw new Error(
				`PHP ${phpVersion} profile contains a malformed file entry.`
			);
		}
		const logicalPath = file.logicalPath;
		if (
			logicalPath.length === 0 ||
			logicalPath.startsWith('/') ||
			logicalPath.includes('\\') ||
			logicalPath
				.split('/')
				.some((part) => part === '' || part === '.' || part === '..')
		) {
			throw new Error(
				`PHP profile has an invalid logical path: ${logicalPath}.`
			);
		}
		if (logicalPaths.has(logicalPath)) {
			throw new Error(`PHP profile repeats logical path ${logicalPath}.`);
		}
		logicalPaths.add(logicalPath);

		if (
			file.url.startsWith('/') ||
			file.url.includes('\\') ||
			/^[a-z][a-z\d+.-]*:/i.test(file.url)
		) {
			throw new Error(`PHP profile URL must be relative: ${file.url}.`);
		}
		const decodedUrl = decodeURIComponent(file.url.split(/[?#]/, 1)[0]);
		if (decodedUrl.includes('\\') || decodedUrl.split('/').includes('..')) {
			throw new Error(
				`PHP profile URL must not traverse parent paths: ${file.url}.`
			);
		}
		const absoluteUrl = new URL(file.url, baseUrl);
		if (absoluteUrl.origin !== origin) {
			throw new Error(
				`PHP profile URL must be same-origin: ${file.url}.`
			);
		}
		return { logicalPath, url: absoluteUrl.href, sha256: file.sha256 };
	});
}

export async function loadPhpProfileDocuments({
	manifestUrl,
	expectedManifestSha256,
	phpVersion,
	baseUrl,
	fetchResource,
	digest,
	openDocument,
}) {
	if (!/^[a-f0-9]{64}$/.test(expectedManifestSha256 ?? '')) {
		throw new Error(
			'A runtime-pinned PHP profile manifest SHA-256 is required.'
		);
	}
	const absoluteManifestUrl = new URL(manifestUrl, baseUrl);
	if (absoluteManifestUrl.origin !== new URL(baseUrl).origin) {
		throw new Error('PHP profile manifest URL must be same-origin.');
	}
	const manifestResponse = await fetchResource(absoluteManifestUrl.href);
	if (!manifestResponse.ok) {
		throw new Error(
			`Could not load PHP profile manifest (${manifestResponse.status}).`
		);
	}
	if (
		manifestResponse.url &&
		new URL(manifestResponse.url).origin !== absoluteManifestUrl.origin
	) {
		throw new Error(
			'PHP profile manifest redirected to a different origin.'
		);
	}
	const manifestBytes = new Uint8Array(await manifestResponse.arrayBuffer());
	if ((await digest(manifestBytes)) !== expectedManifestSha256) {
		throw new Error(
			'PHP profile manifest SHA-256 does not match the runtime pin.'
		);
	}
	let manifest;
	try {
		manifest = JSON.parse(
			new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)
		);
	} catch {
		throw new Error('PHP profile manifest is not valid UTF-8 JSON.');
	}

	const files = validatePhpProfileManifest(
		manifest,
		phpVersion,
		absoluteManifestUrl.href
	);
	const verifiedTextByContent = new Map();
	for (const file of files) {
		const contentKey = `${file.url}\n${file.sha256}`;
		let text = verifiedTextByContent.get(contentKey);
		if (text === undefined) {
			const response = await fetchResource(file.url);
			if (!response.ok) {
				throw new Error(
					`Could not load PHP profile input ${file.logicalPath} (${response.status}).`
				);
			}
			if (
				response.url &&
				new URL(response.url).origin !== absoluteManifestUrl.origin
			) {
				throw new Error(
					`PHP profile input redirected to a different origin: ${file.logicalPath}.`
				);
			}
			const bytes = new Uint8Array(await response.arrayBuffer());
			if ((await digest(bytes)) !== file.sha256) {
				throw new Error(
					`PHP profile input SHA-256 mismatch: ${file.logicalPath}.`
				);
			}
			try {
				text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
			} catch {
				throw new Error(
					`PHP profile input is not valid UTF-8: ${file.logicalPath}.`
				);
			}
			verifiedTextByContent.set(contentKey, text);
		}
		const encodedPath = file.logicalPath
			.split('/')
			.map(encodeURIComponent)
			.join('/');
		await openDocument({
			uri: `${profileUriRoot}${phpVersion}/${encodedPath}`,
			text,
		});
	}
}
