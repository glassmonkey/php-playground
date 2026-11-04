// Test-only observation: preserve provider return values and original pointer actions.
export async function observeHover(page) {
	await page.addInitScript(() => {
		const q = (window.__quality = {
			events: [],
			providers: [],
			providerCalls: [],
			protocol: [],
			states: [],
			hookInstalled: false,
		});
		let monacoInstance;
		const stamp = () => performance.now();
		const install = (monaco) => {
			if (!monaco?.languages?.registerHoverProvider || q.hookInstalled)
				return;
			monacoInstance = monaco;
			q.hookInstalled = true;
			q.hookAt = stamp();
			const register = monaco.languages.registerHoverProvider.bind(
				monaco.languages
			);
			monaco.languages.registerHoverProvider = (selector, provider) => {
				const entry = {
					id: q.providers.length,
					selector,
					at: stamp(),
					disposedAt: null,
				};
				q.providers.push(entry);
				const observed = {
					...provider,
					provideHover: (...args) => {
						const [model, position, token] = args;
						const call = {
							provider: entry.id,
							start: stamp(),
							uri: model.uri.toString(),
							text: model.getValue(),
							version: model.getVersionId(),
							position,
							cancelledBefore: token.isCancellationRequested,
						};
						q.providerCalls.push(call);
						try {
							const result = provider.provideHover(...args);
							Promise.resolve(result).then(
								(value) => {
									call.finish = stamp();
									call.cancelledAfter =
										token.isCancellationRequested;
									call.result = value;
								},
								(error) => {
									call.finish = stamp();
									call.error = String(error);
								}
							);
							return result;
						} catch (error) {
							call.error = String(error);
							throw error;
						}
					},
				};
				const registration = register(selector, observed);
				return {
					dispose: () => {
						entry.disposedAt = stamp();
						registration.dispose();
					},
				};
			};
		};
		// Observe the real AMD editor export before React registers any provider.
		let amdRequire;
		Object.defineProperty(window, 'require', {
			configurable: true,
			get: () => amdRequire,
			set: (value) => {
				amdRequire =
					typeof value !== 'function'
						? value
						: new Proxy(value, {
								apply(target, thisArg, args) {
									if (
										Array.isArray(args[0]) &&
										args[0].includes(
											'vs/editor/editor.main'
										) &&
										typeof args[1] === 'function'
									) {
										const callback = args[1];
										args[1] = (...exports) => {
											exports.forEach((item) =>
												install(item?.m ?? item)
											);
											return callback(...exports);
										};
									}
									return Reflect.apply(target, thisArg, args);
								},
							});
			},
		});
		for (const type of [
			'mousemove',
			'pointermove',
			'mouseenter',
			'mouseleave',
			'keydown',
			'keyup',
			'focusin',
			'focusout',
		])
			document.addEventListener(
				type,
				(event) => {
					q.events.push({
						at: stamp(),
						timeStamp: event.timeStamp,
						type,
						key: event.key,
						x: event.clientX,
						y: event.clientY,
						target: event.target?.className,
						tag: event.target?.tagName,
					});
					if (typeof event.clientX === 'number')
						q.pointer = {
							x: event.clientX,
							y: event.clientY,
							at: stamp(),
							type,
						};
				},
				true
			);
		window.__qualityCapture = (label, point) => {
			const monaco = monacoInstance ?? window.monaco;
			const editor = monaco?.editor?.getEditors?.()[0];
			const target =
				point && editor?.getTargetAtClientPoint(point.x, point.y);
			const plainElement = (e) => ({
				tag: e.tagName,
				class: e.className,
				html: e.outerHTML.slice(0, 1200),
			});
			const state = {
				label,
				at: stamp(),
				point,
				pointer: q.pointer,
				editor: editor && {
					text: editor.getValue(),
					version: editor.getModel().getVersionId(),
					cursor: editor.getPosition(),
					selection: editor.getSelection(),
					focused: editor.hasTextFocus(),
					hoverOptions: editor.getOption(
						monaco.editor.EditorOption.hover
					),
				},
				target: target && {
					type: target.type,
					position: target.position,
					range: target.range,
					element: target.element && plainElement(target.element),
				},
				hit: point
					? document
							.elementsFromPoint(point.x, point.y)
							.slice(0, 6)
							.map(plainElement)
					: [],
				widgets: [
					...document.querySelectorAll(
						'.parameter-hints-widget,.monaco-hover,.suggest-widget'
					),
				].map((e) => {
					const style = getComputedStyle(e),
						rect = e.getBoundingClientRect();
					return {
						class: e.className,
						display: style.display,
						visibility: style.visibility,
						opacity: style.opacity,
						pointerEvents: style.pointerEvents,
						rect: {
							x: rect.x,
							y: rect.y,
							width: rect.width,
							height: rect.height,
						},
						text: e.textContent.slice(0, 1200),
					};
				}),
			};
			q.states.push(state);
			return state;
		};
	});
}
export async function hoverState(page, label) {
	return page.evaluate((label) => {
		window.__qualityCapture?.(label, window.__quality?.hoverPoint);
		return window.__quality;
	}, label);
}
