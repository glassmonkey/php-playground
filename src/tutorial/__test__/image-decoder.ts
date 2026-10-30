import type { Page } from '@playwright/test';

/** Decode with Chromium, independently of the SVG/PNG renderer. No header parsing. */
export function decodePng(page: Page, bytes: Uint8Array) {
	return page.evaluate(
		async (dataUrl) => {
			const image = new Image();
			image.src = dataUrl;
			await image.decode();
			return { width: image.naturalWidth, height: image.naturalHeight };
		},
		`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`
	);
}

/** Complete decoded image payload for comparisons against reviewed baselines. */
export function readPngPixels(page: Page, bytes: Uint8Array) {
	return page.evaluate(
		async (dataUrl) => {
			const image = new Image();
			image.src = dataUrl;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			const context = canvas.getContext('2d')!;
			context.drawImage(image, 0, 0);
			const pixels = context.getImageData(
				0,
				0,
				canvas.width,
				canvas.height
			).data;
			const chunks: string[] = [];
			for (let offset = 0; offset < pixels.length; offset += 32768) {
				chunks.push(
					String.fromCharCode(
						...pixels.subarray(offset, offset + 32768)
					)
				);
			}
			return {
				width: canvas.width,
				height: canvas.height,
				rgba: btoa(chunks.join('')),
			};
		},
		`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`
	);
}
