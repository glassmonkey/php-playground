export const dependenciesTotalSize = 4704205;
export const dependencyFilename =
	'php-8.3.wasm?e217d5668eafc50cdd784ead93e04879';
export default function (RuntimeName, PHPLoader, EnvVariables) {
	var Module = typeof PHPLoader != 'undefined' ? PHPLoader : {};
	var ENVIRONMENT_IS_WEB = RuntimeName === 'WEB';
	var ENVIRONMENT_IS_WORKER = RuntimeName === 'WORKER';
	var ENVIRONMENT_IS_NODE = RuntimeName === 'NODE';
	var moduleOverrides = Object.assign({}, Module);
	var arguments_ = [];
	var thisProgram = './this.program';
	var quit_ = (status, toThrow) => {
		throw toThrow;
	};
	var scriptDirectory = '';
	function locateFile(path) {
		if (Module['locateFile']) {
			return Module['locateFile'](path, scriptDirectory);
		}
		return scriptDirectory + path;
	}
	var readAsync, readBinary;
	if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
		if (ENVIRONMENT_IS_WORKER) {
			scriptDirectory = self.location.href;
		} else if (typeof document != 'undefined' && document.currentScript) {
			scriptDirectory = document.currentScript.src;
		}
		if (scriptDirectory.startsWith('blob:')) {
			scriptDirectory = '';
		} else {
			scriptDirectory = scriptDirectory.substr(
				0,
				scriptDirectory.replace(/[?#].*/, '').lastIndexOf('/') + 1
			);
		}
		{
			readAsync = (url) =>
				fetch(url, { credentials: 'same-origin' }).then((response) => {
					if (response.ok) {
						return response.arrayBuffer();
					}
					return Promise.reject(
						new Error(response.status + ' : ' + response.url)
					);
				});
		}
	} else {
	}
	var out = Module['print'] || console.log.bind(console);
	var err = Module['printErr'] || console.error.bind(console);
	Object.assign(Module, moduleOverrides);
	moduleOverrides = null;
	if (Module['arguments']) arguments_ = Module['arguments'];
	if (Module['thisProgram']) thisProgram = Module['thisProgram'];
	if (Module['quit']) quit_ = Module['quit'];
	var wasmBinary;
	if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];
	var wasmMemory;
	var ABORT = false;
	var EXITSTATUS;
	function assert(condition, text) {
		if (!condition) {
			abort(text);
		}
	}
	var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
	function updateMemoryViews() {
		var b = wasmMemory.buffer;
		Module['HEAP8'] = HEAP8 = new Int8Array(b);
		Module['HEAP16'] = HEAP16 = new Int16Array(b);
		Module['HEAPU8'] = HEAPU8 = new Uint8Array(b);
		Module['HEAPU16'] = HEAPU16 = new Uint16Array(b);
		Module['HEAP32'] = HEAP32 = new Int32Array(b);
		Module['HEAPU32'] = HEAPU32 = new Uint32Array(b);
		Module['HEAPF32'] = HEAPF32 = new Float32Array(b);
		Module['HEAPF64'] = HEAPF64 = new Float64Array(b);
	}
	var __ATPRERUN__ = [];
	var __ATINIT__ = [];
	var __ATEXIT__ = [];
	var __ATPOSTRUN__ = [];
	var runtimeInitialized = false;
	var runtimeExited = false;
	function preRun() {
		if (Module['preRun']) {
			if (typeof Module['preRun'] == 'function')
				Module['preRun'] = [Module['preRun']];
			while (Module['preRun'].length) {
				addOnPreRun(Module['preRun'].shift());
			}
		}
		callRuntimeCallbacks(__ATPRERUN__);
	}
	function initRuntime() {
		runtimeInitialized = true;
		if (!Module['noFSInit'] && !FS.init.initialized) FS.init();
		FS.ignorePermissions = false;
		TTY.init();
		SOCKFS.root = FS.mount(SOCKFS, {}, null);
		PIPEFS.root = FS.mount(PIPEFS, {}, null);
		callRuntimeCallbacks(__ATINIT__);
	}
	function exitRuntime() {
		___funcs_on_exit();
		callRuntimeCallbacks(__ATEXIT__);
		FS.quit();
		TTY.shutdown();
		runtimeExited = true;
	}
	function postRun() {
		if (Module['postRun']) {
			if (typeof Module['postRun'] == 'function')
				Module['postRun'] = [Module['postRun']];
			while (Module['postRun'].length) {
				addOnPostRun(Module['postRun'].shift());
			}
		}
		callRuntimeCallbacks(__ATPOSTRUN__);
	}
	function addOnPreRun(cb) {
		__ATPRERUN__.unshift(cb);
	}
	function addOnInit(cb) {
		__ATINIT__.unshift(cb);
	}
	function addOnPostRun(cb) {
		__ATPOSTRUN__.unshift(cb);
	}
	var runDependencies = 0;
	var runDependencyWatcher = null;
	var dependenciesFulfilled = null;
	function getUniqueRunDependency(id) {
		return id;
	}
	function addRunDependency(id) {
		runDependencies++;
		Module['monitorRunDependencies']?.(runDependencies);
	}
	function removeRunDependency(id) {
		runDependencies--;
		Module['monitorRunDependencies']?.(runDependencies);
		if (runDependencies == 0) {
			if (runDependencyWatcher !== null) {
				clearInterval(runDependencyWatcher);
				runDependencyWatcher = null;
			}
			if (dependenciesFulfilled) {
				var callback = dependenciesFulfilled;
				dependenciesFulfilled = null;
				callback();
			}
		}
	}
	function abort(what) {
		Module['onAbort']?.(what);
		what = 'Aborted(' + what + ')';
		err(what);
		ABORT = true;
		EXITSTATUS = 1;
		what += '. Build with -sASSERTIONS for more info.';
		var e = new WebAssembly.RuntimeError(what);
		throw e;
	}
	var dataURIPrefix = 'data:application/octet-stream;base64,';
	var isDataURI = (filename) => filename.startsWith(dataURIPrefix);
	function findWasmBinary() {
		var f = dependencyFilename;
		if (!isDataURI(f)) {
			return locateFile(f);
		}
		return f;
	}
	var wasmBinaryFile;
	function getBinarySync(file) {
		if (file == wasmBinaryFile && wasmBinary) {
			return new Uint8Array(wasmBinary);
		}
		if (readBinary) {
			return readBinary(file);
		}
		throw 'both async and sync fetching of the wasm failed';
	}
	function getBinaryPromise(binaryFile) {
		if (!wasmBinary) {
			return readAsync(binaryFile).then(
				(response) => new Uint8Array(response),
				() => getBinarySync(binaryFile)
			);
		}
		return Promise.resolve().then(() => getBinarySync(binaryFile));
	}
	function instantiateArrayBuffer(binaryFile, imports, receiver) {
		return getBinaryPromise(binaryFile)
			.then((binary) => WebAssembly.instantiate(binary, imports))
			.then(receiver, (reason) => {
				err(`failed to asynchronously prepare wasm: ${reason}`);
				abort(reason);
			});
	}
	function instantiateAsync(binary, binaryFile, imports, callback) {
		if (
			!binary &&
			typeof WebAssembly.instantiateStreaming == 'function' &&
			!isDataURI(binaryFile) &&
			typeof fetch == 'function'
		) {
			return fetch(binaryFile, { credentials: 'same-origin' }).then(
				(response) => {
					var result = WebAssembly.instantiateStreaming(
						response,
						imports
					);
					return result.then(callback, function (reason) {
						err(`wasm streaming compile failed: ${reason}`);
						err('falling back to ArrayBuffer instantiation');
						return instantiateArrayBuffer(
							binaryFile,
							imports,
							callback
						);
					});
				}
			);
		}
		return instantiateArrayBuffer(binaryFile, imports, callback);
	}
	function getWasmImports() {
		return { a: wasmImports };
	}
	function createWasm() {
		var info = getWasmImports();
		function receiveInstance(instance, module) {
			wasmExports = instance.exports;
			wasmMemory = wasmExports['Sa'];
			updateMemoryViews();
			wasmTable = wasmExports['Xa'];
			addOnInit(wasmExports['Ta']);
			removeRunDependency('wasm-instantiate');
			return wasmExports;
		}
		addRunDependency('wasm-instantiate');
		function receiveInstantiationResult(result) {
			receiveInstance(result['instance']);
		}
		if (Module['instantiateWasm']) {
			try {
				return Module['instantiateWasm'](info, receiveInstance);
			} catch (e) {
				err(`Module.instantiateWasm callback failed with error: ${e}`);
				return false;
			}
		}
		if (!wasmBinaryFile) wasmBinaryFile = findWasmBinary();
		instantiateAsync(
			wasmBinary,
			wasmBinaryFile,
			info,
			receiveInstantiationResult
		);
		return {};
	}
	var tempDouble;
	var tempI64;
	function ExitStatus(status) {
		this.name = 'ExitStatus';
		this.message = `Program terminated with exit(${status})`;
		this.status = status;
	}
	var callRuntimeCallbacks = (callbacks) => {
		while (callbacks.length > 0) {
			callbacks.shift()(Module);
		}
	};
	var noExitRuntime = Module['noExitRuntime'] || false;
	var stackRestore = (val) => __emscripten_stack_restore(val);
	var stackSave = () => _emscripten_stack_get_current();
	var UTF8Decoder =
		typeof TextDecoder != 'undefined' ? new TextDecoder() : undefined;
	var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
		var endIdx = idx + maxBytesToRead;
		var endPtr = idx;
		while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
		if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
			return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
		}
		var str = '';
		while (idx < endPtr) {
			var u0 = heapOrArray[idx++];
			if (!(u0 & 128)) {
				str += String.fromCharCode(u0);
				continue;
			}
			var u1 = heapOrArray[idx++] & 63;
			if ((u0 & 224) == 192) {
				str += String.fromCharCode(((u0 & 31) << 6) | u1);
				continue;
			}
			var u2 = heapOrArray[idx++] & 63;
			if ((u0 & 240) == 224) {
				u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
			} else {
				u0 =
					((u0 & 7) << 18) |
					(u1 << 12) |
					(u2 << 6) |
					(heapOrArray[idx++] & 63);
			}
			if (u0 < 65536) {
				str += String.fromCharCode(u0);
			} else {
				var ch = u0 - 65536;
				str += String.fromCharCode(
					55296 | (ch >> 10),
					56320 | (ch & 1023)
				);
			}
		}
		return str;
	};
	var UTF8ToString = (ptr, maxBytesToRead) =>
		ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : '';
	var ___assert_fail = (condition, filename, line, func) => {
		abort(
			`Assertion failed: ${UTF8ToString(condition)}, at: ` +
				[
					filename ? UTF8ToString(filename) : 'unknown filename',
					line,
					func ? UTF8ToString(func) : 'unknown function',
				]
		);
	};
	var wasmTableMirror = [];
	var wasmTable;
	var getWasmTableEntry = (funcPtr) => {
		var func = wasmTableMirror[funcPtr];
		if (!func) {
			if (funcPtr >= wasmTableMirror.length)
				wasmTableMirror.length = funcPtr + 1;
			wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
		}
		return func;
	};
	var ___call_sighandler = (fp, sig) => getWasmTableEntry(fp)(sig);
	var PATH = {
		isAbs: (path) => path.charAt(0) === '/',
		splitPath: (filename) => {
			var splitPathRe =
				/^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
			return splitPathRe.exec(filename).slice(1);
		},
		normalizeArray: (parts, allowAboveRoot) => {
			var up = 0;
			for (var i = parts.length - 1; i >= 0; i--) {
				var last = parts[i];
				if (last === '.') {
					parts.splice(i, 1);
				} else if (last === '..') {
					parts.splice(i, 1);
					up++;
				} else if (up) {
					parts.splice(i, 1);
					up--;
				}
			}
			if (allowAboveRoot) {
				for (; up; up--) {
					parts.unshift('..');
				}
			}
			return parts;
		},
		normalize: (path) => {
			var isAbsolute = PATH.isAbs(path),
				trailingSlash = path.substr(-1) === '/';
			path = PATH.normalizeArray(
				path.split('/').filter((p) => !!p),
				!isAbsolute
			).join('/');
			if (!path && !isAbsolute) {
				path = '.';
			}
			if (path && trailingSlash) {
				path += '/';
			}
			return (isAbsolute ? '/' : '') + path;
		},
		dirname: (path) => {
			var result = PATH.splitPath(path),
				root = result[0],
				dir = result[1];
			if (!root && !dir) {
				return '.';
			}
			if (dir) {
				dir = dir.substr(0, dir.length - 1);
			}
			return root + dir;
		},
		basename: (path) => {
			if (path === '/') return '/';
			path = PATH.normalize(path);
			path = path.replace(/\/$/, '');
			var lastSlash = path.lastIndexOf('/');
			if (lastSlash === -1) return path;
			return path.substr(lastSlash + 1);
		},
		join: (...paths) => PATH.normalize(paths.join('/')),
		join2: (l, r) => PATH.normalize(l + '/' + r),
	};
	var initRandomFill = () => {
		if (
			typeof crypto == 'object' &&
			typeof crypto['getRandomValues'] == 'function'
		) {
			return (view) => crypto.getRandomValues(view);
		} else abort('initRandomDevice');
	};
	var randomFill = (view) => (randomFill = initRandomFill())(view);
	var PATH_FS = {
		resolve: (...args) => {
			var resolvedPath = '',
				resolvedAbsolute = false;
			for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
				var path = i >= 0 ? args[i] : FS.cwd();
				if (typeof path != 'string') {
					throw new TypeError(
						'Arguments to path.resolve must be strings'
					);
				} else if (!path) {
					return '';
				}
				resolvedPath = path + '/' + resolvedPath;
				resolvedAbsolute = PATH.isAbs(path);
			}
			resolvedPath = PATH.normalizeArray(
				resolvedPath.split('/').filter((p) => !!p),
				!resolvedAbsolute
			).join('/');
			return (resolvedAbsolute ? '/' : '') + resolvedPath || '.';
		},
		relative: (from, to) => {
			from = PATH_FS.resolve(from).substr(1);
			to = PATH_FS.resolve(to).substr(1);
			function trim(arr) {
				var start = 0;
				for (; start < arr.length; start++) {
					if (arr[start] !== '') break;
				}
				var end = arr.length - 1;
				for (; end >= 0; end--) {
					if (arr[end] !== '') break;
				}
				if (start > end) return [];
				return arr.slice(start, end - start + 1);
			}
			var fromParts = trim(from.split('/'));
			var toParts = trim(to.split('/'));
			var length = Math.min(fromParts.length, toParts.length);
			var samePartsLength = length;
			for (var i = 0; i < length; i++) {
				if (fromParts[i] !== toParts[i]) {
					samePartsLength = i;
					break;
				}
			}
			var outputParts = [];
			for (var i = samePartsLength; i < fromParts.length; i++) {
				outputParts.push('..');
			}
			outputParts = outputParts.concat(toParts.slice(samePartsLength));
			return outputParts.join('/');
		},
	};
	var FS_stdin_getChar_buffer = [];
	var lengthBytesUTF8 = (str) => {
		var len = 0;
		for (var i = 0; i < str.length; ++i) {
			var c = str.charCodeAt(i);
			if (c <= 127) {
				len++;
			} else if (c <= 2047) {
				len += 2;
			} else if (c >= 55296 && c <= 57343) {
				len += 4;
				++i;
			} else {
				len += 3;
			}
		}
		return len;
	};
	var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
		if (!(maxBytesToWrite > 0)) return 0;
		var startIdx = outIdx;
		var endIdx = outIdx + maxBytesToWrite - 1;
		for (var i = 0; i < str.length; ++i) {
			var u = str.charCodeAt(i);
			if (u >= 55296 && u <= 57343) {
				var u1 = str.charCodeAt(++i);
				u = (65536 + ((u & 1023) << 10)) | (u1 & 1023);
			}
			if (u <= 127) {
				if (outIdx >= endIdx) break;
				heap[outIdx++] = u;
			} else if (u <= 2047) {
				if (outIdx + 1 >= endIdx) break;
				heap[outIdx++] = 192 | (u >> 6);
				heap[outIdx++] = 128 | (u & 63);
			} else if (u <= 65535) {
				if (outIdx + 2 >= endIdx) break;
				heap[outIdx++] = 224 | (u >> 12);
				heap[outIdx++] = 128 | ((u >> 6) & 63);
				heap[outIdx++] = 128 | (u & 63);
			} else {
				if (outIdx + 3 >= endIdx) break;
				heap[outIdx++] = 240 | (u >> 18);
				heap[outIdx++] = 128 | ((u >> 12) & 63);
				heap[outIdx++] = 128 | ((u >> 6) & 63);
				heap[outIdx++] = 128 | (u & 63);
			}
		}
		heap[outIdx] = 0;
		return outIdx - startIdx;
	};
	function intArrayFromString(stringy, dontAddNull, length) {
		var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
		var u8array = new Array(len);
		var numBytesWritten = stringToUTF8Array(
			stringy,
			u8array,
			0,
			u8array.length
		);
		if (dontAddNull) u8array.length = numBytesWritten;
		return u8array;
	}
	var FS_stdin_getChar = () => {
		if (!FS_stdin_getChar_buffer.length) {
			var result = null;
			if (
				typeof window != 'undefined' &&
				typeof window.prompt == 'function'
			) {
				result = window.prompt('Input: ');
				if (result !== null) {
					result += '\n';
				}
			} else {
			}
			if (!result) {
				return null;
			}
			FS_stdin_getChar_buffer = intArrayFromString(result, true);
		}
		return FS_stdin_getChar_buffer.shift();
	};
	var TTY = {
		ttys: [],
		init() {},
		shutdown() {},
		register(dev, ops) {
			TTY.ttys[dev] = { input: [], output: [], ops: ops };
			FS.registerDevice(dev, TTY.stream_ops);
		},
		stream_ops: {
			open(stream) {
				var tty = TTY.ttys[stream.node.rdev];
				if (!tty) {
					throw new FS.ErrnoError(43);
				}
				stream.tty = tty;
				stream.seekable = false;
			},
			close(stream) {
				stream.tty.ops.fsync(stream.tty);
			},
			fsync(stream) {
				stream.tty.ops.fsync(stream.tty);
			},
			read(stream, buffer, offset, length, pos) {
				if (!stream.tty || !stream.tty.ops.get_char) {
					throw new FS.ErrnoError(60);
				}
				var bytesRead = 0;
				for (var i = 0; i < length; i++) {
					var result;
					try {
						result = stream.tty.ops.get_char(stream.tty);
					} catch (e) {
						throw new FS.ErrnoError(29);
					}
					if (result === undefined && bytesRead === 0) {
						throw new FS.ErrnoError(6);
					}
					if (result === null || result === undefined) break;
					bytesRead++;
					buffer[offset + i] = result;
				}
				if (bytesRead) {
					stream.node.timestamp = Date.now();
				}
				return bytesRead;
			},
			write(stream, buffer, offset, length, pos) {
				if (!stream.tty || !stream.tty.ops.put_char) {
					throw new FS.ErrnoError(60);
				}
				try {
					for (var i = 0; i < length; i++) {
						stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
					}
				} catch (e) {
					throw new FS.ErrnoError(29);
				}
				if (length) {
					stream.node.timestamp = Date.now();
				}
				return i;
			},
		},
		default_tty_ops: {
			get_char(tty) {
				return FS_stdin_getChar();
			},
			put_char(tty, val) {
				if (val === null || val === 10) {
					out(UTF8ArrayToString(tty.output, 0));
					tty.output = [];
				} else {
					if (val != 0) tty.output.push(val);
				}
			},
			fsync(tty) {
				if (tty.output && tty.output.length > 0) {
					out(UTF8ArrayToString(tty.output, 0));
					tty.output = [];
				}
			},
			ioctl_tcgets(tty) {
				return {
					c_iflag: 25856,
					c_oflag: 5,
					c_cflag: 191,
					c_lflag: 35387,
					c_cc: [
						3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23,
						22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					],
				};
			},
			ioctl_tcsets(tty, optional_actions, data) {
				return 0;
			},
			ioctl_tiocgwinsz(tty) {
				return [24, 80];
			},
		},
		default_tty1_ops: {
			put_char(tty, val) {
				if (val === null || val === 10) {
					err(UTF8ArrayToString(tty.output, 0));
					tty.output = [];
				} else {
					if (val != 0) tty.output.push(val);
				}
			},
			fsync(tty) {
				if (tty.output && tty.output.length > 0) {
					err(UTF8ArrayToString(tty.output, 0));
					tty.output = [];
				}
			},
		},
	};
	var zeroMemory = (address, size) => {
		HEAPU8.fill(0, address, address + size);
		return address;
	};
	var alignMemory = (size, alignment) =>
		Math.ceil(size / alignment) * alignment;
	var mmapAlloc = (size) => {
		size = alignMemory(size, 65536);
		var ptr = _emscripten_builtin_memalign(65536, size);
		if (!ptr) return 0;
		return zeroMemory(ptr, size);
	};
	var MEMFS = {
		ops_table: null,
		mount(mount) {
			return MEMFS.createNode(null, '/', 16384 | 511, 0);
		},
		createNode(parent, name, mode, dev) {
			if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
				throw new FS.ErrnoError(63);
			}
			MEMFS.ops_table ||= {
				dir: {
					node: {
						getattr: MEMFS.node_ops.getattr,
						setattr: MEMFS.node_ops.setattr,
						lookup: MEMFS.node_ops.lookup,
						mknod: MEMFS.node_ops.mknod,
						rename: MEMFS.node_ops.rename,
						unlink: MEMFS.node_ops.unlink,
						rmdir: MEMFS.node_ops.rmdir,
						readdir: MEMFS.node_ops.readdir,
						symlink: MEMFS.node_ops.symlink,
					},
					stream: { llseek: MEMFS.stream_ops.llseek },
				},
				file: {
					node: {
						getattr: MEMFS.node_ops.getattr,
						setattr: MEMFS.node_ops.setattr,
					},
					stream: {
						llseek: MEMFS.stream_ops.llseek,
						read: MEMFS.stream_ops.read,
						write: MEMFS.stream_ops.write,
						allocate: MEMFS.stream_ops.allocate,
						mmap: MEMFS.stream_ops.mmap,
						msync: MEMFS.stream_ops.msync,
					},
				},
				link: {
					node: {
						getattr: MEMFS.node_ops.getattr,
						setattr: MEMFS.node_ops.setattr,
						readlink: MEMFS.node_ops.readlink,
					},
					stream: {},
				},
				chrdev: {
					node: {
						getattr: MEMFS.node_ops.getattr,
						setattr: MEMFS.node_ops.setattr,
					},
					stream: FS.chrdev_stream_ops,
				},
			};
			var node = FS.createNode(parent, name, mode, dev);
			if (FS.isDir(node.mode)) {
				node.node_ops = MEMFS.ops_table.dir.node;
				node.stream_ops = MEMFS.ops_table.dir.stream;
				node.contents = {};
			} else if (FS.isFile(node.mode)) {
				node.node_ops = MEMFS.ops_table.file.node;
				node.stream_ops = MEMFS.ops_table.file.stream;
				node.usedBytes = 0;
				node.contents = null;
			} else if (FS.isLink(node.mode)) {
				node.node_ops = MEMFS.ops_table.link.node;
				node.stream_ops = MEMFS.ops_table.link.stream;
			} else if (FS.isChrdev(node.mode)) {
				node.node_ops = MEMFS.ops_table.chrdev.node;
				node.stream_ops = MEMFS.ops_table.chrdev.stream;
			}
			node.timestamp = Date.now();
			if (parent) {
				parent.contents[name] = node;
				parent.timestamp = node.timestamp;
			}
			return node;
		},
		getFileDataAsTypedArray(node) {
			if (!node.contents) return new Uint8Array(0);
			if (node.contents.subarray)
				return node.contents.subarray(0, node.usedBytes);
			return new Uint8Array(node.contents);
		},
		expandFileStorage(node, newCapacity) {
			var prevCapacity = node.contents ? node.contents.length : 0;
			if (prevCapacity >= newCapacity) return;
			var CAPACITY_DOUBLING_MAX = 1024 * 1024;
			newCapacity = Math.max(
				newCapacity,
				(prevCapacity *
					(prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125)) >>>
					0
			);
			if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
			var oldContents = node.contents;
			node.contents = new Uint8Array(newCapacity);
			if (node.usedBytes > 0)
				node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
		},
		resizeFileStorage(node, newSize) {
			if (node.usedBytes == newSize) return;
			if (newSize == 0) {
				node.contents = null;
				node.usedBytes = 0;
			} else {
				var oldContents = node.contents;
				node.contents = new Uint8Array(newSize);
				if (oldContents) {
					node.contents.set(
						oldContents.subarray(
							0,
							Math.min(newSize, node.usedBytes)
						)
					);
				}
				node.usedBytes = newSize;
			}
		},
		node_ops: {
			getattr(node) {
				var attr = {};
				attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
				attr.ino = node.id;
				attr.mode = node.mode;
				attr.nlink = 1;
				attr.uid = 0;
				attr.gid = 0;
				attr.rdev = node.rdev;
				if (FS.isDir(node.mode)) {
					attr.size = 4096;
				} else if (FS.isFile(node.mode)) {
					attr.size = node.usedBytes;
				} else if (FS.isLink(node.mode)) {
					attr.size = node.link.length;
				} else {
					attr.size = 0;
				}
				attr.atime = new Date(node.timestamp);
				attr.mtime = new Date(node.timestamp);
				attr.ctime = new Date(node.timestamp);
				attr.blksize = 4096;
				attr.blocks = Math.ceil(attr.size / attr.blksize);
				return attr;
			},
			setattr(node, attr) {
				if (attr.mode !== undefined) {
					node.mode = attr.mode;
				}
				if (attr.timestamp !== undefined) {
					node.timestamp = attr.timestamp;
				}
				if (attr.size !== undefined) {
					MEMFS.resizeFileStorage(node, attr.size);
				}
			},
			lookup(parent, name) {
				throw FS.genericErrors[44];
			},
			mknod(parent, name, mode, dev) {
				return MEMFS.createNode(parent, name, mode, dev);
			},
			rename(old_node, new_dir, new_name) {
				if (FS.isDir(old_node.mode)) {
					var new_node;
					try {
						new_node = FS.lookupNode(new_dir, new_name);
					} catch (e) {}
					if (new_node) {
						for (var i in new_node.contents) {
							throw new FS.ErrnoError(55);
						}
					}
				}
				delete old_node.parent.contents[old_node.name];
				old_node.parent.timestamp = Date.now();
				old_node.name = new_name;
				new_dir.contents[new_name] = old_node;
				new_dir.timestamp = old_node.parent.timestamp;
			},
			unlink(parent, name) {
				delete parent.contents[name];
				parent.timestamp = Date.now();
			},
			rmdir(parent, name) {
				var node = FS.lookupNode(parent, name);
				for (var i in node.contents) {
					throw new FS.ErrnoError(55);
				}
				delete parent.contents[name];
				parent.timestamp = Date.now();
			},
			readdir(node) {
				var entries = ['.', '..'];
				for (var key of Object.keys(node.contents)) {
					entries.push(key);
				}
				return entries;
			},
			symlink(parent, newname, oldpath) {
				var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
				node.link = oldpath;
				return node;
			},
			readlink(node) {
				if (!FS.isLink(node.mode)) {
					throw new FS.ErrnoError(28);
				}
				return node.link;
			},
		},
		stream_ops: {
			read(stream, buffer, offset, length, position) {
				var contents = stream.node.contents;
				if (position >= stream.node.usedBytes) return 0;
				var size = Math.min(stream.node.usedBytes - position, length);
				if (size > 8 && contents.subarray) {
					buffer.set(
						contents.subarray(position, position + size),
						offset
					);
				} else {
					for (var i = 0; i < size; i++)
						buffer[offset + i] = contents[position + i];
				}
				return size;
			},
			write(stream, buffer, offset, length, position, canOwn) {
				if (buffer.buffer === HEAP8.buffer) {
					canOwn = false;
				}
				if (!length) return 0;
				var node = stream.node;
				node.timestamp = Date.now();
				if (
					buffer.subarray &&
					(!node.contents || node.contents.subarray)
				) {
					if (canOwn) {
						node.contents = buffer.subarray(
							offset,
							offset + length
						);
						node.usedBytes = length;
						return length;
					} else if (node.usedBytes === 0 && position === 0) {
						node.contents = buffer.slice(offset, offset + length);
						node.usedBytes = length;
						return length;
					} else if (position + length <= node.usedBytes) {
						node.contents.set(
							buffer.subarray(offset, offset + length),
							position
						);
						return length;
					}
				}
				MEMFS.expandFileStorage(node, position + length);
				if (node.contents.subarray && buffer.subarray) {
					node.contents.set(
						buffer.subarray(offset, offset + length),
						position
					);
				} else {
					for (var i = 0; i < length; i++) {
						node.contents[position + i] = buffer[offset + i];
					}
				}
				node.usedBytes = Math.max(node.usedBytes, position + length);
				return length;
			},
			llseek(stream, offset, whence) {
				var position = offset;
				if (whence === 1) {
					position += stream.position;
				} else if (whence === 2) {
					if (FS.isFile(stream.node.mode)) {
						position += stream.node.usedBytes;
					}
				}
				if (position < 0) {
					throw new FS.ErrnoError(28);
				}
				return position;
			},
			allocate(stream, offset, length) {
				MEMFS.expandFileStorage(stream.node, offset + length);
				stream.node.usedBytes = Math.max(
					stream.node.usedBytes,
					offset + length
				);
			},
			mmap(stream, length, position, prot, flags) {
				if (!FS.isFile(stream.node.mode)) {
					throw new FS.ErrnoError(43);
				}
				var ptr;
				var allocated;
				var contents = stream.node.contents;
				if (!(flags & 2) && contents.buffer === HEAP8.buffer) {
					allocated = false;
					ptr = contents.byteOffset;
				} else {
					if (position > 0 || position + length < contents.length) {
						if (contents.subarray) {
							contents = contents.subarray(
								position,
								position + length
							);
						} else {
							contents = Array.prototype.slice.call(
								contents,
								position,
								position + length
							);
						}
					}
					allocated = true;
					ptr = mmapAlloc(length);
					if (!ptr) {
						throw new FS.ErrnoError(48);
					}
					HEAP8.set(contents, ptr);
				}
				return { ptr: ptr, allocated: allocated };
			},
			msync(stream, buffer, offset, length, mmapFlags) {
				MEMFS.stream_ops.write(
					stream,
					buffer,
					0,
					length,
					offset,
					false
				);
				return 0;
			},
		},
	};
	var asyncLoad = (url, onload, onerror, noRunDep) => {
		var dep = !noRunDep ? getUniqueRunDependency(`al ${url}`) : '';
		readAsync(url).then(
			(arrayBuffer) => {
				onload(new Uint8Array(arrayBuffer));
				if (dep) removeRunDependency(dep);
			},
			(err) => {
				if (onerror) {
					onerror();
				} else {
					throw `Loading data file "${url}" failed.`;
				}
			}
		);
		if (dep) addRunDependency(dep);
	};
	var FS_createDataFile = (
		parent,
		name,
		fileData,
		canRead,
		canWrite,
		canOwn
	) => {
		FS.createDataFile(parent, name, fileData, canRead, canWrite, canOwn);
	};
	var preloadPlugins = Module['preloadPlugins'] || [];
	var FS_handledByPreloadPlugin = (byteArray, fullname, finish, onerror) => {
		if (typeof Browser != 'undefined') Browser.init();
		var handled = false;
		preloadPlugins.forEach((plugin) => {
			if (handled) return;
			if (plugin['canHandle'](fullname)) {
				plugin['handle'](byteArray, fullname, finish, onerror);
				handled = true;
			}
		});
		return handled;
	};
	var FS_createPreloadedFile = (
		parent,
		name,
		url,
		canRead,
		canWrite,
		onload,
		onerror,
		dontCreateFile,
		canOwn,
		preFinish
	) => {
		var fullname = name
			? PATH_FS.resolve(PATH.join2(parent, name))
			: parent;
		var dep = getUniqueRunDependency(`cp ${fullname}`);
		function processData(byteArray) {
			function finish(byteArray) {
				preFinish?.();
				if (!dontCreateFile) {
					FS_createDataFile(
						parent,
						name,
						byteArray,
						canRead,
						canWrite,
						canOwn
					);
				}
				onload?.();
				removeRunDependency(dep);
			}
			if (
				FS_handledByPreloadPlugin(byteArray, fullname, finish, () => {
					onerror?.();
					removeRunDependency(dep);
				})
			) {
				return;
			}
			finish(byteArray);
		}
		addRunDependency(dep);
		if (typeof url == 'string') {
			asyncLoad(url, processData, onerror);
		} else {
			processData(url);
		}
	};
	var FS_modeStringToFlags = (str) => {
		var flagModes = {
			r: 0,
			'r+': 2,
			w: 512 | 64 | 1,
			'w+': 512 | 64 | 2,
			a: 1024 | 64 | 1,
			'a+': 1024 | 64 | 2,
		};
		var flags = flagModes[str];
		if (typeof flags == 'undefined') {
			throw new Error(`Unknown file open mode: ${str}`);
		}
		return flags;
	};
	var FS_getMode = (canRead, canWrite) => {
		var mode = 0;
		if (canRead) mode |= 292 | 73;
		if (canWrite) mode |= 146;
		return mode;
	};
	var FS = {
		root: null,
		mounts: [],
		devices: {},
		streams: [],
		nextInode: 1,
		nameTable: null,
		currentPath: '/',
		initialized: false,
		ignorePermissions: true,
		ErrnoError: class {
			constructor(errno) {
				this.name = 'ErrnoError';
				this.errno = errno;
			}
		},
		genericErrors: {},
		filesystems: null,
		syncFSRequests: 0,
		FSStream: class {
			constructor() {
				this.shared = {};
			}
			get object() {
				return this.node;
			}
			set object(val) {
				this.node = val;
			}
			get isRead() {
				return (this.flags & 2097155) !== 1;
			}
			get isWrite() {
				return (this.flags & 2097155) !== 0;
			}
			get isAppend() {
				return this.flags & 1024;
			}
			get flags() {
				return this.shared.flags;
			}
			set flags(val) {
				this.shared.flags = val;
			}
			get position() {
				return this.shared.position;
			}
			set position(val) {
				this.shared.position = val;
			}
		},
		FSNode: class {
			constructor(parent, name, mode, rdev) {
				if (!parent) {
					parent = this;
				}
				this.parent = parent;
				this.mount = parent.mount;
				this.mounted = null;
				this.id = FS.nextInode++;
				this.name = name;
				this.mode = mode;
				this.node_ops = {};
				this.stream_ops = {};
				this.rdev = rdev;
				this.readMode = 292 | 73;
				this.writeMode = 146;
			}
			get read() {
				return (this.mode & this.readMode) === this.readMode;
			}
			set read(val) {
				val
					? (this.mode |= this.readMode)
					: (this.mode &= ~this.readMode);
			}
			get write() {
				return (this.mode & this.writeMode) === this.writeMode;
			}
			set write(val) {
				val
					? (this.mode |= this.writeMode)
					: (this.mode &= ~this.writeMode);
			}
			get isFolder() {
				return FS.isDir(this.mode);
			}
			get isDevice() {
				return FS.isChrdev(this.mode);
			}
		},
		lookupPath(path, opts = {}) {
			path = PATH_FS.resolve(path);
			if (!path) return { path: '', node: null };
			var defaults = { follow_mount: true, recurse_count: 0 };
			opts = Object.assign(defaults, opts);
			if (opts.recurse_count > 8) {
				throw new FS.ErrnoError(32);
			}
			var parts = path.split('/').filter((p) => !!p);
			var current = FS.root;
			var current_path = '/';
			for (var i = 0; i < parts.length; i++) {
				var islast = i === parts.length - 1;
				if (islast && opts.parent) {
					break;
				}
				current = FS.lookupNode(current, parts[i]);
				current_path = PATH.join2(current_path, parts[i]);
				if (FS.isMountpoint(current)) {
					if (!islast || (islast && opts.follow_mount)) {
						current = current.mounted.root;
					}
				}
				if (!islast || opts.follow) {
					var count = 0;
					while (FS.isLink(current.mode)) {
						var link = FS.readlink(current_path);
						current_path = PATH_FS.resolve(
							PATH.dirname(current_path),
							link
						);
						var lookup = FS.lookupPath(current_path, {
							recurse_count: opts.recurse_count + 1,
						});
						current = lookup.node;
						if (count++ > 40) {
							throw new FS.ErrnoError(32);
						}
					}
				}
			}
			return { path: current_path, node: current };
		},
		getPath(node) {
			var path;
			while (true) {
				if (FS.isRoot(node)) {
					var mount = node.mount.mountpoint;
					if (!path) return mount;
					return mount[mount.length - 1] !== '/'
						? `${mount}/${path}`
						: mount + path;
				}
				path = path ? `${node.name}/${path}` : node.name;
				node = node.parent;
			}
		},
		hashName(parentid, name) {
			var hash = 0;
			for (var i = 0; i < name.length; i++) {
				hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
			}
			return ((parentid + hash) >>> 0) % FS.nameTable.length;
		},
		hashAddNode(node) {
			var hash = FS.hashName(node.parent.id, node.name);
			node.name_next = FS.nameTable[hash];
			FS.nameTable[hash] = node;
		},
		hashRemoveNode(node) {
			var hash = FS.hashName(node.parent.id, node.name);
			if (FS.nameTable[hash] === node) {
				FS.nameTable[hash] = node.name_next;
			} else {
				var current = FS.nameTable[hash];
				while (current) {
					if (current.name_next === node) {
						current.name_next = node.name_next;
						break;
					}
					current = current.name_next;
				}
			}
		},
		lookupNode(parent, name) {
			var errCode = FS.mayLookup(parent);
			if (errCode) {
				throw new FS.ErrnoError(errCode);
			}
			var hash = FS.hashName(parent.id, name);
			for (var node = FS.nameTable[hash]; node; node = node.name_next) {
				var nodeName = node.name;
				if (node.parent.id === parent.id && nodeName === name) {
					return node;
				}
			}
			return FS.lookup(parent, name);
		},
		createNode(parent, name, mode, rdev) {
			var node = new FS.FSNode(parent, name, mode, rdev);
			FS.hashAddNode(node);
			return node;
		},
		destroyNode(node) {
			FS.hashRemoveNode(node);
		},
		isRoot(node) {
			return node === node.parent;
		},
		isMountpoint(node) {
			return !!node.mounted;
		},
		isFile(mode) {
			return (mode & 61440) === 32768;
		},
		isDir(mode) {
			return (mode & 61440) === 16384;
		},
		isLink(mode) {
			return (mode & 61440) === 40960;
		},
		isChrdev(mode) {
			return (mode & 61440) === 8192;
		},
		isBlkdev(mode) {
			return (mode & 61440) === 24576;
		},
		isFIFO(mode) {
			return (mode & 61440) === 4096;
		},
		isSocket(mode) {
			return (mode & 49152) === 49152;
		},
		flagsToPermissionString(flag) {
			var perms = ['r', 'w', 'rw'][flag & 3];
			if (flag & 512) {
				perms += 'w';
			}
			return perms;
		},
		nodePermissions(node, perms) {
			if (FS.ignorePermissions) {
				return 0;
			}
			if (perms.includes('r') && !(node.mode & 292)) {
				return 2;
			} else if (perms.includes('w') && !(node.mode & 146)) {
				return 2;
			} else if (perms.includes('x') && !(node.mode & 73)) {
				return 2;
			}
			return 0;
		},
		mayLookup(dir) {
			if (!FS.isDir(dir.mode)) return 54;
			var errCode = FS.nodePermissions(dir, 'x');
			if (errCode) return errCode;
			if (!dir.node_ops.lookup) return 2;
			return 0;
		},
		mayCreate(dir, name) {
			try {
				var node = FS.lookupNode(dir, name);
				return 20;
			} catch (e) {}
			return FS.nodePermissions(dir, 'wx');
		},
		mayDelete(dir, name, isdir) {
			var node;
			try {
				node = FS.lookupNode(dir, name);
			} catch (e) {
				return e.errno;
			}
			var errCode = FS.nodePermissions(dir, 'wx');
			if (errCode) {
				return errCode;
			}
			if (isdir) {
				if (!FS.isDir(node.mode)) {
					return 54;
				}
				if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
					return 10;
				}
			} else {
				if (FS.isDir(node.mode)) {
					return 31;
				}
			}
			return 0;
		},
		mayOpen(node, flags) {
			if (!node) {
				return 44;
			}
			if (FS.isLink(node.mode)) {
				return 32;
			} else if (FS.isDir(node.mode)) {
				if (FS.flagsToPermissionString(flags) !== 'r' || flags & 512) {
					return 31;
				}
			}
			return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
		},
		MAX_OPEN_FDS: 4096,
		nextfd() {
			for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
				if (!FS.streams[fd]) {
					return fd;
				}
			}
			throw new FS.ErrnoError(33);
		},
		getStreamChecked(fd) {
			var stream = FS.getStream(fd);
			if (!stream) {
				throw new FS.ErrnoError(8);
			}
			return stream;
		},
		getStream: (fd) => FS.streams[fd],
		createStream(stream, fd = -1) {
			stream = Object.assign(new FS.FSStream(), stream);
			if (fd == -1) {
				fd = FS.nextfd();
			}
			stream.fd = fd;
			FS.streams[fd] = stream;
			return stream;
		},
		closeStream(fd) {
			FS.streams[fd] = null;
		},
		dupStream(origStream, fd = -1) {
			var stream = FS.createStream(origStream, fd);
			stream.stream_ops?.dup?.(stream);
			return stream;
		},
		chrdev_stream_ops: {
			open(stream) {
				var device = FS.getDevice(stream.node.rdev);
				stream.stream_ops = device.stream_ops;
				stream.stream_ops.open?.(stream);
			},
			llseek() {
				throw new FS.ErrnoError(70);
			},
		},
		major: (dev) => dev >> 8,
		minor: (dev) => dev & 255,
		makedev: (ma, mi) => (ma << 8) | mi,
		registerDevice(dev, ops) {
			FS.devices[dev] = { stream_ops: ops };
		},
		getDevice: (dev) => FS.devices[dev],
		getMounts(mount) {
			var mounts = [];
			var check = [mount];
			while (check.length) {
				var m = check.pop();
				mounts.push(m);
				check.push(...m.mounts);
			}
			return mounts;
		},
		syncfs(populate, callback) {
			if (typeof populate == 'function') {
				callback = populate;
				populate = false;
			}
			FS.syncFSRequests++;
			if (FS.syncFSRequests > 1) {
				err(
					`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`
				);
			}
			var mounts = FS.getMounts(FS.root.mount);
			var completed = 0;
			function doCallback(errCode) {
				FS.syncFSRequests--;
				return callback(errCode);
			}
			function done(errCode) {
				if (errCode) {
					if (!done.errored) {
						done.errored = true;
						return doCallback(errCode);
					}
					return;
				}
				if (++completed >= mounts.length) {
					doCallback(null);
				}
			}
			mounts.forEach((mount) => {
				if (!mount.type.syncfs) {
					return done(null);
				}
				mount.type.syncfs(mount, populate, done);
			});
		},
		mount(type, opts, mountpoint) {
			var root = mountpoint === '/';
			var pseudo = !mountpoint;
			var node;
			if (root && FS.root) {
				throw new FS.ErrnoError(10);
			} else if (!root && !pseudo) {
				var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
				mountpoint = lookup.path;
				node = lookup.node;
				if (FS.isMountpoint(node)) {
					throw new FS.ErrnoError(10);
				}
				if (!FS.isDir(node.mode)) {
					throw new FS.ErrnoError(54);
				}
			}
			var mount = {
				type: type,
				opts: opts,
				mountpoint: mountpoint,
				mounts: [],
			};
			var mountRoot = type.mount(mount);
			mountRoot.mount = mount;
			mount.root = mountRoot;
			if (root) {
				FS.root = mountRoot;
			} else if (node) {
				node.mounted = mount;
				if (node.mount) {
					node.mount.mounts.push(mount);
				}
			}
			return mountRoot;
		},
		unmount(mountpoint) {
			var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
			if (!FS.isMountpoint(lookup.node)) {
				throw new FS.ErrnoError(28);
			}
			var node = lookup.node;
			var mount = node.mounted;
			var mounts = FS.getMounts(mount);
			Object.keys(FS.nameTable).forEach((hash) => {
				var current = FS.nameTable[hash];
				while (current) {
					var next = current.name_next;
					if (mounts.includes(current.mount)) {
						FS.destroyNode(current);
					}
					current = next;
				}
			});
			node.mounted = null;
			var idx = node.mount.mounts.indexOf(mount);
			node.mount.mounts.splice(idx, 1);
		},
		lookup(parent, name) {
			return parent.node_ops.lookup(parent, name);
		},
		mknod(path, mode, dev) {
			var lookup = FS.lookupPath(path, { parent: true });
			var parent = lookup.node;
			var name = PATH.basename(path);
			if (!name || name === '.' || name === '..') {
				throw new FS.ErrnoError(28);
			}
			var errCode = FS.mayCreate(parent, name);
			if (errCode) {
				throw new FS.ErrnoError(errCode);
			}
			if (!parent.node_ops.mknod) {
				throw new FS.ErrnoError(63);
			}
			return parent.node_ops.mknod(parent, name, mode, dev);
		},
		create(path, mode) {
			mode = mode !== undefined ? mode : 438;
			mode &= 4095;
			mode |= 32768;
			return FS.mknod(path, mode, 0);
		},
		mkdir(path, mode) {
			mode = mode !== undefined ? mode : 511;
			mode &= 511 | 512;
			mode |= 16384;
			return FS.mknod(path, mode, 0);
		},
		mkdirTree(path, mode) {
			var dirs = path.split('/');
			var d = '';
			for (var i = 0; i < dirs.length; ++i) {
				if (!dirs[i]) continue;
				d += '/' + dirs[i];
				try {
					FS.mkdir(d, mode);
				} catch (e) {
					if (e.errno != 20) throw e;
				}
			}
		},
		mkdev(path, mode, dev) {
			if (typeof dev == 'undefined') {
				dev = mode;
				mode = 438;
			}
			mode |= 8192;
			return FS.mknod(path, mode, dev);
		},
		symlink(oldpath, newpath) {
			if (!PATH_FS.resolve(oldpath)) {
				throw new FS.ErrnoError(44);
			}
			var lookup = FS.lookupPath(newpath, { parent: true });
			var parent = lookup.node;
			if (!parent) {
				throw new FS.ErrnoError(44);
			}
			var newname = PATH.basename(newpath);
			var errCode = FS.mayCreate(parent, newname);
			if (errCode) {
				throw new FS.ErrnoError(errCode);
			}
			if (!parent.node_ops.symlink) {
				throw new FS.ErrnoError(63);
			}
			return parent.node_ops.symlink(parent, newname, oldpath);
		},
		rename(old_path, new_path) {
			var old_dirname = PATH.dirname(old_path);
			var new_dirname = PATH.dirname(new_path);
			var old_name = PATH.basename(old_path);
			var new_name = PATH.basename(new_path);
			var lookup, old_dir, new_dir;
			lookup = FS.lookupPath(old_path, { parent: true });
			old_dir = lookup.node;
			lookup = FS.lookupPath(new_path, { parent: true });
			new_dir = lookup.node;
			if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
			if (old_dir.mount !== new_dir.mount) {
				throw new FS.ErrnoError(75);
			}
			var old_node = FS.lookupNode(old_dir, old_name);
			var relative = PATH_FS.relative(old_path, new_dirname);
			if (relative.charAt(0) !== '.') {
				throw new FS.ErrnoError(28);
			}
			relative = PATH_FS.relative(new_path, old_dirname);
			if (relative.charAt(0) !== '.') {
				throw new FS.ErrnoError(55);
			}
			var new_node;
			try {
				new_node = FS.lookupNode(new_dir, new_name);
			} catch (e) {}
			if (old_node === new_node) {
				return;
			}
			var isdir = FS.isDir(old_node.mode);
			var errCode = FS.mayDelete(old_dir, old_name, isdir);
			if (errCode) {
				throw new FS.ErrnoError(errCode);
			}
			errCode = new_node
				? FS.mayDelete(new_dir, new_name, isdir)
				: FS.mayCreate(new_dir, new_name);
			if (errCode) {
				throw new FS.ErrnoError(errCode);
			}
			if (!old_dir.node_ops.rename) {
				throw new FS.ErrnoError(63);
			}
			if (
				FS.isMountpoint(old_node) ||
				(new_node && FS.isMountpoint(new_node))
			) {
				throw new FS.ErrnoError(10);
			}
			if (new_dir !== old_dir) {
				errCode = FS.nodePermissions(old_dir, 'w');
				if (errCode) {
					throw new FS.ErrnoError(errCode);
				}
			}
			FS.hashRemoveNode(old_node);
			try {
				old_dir.node_ops.rename(old_node, new_dir, new_name);
				old_node.parent = new_dir;
			} catch (e) {
				throw e;
			} finally {
				FS.hashAddNode(old_node);
			}
		},
		rmdir(path) {
			var lookup = FS.lookupPath(path, { parent: true });
			var parent = lookup.node;
			var name = PATH.basename(path);
			var node = FS.lookupNode(parent, name);
			var errCode = FS.mayDelete(parent, name, true);
			if (errCode) {
				throw new FS.ErrnoError(errCode);
			}
			if (!parent.node_ops.rmdir) {
				throw new FS.ErrnoError(63);
			}
			if (FS.isMountpoint(node)) {
				throw new FS.ErrnoError(10);
			}
			parent.node_ops.rmdir(parent, name);
			FS.destroyNode(node);
		},
		readdir(path) {
			var lookup = FS.lookupPath(path, { follow: true });
			var node = lookup.node;
			if (!node.node_ops.readdir) {
				throw new FS.ErrnoError(54);
			}
			return node.node_ops.readdir(node);
		},
		unlink(path) {
			var lookup = FS.lookupPath(path, { parent: true });
			var parent = lookup.node;
			if (!parent) {
				throw new FS.ErrnoError(44);
			}
			var name = PATH.basename(path);
			var node = FS.lookupNode(parent, name);
			var errCode = FS.mayDelete(parent, name, false);
			if (errCode) {
				throw new FS.ErrnoError(errCode);
			}
			if (!parent.node_ops.unlink) {
				throw new FS.ErrnoError(63);
			}
			if (FS.isMountpoint(node)) {
				throw new FS.ErrnoError(10);
			}
			parent.node_ops.unlink(parent, name);
			FS.destroyNode(node);
		},
		readlink(path) {
			var lookup = FS.lookupPath(path);
			var link = lookup.node;
			if (!link) {
				throw new FS.ErrnoError(44);
			}
			if (!link.node_ops.readlink) {
				throw new FS.ErrnoError(28);
			}
			return PATH_FS.resolve(
				FS.getPath(link.parent),
				link.node_ops.readlink(link)
			);
		},
		stat(path, dontFollow) {
			var lookup = FS.lookupPath(path, { follow: !dontFollow });
			var node = lookup.node;
			if (!node) {
				throw new FS.ErrnoError(44);
			}
			if (!node.node_ops.getattr) {
				throw new FS.ErrnoError(63);
			}
			return node.node_ops.getattr(node);
		},
		lstat(path) {
			return FS.stat(path, true);
		},
		chmod(path, mode, dontFollow) {
			var node;
			if (typeof path == 'string') {
				var lookup = FS.lookupPath(path, { follow: !dontFollow });
				node = lookup.node;
			} else {
				node = path;
			}
			if (!node.node_ops.setattr) {
				throw new FS.ErrnoError(63);
			}
			node.node_ops.setattr(node, {
				mode: (mode & 4095) | (node.mode & ~4095),
				timestamp: Date.now(),
			});
		},
		lchmod(path, mode) {
			FS.chmod(path, mode, true);
		},
		fchmod(fd, mode) {
			var stream = FS.getStreamChecked(fd);
			FS.chmod(stream.node, mode);
		},
		chown(path, uid, gid, dontFollow) {
			var node;
			if (typeof path == 'string') {
				var lookup = FS.lookupPath(path, { follow: !dontFollow });
				node = lookup.node;
			} else {
				node = path;
			}
			if (!node.node_ops.setattr) {
				throw new FS.ErrnoError(63);
			}
			node.node_ops.setattr(node, { timestamp: Date.now() });
		},
		lchown(path, uid, gid) {
			FS.chown(path, uid, gid, true);
		},
		fchown(fd, uid, gid) {
			var stream = FS.getStreamChecked(fd);
			FS.chown(stream.node, uid, gid);
		},
		truncate(path, len) {
			if (len < 0) {
				throw new FS.ErrnoError(28);
			}
			var node;
			if (typeof path == 'string') {
				var lookup = FS.lookupPath(path, { follow: true });
				node = lookup.node;
			} else {
				node = path;
			}
			if (!node.node_ops.setattr) {
				throw new FS.ErrnoError(63);
			}
			if (FS.isDir(node.mode)) {
				throw new FS.ErrnoError(31);
			}
			if (!FS.isFile(node.mode)) {
				throw new FS.ErrnoError(28);
			}
			var errCode = FS.nodePermissions(node, 'w');
			if (errCode) {
				throw new FS.ErrnoError(errCode);
			}
			node.node_ops.setattr(node, { size: len, timestamp: Date.now() });
		},
		ftruncate(fd, len) {
			var stream = FS.getStreamChecked(fd);
			if ((stream.flags & 2097155) === 0) {
				throw new FS.ErrnoError(28);
			}
			FS.truncate(stream.node, len);
		},
		utime(path, atime, mtime) {
			var lookup = FS.lookupPath(path, { follow: true });
			var node = lookup.node;
			node.node_ops.setattr(node, { timestamp: Math.max(atime, mtime) });
		},
		open(path, flags, mode) {
			if (path === '') {
				throw new FS.ErrnoError(44);
			}
			flags =
				typeof flags == 'string' ? FS_modeStringToFlags(flags) : flags;
			if (flags & 64) {
				mode = typeof mode == 'undefined' ? 438 : mode;
				mode = (mode & 4095) | 32768;
			} else {
				mode = 0;
			}
			var node;
			if (typeof path == 'object') {
				node = path;
			} else {
				path = PATH.normalize(path);
				try {
					var lookup = FS.lookupPath(path, {
						follow: !(flags & 131072),
					});
					node = lookup.node;
				} catch (e) {}
			}
			var created = false;
			if (flags & 64) {
				if (node) {
					if (flags & 128) {
						throw new FS.ErrnoError(20);
					}
				} else {
					node = FS.mknod(path, mode, 0);
					created = true;
				}
			}
			if (!node) {
				throw new FS.ErrnoError(44);
			}
			if (FS.isChrdev(node.mode)) {
				flags &= ~512;
			}
			if (flags & 65536 && !FS.isDir(node.mode)) {
				throw new FS.ErrnoError(54);
			}
			if (!created) {
				var errCode = FS.mayOpen(node, flags);
				if (errCode) {
					throw new FS.ErrnoError(errCode);
				}
			}
			if (flags & 512 && !created) {
				FS.truncate(node, 0);
			}
			flags &= ~(128 | 512 | 131072);
			var stream = FS.createStream({
				node: node,
				path: FS.getPath(node),
				flags: flags,
				seekable: true,
				position: 0,
				stream_ops: node.stream_ops,
				ungotten: [],
				error: false,
			});
			if (stream.stream_ops.open) {
				stream.stream_ops.open(stream);
			}
			if (Module['logReadFiles'] && !(flags & 1)) {
				if (!FS.readFiles) FS.readFiles = {};
				if (!(path in FS.readFiles)) {
					FS.readFiles[path] = 1;
				}
			}
			return stream;
		},
		close(stream) {
			if (FS.isClosed(stream)) {
				throw new FS.ErrnoError(8);
			}
			if (stream.getdents) stream.getdents = null;
			try {
				if (stream.stream_ops.close) {
					stream.stream_ops.close(stream);
				}
			} catch (e) {
				throw e;
			} finally {
				FS.closeStream(stream.fd);
			}
			stream.fd = null;
		},
		isClosed(stream) {
			return stream.fd === null;
		},
		llseek(stream, offset, whence) {
			if (FS.isClosed(stream)) {
				throw new FS.ErrnoError(8);
			}
			if (!stream.seekable || !stream.stream_ops.llseek) {
				throw new FS.ErrnoError(70);
			}
			if (whence != 0 && whence != 1 && whence != 2) {
				throw new FS.ErrnoError(28);
			}
			stream.position = stream.stream_ops.llseek(stream, offset, whence);
			stream.ungotten = [];
			return stream.position;
		},
		read(stream, buffer, offset, length, position) {
			if (length < 0 || position < 0) {
				throw new FS.ErrnoError(28);
			}
			if (FS.isClosed(stream)) {
				throw new FS.ErrnoError(8);
			}
			if ((stream.flags & 2097155) === 1) {
				throw new FS.ErrnoError(8);
			}
			if (FS.isDir(stream.node.mode)) {
				throw new FS.ErrnoError(31);
			}
			if (!stream.stream_ops.read) {
				throw new FS.ErrnoError(28);
			}
			var seeking = typeof position != 'undefined';
			if (!seeking) {
				position = stream.position;
			} else if (!stream.seekable) {
				throw new FS.ErrnoError(70);
			}
			var bytesRead = stream.stream_ops.read(
				stream,
				buffer,
				offset,
				length,
				position
			);
			if (!seeking) stream.position += bytesRead;
			return bytesRead;
		},
		write(stream, buffer, offset, length, position, canOwn) {
			if (length < 0 || position < 0) {
				throw new FS.ErrnoError(28);
			}
			if (FS.isClosed(stream)) {
				throw new FS.ErrnoError(8);
			}
			if ((stream.flags & 2097155) === 0) {
				throw new FS.ErrnoError(8);
			}
			if (FS.isDir(stream.node.mode)) {
				throw new FS.ErrnoError(31);
			}
			if (!stream.stream_ops.write) {
				throw new FS.ErrnoError(28);
			}
			if (stream.seekable && stream.flags & 1024) {
				FS.llseek(stream, 0, 2);
			}
			var seeking = typeof position != 'undefined';
			if (!seeking) {
				position = stream.position;
			} else if (!stream.seekable) {
				throw new FS.ErrnoError(70);
			}
			var bytesWritten = stream.stream_ops.write(
				stream,
				buffer,
				offset,
				length,
				position,
				canOwn
			);
			if (!seeking) stream.position += bytesWritten;
			return bytesWritten;
		},
		allocate(stream, offset, length) {
			if (FS.isClosed(stream)) {
				throw new FS.ErrnoError(8);
			}
			if (offset < 0 || length <= 0) {
				throw new FS.ErrnoError(28);
			}
			if ((stream.flags & 2097155) === 0) {
				throw new FS.ErrnoError(8);
			}
			if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
				throw new FS.ErrnoError(43);
			}
			if (!stream.stream_ops.allocate) {
				throw new FS.ErrnoError(138);
			}
			stream.stream_ops.allocate(stream, offset, length);
		},
		mmap(stream, length, position, prot, flags) {
			if (
				(prot & 2) !== 0 &&
				(flags & 2) === 0 &&
				(stream.flags & 2097155) !== 2
			) {
				throw new FS.ErrnoError(2);
			}
			if ((stream.flags & 2097155) === 1) {
				throw new FS.ErrnoError(2);
			}
			if (!stream.stream_ops.mmap) {
				throw new FS.ErrnoError(43);
			}
			return stream.stream_ops.mmap(
				stream,
				length,
				position,
				prot,
				flags
			);
		},
		msync(stream, buffer, offset, length, mmapFlags) {
			if (!stream.stream_ops.msync) {
				return 0;
			}
			return stream.stream_ops.msync(
				stream,
				buffer,
				offset,
				length,
				mmapFlags
			);
		},
		ioctl(stream, cmd, arg) {
			if (!stream.stream_ops.ioctl) {
				throw new FS.ErrnoError(59);
			}
			return stream.stream_ops.ioctl(stream, cmd, arg);
		},
		readFile(path, opts = {}) {
			opts.flags = opts.flags || 0;
			opts.encoding = opts.encoding || 'binary';
			if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
				throw new Error(`Invalid encoding type "${opts.encoding}"`);
			}
			var ret;
			var stream = FS.open(path, opts.flags);
			var stat = FS.stat(path);
			var length = stat.size;
			var buf = new Uint8Array(length);
			FS.read(stream, buf, 0, length, 0);
			if (opts.encoding === 'utf8') {
				ret = UTF8ArrayToString(buf, 0);
			} else if (opts.encoding === 'binary') {
				ret = buf;
			}
			FS.close(stream);
			return ret;
		},
		writeFile(path, data, opts = {}) {
			opts.flags = opts.flags || 577;
			var stream = FS.open(path, opts.flags, opts.mode);
			if (typeof data == 'string') {
				var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
				var actualNumBytes = stringToUTF8Array(
					data,
					buf,
					0,
					buf.length
				);
				FS.write(
					stream,
					buf,
					0,
					actualNumBytes,
					undefined,
					opts.canOwn
				);
			} else if (ArrayBuffer.isView(data)) {
				FS.write(
					stream,
					data,
					0,
					data.byteLength,
					undefined,
					opts.canOwn
				);
			} else {
				throw new Error('Unsupported data type');
			}
			FS.close(stream);
		},
		cwd: () => FS.currentPath,
		chdir(path) {
			var lookup = FS.lookupPath(path, { follow: true });
			if (lookup.node === null) {
				throw new FS.ErrnoError(44);
			}
			if (!FS.isDir(lookup.node.mode)) {
				throw new FS.ErrnoError(54);
			}
			var errCode = FS.nodePermissions(lookup.node, 'x');
			if (errCode) {
				throw new FS.ErrnoError(errCode);
			}
			FS.currentPath = lookup.path;
		},
		createDefaultDirectories() {
			FS.mkdir('/tmp');
			FS.mkdir('/home');
			FS.mkdir('/home/web_user');
		},
		createDefaultDevices() {
			FS.mkdir('/dev');
			FS.registerDevice(FS.makedev(1, 3), {
				read: () => 0,
				write: (stream, buffer, offset, length, pos) => length,
			});
			FS.mkdev('/dev/null', FS.makedev(1, 3));
			TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
			TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
			FS.mkdev('/dev/tty', FS.makedev(5, 0));
			FS.mkdev('/dev/tty1', FS.makedev(6, 0));
			var randomBuffer = new Uint8Array(1024),
				randomLeft = 0;
			var randomByte = () => {
				if (randomLeft === 0) {
					randomLeft = randomFill(randomBuffer).byteLength;
				}
				return randomBuffer[--randomLeft];
			};
			FS.createDevice('/dev', 'random', randomByte);
			FS.createDevice('/dev', 'urandom', randomByte);
			FS.mkdir('/dev/shm');
			FS.mkdir('/dev/shm/tmp');
		},
		createSpecialDirectories() {
			FS.mkdir('/proc');
			var proc_self = FS.mkdir('/proc/self');
			FS.mkdir('/proc/self/fd');
			FS.mount(
				{
					mount() {
						var node = FS.createNode(
							proc_self,
							'fd',
							16384 | 511,
							73
						);
						node.node_ops = {
							lookup(parent, name) {
								var fd = +name;
								var stream = FS.getStreamChecked(fd);
								var ret = {
									parent: null,
									mount: { mountpoint: 'fake' },
									node_ops: { readlink: () => stream.path },
								};
								ret.parent = ret;
								return ret;
							},
						};
						return node;
					},
				},
				{},
				'/proc/self/fd'
			);
		},
		createStandardStreams() {
			if (Module['stdin']) {
				FS.createDevice('/dev', 'stdin', Module['stdin']);
			} else {
				FS.symlink('/dev/tty', '/dev/stdin');
			}
			if (Module['stdout']) {
				FS.createDevice('/dev', 'stdout', null, Module['stdout']);
			} else {
				FS.symlink('/dev/tty', '/dev/stdout');
			}
			if (Module['stderr']) {
				FS.createDevice('/dev', 'stderr', null, Module['stderr']);
			} else {
				FS.symlink('/dev/tty1', '/dev/stderr');
			}
			var stdin = FS.open('/dev/stdin', 0);
			var stdout = FS.open('/dev/stdout', 1);
			var stderr = FS.open('/dev/stderr', 1);
		},
		staticInit() {
			[44].forEach((code) => {
				FS.genericErrors[code] = new FS.ErrnoError(code);
				FS.genericErrors[code].stack = '<generic error, no stack>';
			});
			FS.nameTable = new Array(4096);
			FS.mount(MEMFS, {}, '/');
			FS.createDefaultDirectories();
			FS.createDefaultDevices();
			FS.createSpecialDirectories();
			FS.filesystems = { MEMFS: MEMFS };
		},
		init(input, output, error) {
			FS.init.initialized = true;
			Module['stdin'] = input || Module['stdin'];
			Module['stdout'] = output || Module['stdout'];
			Module['stderr'] = error || Module['stderr'];
			FS.createStandardStreams();
		},
		quit() {
			FS.init.initialized = false;
			_fflush(0);
			for (var i = 0; i < FS.streams.length; i++) {
				var stream = FS.streams[i];
				if (!stream) {
					continue;
				}
				FS.close(stream);
			}
		},
		findObject(path, dontResolveLastLink) {
			var ret = FS.analyzePath(path, dontResolveLastLink);
			if (!ret.exists) {
				return null;
			}
			return ret.object;
		},
		analyzePath(path, dontResolveLastLink) {
			try {
				var lookup = FS.lookupPath(path, {
					follow: !dontResolveLastLink,
				});
				path = lookup.path;
			} catch (e) {}
			var ret = {
				isRoot: false,
				exists: false,
				error: 0,
				name: null,
				path: null,
				object: null,
				parentExists: false,
				parentPath: null,
				parentObject: null,
			};
			try {
				var lookup = FS.lookupPath(path, { parent: true });
				ret.parentExists = true;
				ret.parentPath = lookup.path;
				ret.parentObject = lookup.node;
				ret.name = PATH.basename(path);
				lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
				ret.exists = true;
				ret.path = lookup.path;
				ret.object = lookup.node;
				ret.name = lookup.node.name;
				ret.isRoot = lookup.path === '/';
			} catch (e) {
				ret.error = e.errno;
			}
			return ret;
		},
		createPath(parent, path, canRead, canWrite) {
			parent = typeof parent == 'string' ? parent : FS.getPath(parent);
			var parts = path.split('/').reverse();
			while (parts.length) {
				var part = parts.pop();
				if (!part) continue;
				var current = PATH.join2(parent, part);
				try {
					FS.mkdir(current);
				} catch (e) {}
				parent = current;
			}
			return current;
		},
		createFile(parent, name, properties, canRead, canWrite) {
			var path = PATH.join2(
				typeof parent == 'string' ? parent : FS.getPath(parent),
				name
			);
			var mode = FS_getMode(canRead, canWrite);
			return FS.create(path, mode);
		},
		createDataFile(parent, name, data, canRead, canWrite, canOwn) {
			var path = name;
			if (parent) {
				parent =
					typeof parent == 'string' ? parent : FS.getPath(parent);
				path = name ? PATH.join2(parent, name) : parent;
			}
			var mode = FS_getMode(canRead, canWrite);
			var node = FS.create(path, mode);
			if (data) {
				if (typeof data == 'string') {
					var arr = new Array(data.length);
					for (var i = 0, len = data.length; i < len; ++i)
						arr[i] = data.charCodeAt(i);
					data = arr;
				}
				FS.chmod(node, mode | 146);
				var stream = FS.open(node, 577);
				FS.write(stream, data, 0, data.length, 0, canOwn);
				FS.close(stream);
				FS.chmod(node, mode);
			}
		},
		createDevice(parent, name, input, output) {
			var path = PATH.join2(
				typeof parent == 'string' ? parent : FS.getPath(parent),
				name
			);
			var mode = FS_getMode(!!input, !!output);
			if (!FS.createDevice.major) FS.createDevice.major = 64;
			var dev = FS.makedev(FS.createDevice.major++, 0);
			FS.registerDevice(dev, {
				open(stream) {
					stream.seekable = false;
				},
				close(stream) {
					if (output?.buffer?.length) {
						output(10);
					}
				},
				read(stream, buffer, offset, length, pos) {
					var bytesRead = 0;
					for (var i = 0; i < length; i++) {
						var result;
						try {
							result = input();
						} catch (e) {
							throw new FS.ErrnoError(29);
						}
						if (result === undefined && bytesRead === 0) {
							throw new FS.ErrnoError(6);
						}
						if (result === null || result === undefined) break;
						bytesRead++;
						buffer[offset + i] = result;
					}
					if (bytesRead) {
						stream.node.timestamp = Date.now();
					}
					return bytesRead;
				},
				write(stream, buffer, offset, length, pos) {
					for (var i = 0; i < length; i++) {
						try {
							output(buffer[offset + i]);
						} catch (e) {
							throw new FS.ErrnoError(29);
						}
					}
					if (length) {
						stream.node.timestamp = Date.now();
					}
					return i;
				},
			});
			return FS.mkdev(path, mode, dev);
		},
		forceLoadFile(obj) {
			if (obj.isDevice || obj.isFolder || obj.link || obj.contents)
				return true;
			if (typeof XMLHttpRequest != 'undefined') {
				throw new Error(
					'Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.'
				);
			} else {
				try {
					obj.contents = readBinary(obj.url);
					obj.usedBytes = obj.contents.length;
				} catch (e) {
					throw new FS.ErrnoError(29);
				}
			}
		},
		createLazyFile(parent, name, url, canRead, canWrite) {
			class LazyUint8Array {
				constructor() {
					this.lengthKnown = false;
					this.chunks = [];
				}
				get(idx) {
					if (idx > this.length - 1 || idx < 0) {
						return undefined;
					}
					var chunkOffset = idx % this.chunkSize;
					var chunkNum = (idx / this.chunkSize) | 0;
					return this.getter(chunkNum)[chunkOffset];
				}
				setDataGetter(getter) {
					this.getter = getter;
				}
				cacheLength() {
					var xhr = new XMLHttpRequest();
					xhr.open('HEAD', url, false);
					xhr.send(null);
					if (
						!(
							(xhr.status >= 200 && xhr.status < 300) ||
							xhr.status === 304
						)
					)
						throw new Error(
							"Couldn't load " + url + '. Status: ' + xhr.status
						);
					var datalength = Number(
						xhr.getResponseHeader('Content-length')
					);
					var header;
					var hasByteServing =
						(header = xhr.getResponseHeader('Accept-Ranges')) &&
						header === 'bytes';
					var usesGzip =
						(header = xhr.getResponseHeader('Content-Encoding')) &&
						header === 'gzip';
					var chunkSize = 1024 * 1024;
					if (!hasByteServing) chunkSize = datalength;
					var doXHR = (from, to) => {
						if (from > to)
							throw new Error(
								'invalid range (' +
									from +
									', ' +
									to +
									') or no bytes requested!'
							);
						if (to > datalength - 1)
							throw new Error(
								'only ' +
									datalength +
									' bytes available! programmer error!'
							);
						var xhr = new XMLHttpRequest();
						xhr.open('GET', url, false);
						if (datalength !== chunkSize)
							xhr.setRequestHeader(
								'Range',
								'bytes=' + from + '-' + to
							);
						xhr.responseType = 'arraybuffer';
						if (xhr.overrideMimeType) {
							xhr.overrideMimeType(
								'text/plain; charset=x-user-defined'
							);
						}
						xhr.send(null);
						if (
							!(
								(xhr.status >= 200 && xhr.status < 300) ||
								xhr.status === 304
							)
						)
							throw new Error(
								"Couldn't load " +
									url +
									'. Status: ' +
									xhr.status
							);
						if (xhr.response !== undefined) {
							return new Uint8Array(xhr.response || []);
						}
						return intArrayFromString(xhr.responseText || '', true);
					};
					var lazyArray = this;
					lazyArray.setDataGetter((chunkNum) => {
						var start = chunkNum * chunkSize;
						var end = (chunkNum + 1) * chunkSize - 1;
						end = Math.min(end, datalength - 1);
						if (typeof lazyArray.chunks[chunkNum] == 'undefined') {
							lazyArray.chunks[chunkNum] = doXHR(start, end);
						}
						if (typeof lazyArray.chunks[chunkNum] == 'undefined')
							throw new Error('doXHR failed!');
						return lazyArray.chunks[chunkNum];
					});
					if (usesGzip || !datalength) {
						chunkSize = datalength = 1;
						datalength = this.getter(0).length;
						chunkSize = datalength;
						out(
							'LazyFiles on gzip forces download of the whole file when length is accessed'
						);
					}
					this._length = datalength;
					this._chunkSize = chunkSize;
					this.lengthKnown = true;
				}
				get length() {
					if (!this.lengthKnown) {
						this.cacheLength();
					}
					return this._length;
				}
				get chunkSize() {
					if (!this.lengthKnown) {
						this.cacheLength();
					}
					return this._chunkSize;
				}
			}
			if (typeof XMLHttpRequest != 'undefined') {
				if (!ENVIRONMENT_IS_WORKER)
					throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
				var lazyArray = new LazyUint8Array();
				var properties = { isDevice: false, contents: lazyArray };
			} else {
				var properties = { isDevice: false, url: url };
			}
			var node = FS.createFile(
				parent,
				name,
				properties,
				canRead,
				canWrite
			);
			if (properties.contents) {
				node.contents = properties.contents;
			} else if (properties.url) {
				node.contents = null;
				node.url = properties.url;
			}
			Object.defineProperties(node, {
				usedBytes: {
					get: function () {
						return this.contents.length;
					},
				},
			});
			var stream_ops = {};
			var keys = Object.keys(node.stream_ops);
			keys.forEach((key) => {
				var fn = node.stream_ops[key];
				stream_ops[key] = (...args) => {
					FS.forceLoadFile(node);
					return fn(...args);
				};
			});
			function writeChunks(stream, buffer, offset, length, position) {
				var contents = stream.node.contents;
				if (position >= contents.length) return 0;
				var size = Math.min(contents.length - position, length);
				if (contents.slice) {
					for (var i = 0; i < size; i++) {
						buffer[offset + i] = contents[position + i];
					}
				} else {
					for (var i = 0; i < size; i++) {
						buffer[offset + i] = contents.get(position + i);
					}
				}
				return size;
			}
			stream_ops.read = (stream, buffer, offset, length, position) => {
				FS.forceLoadFile(node);
				return writeChunks(stream, buffer, offset, length, position);
			};
			stream_ops.mmap = (stream, length, position, prot, flags) => {
				FS.forceLoadFile(node);
				var ptr = mmapAlloc(length);
				if (!ptr) {
					throw new FS.ErrnoError(48);
				}
				writeChunks(stream, HEAP8, ptr, length, position);
				return { ptr: ptr, allocated: true };
			};
			node.stream_ops = stream_ops;
			return node;
		},
	};
	var SYSCALLS = {
		DEFAULT_POLLMASK: 5,
		calculateAt(dirfd, path, allowEmpty) {
			if (PATH.isAbs(path)) {
				return path;
			}
			var dir;
			if (dirfd === -100) {
				dir = FS.cwd();
			} else {
				var dirstream = SYSCALLS.getStreamFromFD(dirfd);
				dir = dirstream.path;
			}
			if (path.length == 0) {
				if (!allowEmpty) {
					throw new FS.ErrnoError(44);
				}
				return dir;
			}
			return PATH.join2(dir, path);
		},
		doStat(func, path, buf) {
			var stat = func(path);
			HEAP32[buf >> 2] = stat.dev;
			HEAP32[(buf + 4) >> 2] = stat.mode;
			HEAPU32[(buf + 8) >> 2] = stat.nlink;
			HEAP32[(buf + 12) >> 2] = stat.uid;
			HEAP32[(buf + 16) >> 2] = stat.gid;
			HEAP32[(buf + 20) >> 2] = stat.rdev;
			(tempI64 = [
				stat.size >>> 0,
				((tempDouble = stat.size),
				+Math.abs(tempDouble) >= 1
					? tempDouble > 0
						? +Math.floor(tempDouble / 4294967296) >>> 0
						: ~~+Math.ceil(
								(tempDouble - +(~~tempDouble >>> 0)) /
									4294967296
						  ) >>> 0
					: 0),
			]),
				(HEAP32[(buf + 24) >> 2] = tempI64[0]),
				(HEAP32[(buf + 28) >> 2] = tempI64[1]);
			HEAP32[(buf + 32) >> 2] = 4096;
			HEAP32[(buf + 36) >> 2] = stat.blocks;
			var atime = stat.atime.getTime();
			var mtime = stat.mtime.getTime();
			var ctime = stat.ctime.getTime();
			(tempI64 = [
				Math.floor(atime / 1e3) >>> 0,
				((tempDouble = Math.floor(atime / 1e3)),
				+Math.abs(tempDouble) >= 1
					? tempDouble > 0
						? +Math.floor(tempDouble / 4294967296) >>> 0
						: ~~+Math.ceil(
								(tempDouble - +(~~tempDouble >>> 0)) /
									4294967296
						  ) >>> 0
					: 0),
			]),
				(HEAP32[(buf + 40) >> 2] = tempI64[0]),
				(HEAP32[(buf + 44) >> 2] = tempI64[1]);
			HEAPU32[(buf + 48) >> 2] = (atime % 1e3) * 1e3;
			(tempI64 = [
				Math.floor(mtime / 1e3) >>> 0,
				((tempDouble = Math.floor(mtime / 1e3)),
				+Math.abs(tempDouble) >= 1
					? tempDouble > 0
						? +Math.floor(tempDouble / 4294967296) >>> 0
						: ~~+Math.ceil(
								(tempDouble - +(~~tempDouble >>> 0)) /
									4294967296
						  ) >>> 0
					: 0),
			]),
				(HEAP32[(buf + 56) >> 2] = tempI64[0]),
				(HEAP32[(buf + 60) >> 2] = tempI64[1]);
			HEAPU32[(buf + 64) >> 2] = (mtime % 1e3) * 1e3;
			(tempI64 = [
				Math.floor(ctime / 1e3) >>> 0,
				((tempDouble = Math.floor(ctime / 1e3)),
				+Math.abs(tempDouble) >= 1
					? tempDouble > 0
						? +Math.floor(tempDouble / 4294967296) >>> 0
						: ~~+Math.ceil(
								(tempDouble - +(~~tempDouble >>> 0)) /
									4294967296
						  ) >>> 0
					: 0),
			]),
				(HEAP32[(buf + 72) >> 2] = tempI64[0]),
				(HEAP32[(buf + 76) >> 2] = tempI64[1]);
			HEAPU32[(buf + 80) >> 2] = (ctime % 1e3) * 1e3;
			(tempI64 = [
				stat.ino >>> 0,
				((tempDouble = stat.ino),
				+Math.abs(tempDouble) >= 1
					? tempDouble > 0
						? +Math.floor(tempDouble / 4294967296) >>> 0
						: ~~+Math.ceil(
								(tempDouble - +(~~tempDouble >>> 0)) /
									4294967296
						  ) >>> 0
					: 0),
			]),
				(HEAP32[(buf + 88) >> 2] = tempI64[0]),
				(HEAP32[(buf + 92) >> 2] = tempI64[1]);
			return 0;
		},
		doMsync(addr, stream, len, flags, offset) {
			if (!FS.isFile(stream.node.mode)) {
				throw new FS.ErrnoError(43);
			}
			if (flags & 2) {
				return 0;
			}
			var buffer = HEAPU8.slice(addr, addr + len);
			FS.msync(stream, buffer, offset, len, flags);
		},
		getStreamFromFD(fd) {
			var stream = FS.getStreamChecked(fd);
			return stream;
		},
		varargs: undefined,
		getStr(ptr) {
			var ret = UTF8ToString(ptr);
			return ret;
		},
	};
	function ___syscall__newselect(
		nfds,
		readfds,
		writefds,
		exceptfds,
		timeout
	) {
		try {
			var total = 0;
			var srcReadLow = readfds ? HEAP32[readfds >> 2] : 0,
				srcReadHigh = readfds ? HEAP32[(readfds + 4) >> 2] : 0;
			var srcWriteLow = writefds ? HEAP32[writefds >> 2] : 0,
				srcWriteHigh = writefds ? HEAP32[(writefds + 4) >> 2] : 0;
			var srcExceptLow = exceptfds ? HEAP32[exceptfds >> 2] : 0,
				srcExceptHigh = exceptfds ? HEAP32[(exceptfds + 4) >> 2] : 0;
			var dstReadLow = 0,
				dstReadHigh = 0;
			var dstWriteLow = 0,
				dstWriteHigh = 0;
			var dstExceptLow = 0,
				dstExceptHigh = 0;
			var allLow =
				(readfds ? HEAP32[readfds >> 2] : 0) |
				(writefds ? HEAP32[writefds >> 2] : 0) |
				(exceptfds ? HEAP32[exceptfds >> 2] : 0);
			var allHigh =
				(readfds ? HEAP32[(readfds + 4) >> 2] : 0) |
				(writefds ? HEAP32[(writefds + 4) >> 2] : 0) |
				(exceptfds ? HEAP32[(exceptfds + 4) >> 2] : 0);
			var check = function (fd, low, high, val) {
				return fd < 32 ? low & val : high & val;
			};
			for (var fd = 0; fd < nfds; fd++) {
				var mask = 1 << fd % 32;
				if (!check(fd, allLow, allHigh, mask)) {
					continue;
				}
				var stream = SYSCALLS.getStreamFromFD(fd);
				var flags = SYSCALLS.DEFAULT_POLLMASK;
				if (stream.stream_ops?.poll) {
					var timeoutInMillis = -1;
					if (timeout) {
						var tv_sec = readfds ? HEAP32[timeout >> 2] : 0,
							tv_usec = readfds ? HEAP32[(timeout + 4) >> 2] : 0;
						timeoutInMillis = (tv_sec + tv_usec / 1e6) * 1e3;
					}
					flags = stream.stream_ops.poll(stream, timeoutInMillis);
				}
				if (flags & 1 && check(fd, srcReadLow, srcReadHigh, mask)) {
					fd < 32
						? (dstReadLow = dstReadLow | mask)
						: (dstReadHigh = dstReadHigh | mask);
					total++;
				}
				if (flags & 4 && check(fd, srcWriteLow, srcWriteHigh, mask)) {
					fd < 32
						? (dstWriteLow = dstWriteLow | mask)
						: (dstWriteHigh = dstWriteHigh | mask);
					total++;
				}
				if (flags & 2 && check(fd, srcExceptLow, srcExceptHigh, mask)) {
					fd < 32
						? (dstExceptLow = dstExceptLow | mask)
						: (dstExceptHigh = dstExceptHigh | mask);
					total++;
				}
			}
			if (readfds) {
				HEAP32[readfds >> 2] = dstReadLow;
				HEAP32[(readfds + 4) >> 2] = dstReadHigh;
			}
			if (writefds) {
				HEAP32[writefds >> 2] = dstWriteLow;
				HEAP32[(writefds + 4) >> 2] = dstWriteHigh;
			}
			if (exceptfds) {
				HEAP32[exceptfds >> 2] = dstExceptLow;
				HEAP32[(exceptfds + 4) >> 2] = dstExceptHigh;
			}
			return total;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	var SOCKFS = {
		mount(mount) {
			Module['websocket'] =
				Module['websocket'] && 'object' === typeof Module['websocket']
					? Module['websocket']
					: {};
			Module['websocket']._callbacks = {};
			Module['websocket']['on'] = function (event, callback) {
				if ('function' === typeof callback) {
					this._callbacks[event] = callback;
				}
				return this;
			};
			Module['websocket'].emit = function (event, param) {
				if ('function' === typeof this._callbacks[event]) {
					this._callbacks[event].call(this, param);
				}
			};
			return FS.createNode(null, '/', 16384 | 511, 0);
		},
		createSocket(family, type, protocol) {
			type &= ~526336;
			var streaming = type == 1;
			if (streaming && protocol && protocol != 6) {
				throw new FS.ErrnoError(66);
			}
			var sock = {
				family: family,
				type: type,
				protocol: protocol,
				server: null,
				error: null,
				peers: {},
				pending: [],
				recv_queue: [],
				sock_ops: SOCKFS.websocket_sock_ops,
			};
			var name = SOCKFS.nextname();
			var node = FS.createNode(SOCKFS.root, name, 49152, 0);
			node.sock = sock;
			var stream = FS.createStream({
				path: name,
				node: node,
				flags: 2,
				seekable: false,
				stream_ops: SOCKFS.stream_ops,
			});
			sock.stream = stream;
			return sock;
		},
		getSocket(fd) {
			var stream = FS.getStream(fd);
			if (!stream || !FS.isSocket(stream.node.mode)) {
				return null;
			}
			return stream.node.sock;
		},
		stream_ops: {
			poll(stream) {
				var sock = stream.node.sock;
				return sock.sock_ops.poll(sock);
			},
			ioctl(stream, request, varargs) {
				var sock = stream.node.sock;
				return sock.sock_ops.ioctl(sock, request, varargs);
			},
			read(stream, buffer, offset, length, position) {
				var sock = stream.node.sock;
				var msg = sock.sock_ops.recvmsg(sock, length);
				if (!msg) {
					return 0;
				}
				buffer.set(msg.buffer, offset);
				return msg.buffer.length;
			},
			write(stream, buffer, offset, length, position) {
				var sock = stream.node.sock;
				return sock.sock_ops.sendmsg(sock, buffer, offset, length);
			},
			close(stream) {
				var sock = stream.node.sock;
				sock.sock_ops.close(sock);
			},
		},
		nextname() {
			if (!SOCKFS.nextname.current) {
				SOCKFS.nextname.current = 0;
			}
			return 'socket[' + SOCKFS.nextname.current++ + ']';
		},
		websocket_sock_ops: {
			createPeer(sock, addr, port) {
				var ws;
				if (typeof addr == 'object') {
					ws = addr;
					addr = null;
					port = null;
				}
				if (ws) {
					if (ws._socket) {
						addr = ws._socket.remoteAddress;
						port = ws._socket.remotePort;
					} else {
						var result = /ws[s]?:\/\/([^:]+):(\d+)/.exec(ws.url);
						if (!result) {
							throw new Error(
								'WebSocket URL must be in the format ws(s)://address:port'
							);
						}
						addr = result[1];
						port = parseInt(result[2], 10);
					}
				} else {
					try {
						var runtimeConfig =
							Module['websocket'] &&
							'object' === typeof Module['websocket'];
						var url = 'ws:#'.replace('#', '//');
						if (runtimeConfig) {
							if (
								'function' === typeof Module['websocket']['url']
							) {
								url = Module['websocket']['url'](...arguments);
							} else if (
								'string' === typeof Module['websocket']['url']
							) {
								url = Module['websocket']['url'];
							}
						}
						if (url === 'ws://' || url === 'wss://') {
							var parts = addr.split('/');
							url =
								url +
								parts[0] +
								':' +
								port +
								'/' +
								parts.slice(1).join('/');
						}
						var subProtocols = 'binary';
						if (runtimeConfig) {
							if (
								'string' ===
								typeof Module['websocket']['subprotocol']
							) {
								subProtocols =
									Module['websocket']['subprotocol'];
							}
						}
						var opts = undefined;
						if (subProtocols !== 'null') {
							subProtocols = subProtocols
								.replace(/^ +| +$/g, '')
								.split(/ *, */);
							opts = subProtocols;
						}
						if (
							runtimeConfig &&
							null === Module['websocket']['subprotocol']
						) {
							subProtocols = 'null';
							opts = undefined;
						}
						var WebSocketConstructor;
						{
							WebSocketConstructor = WebSocket;
						}
						if (Module['websocket']['decorator']) {
							WebSocketConstructor =
								Module['websocket']['decorator'](
									WebSocketConstructor
								);
						}
						ws = new WebSocketConstructor(url, opts);
						ws.binaryType = 'arraybuffer';
					} catch (e) {
						throw new FS.ErrnoError(23);
					}
				}
				var peer = {
					addr: addr,
					port: port,
					socket: ws,
					dgram_send_queue: [],
				};
				SOCKFS.websocket_sock_ops.addPeer(sock, peer);
				SOCKFS.websocket_sock_ops.handlePeerEvents(sock, peer);
				if (sock.type === 2 && typeof sock.sport != 'undefined') {
					peer.dgram_send_queue.push(
						new Uint8Array([
							255,
							255,
							255,
							255,
							'p'.charCodeAt(0),
							'o'.charCodeAt(0),
							'r'.charCodeAt(0),
							't'.charCodeAt(0),
							(sock.sport & 65280) >> 8,
							sock.sport & 255,
						])
					);
				}
				return peer;
			},
			getPeer(sock, addr, port) {
				return sock.peers[addr + ':' + port];
			},
			addPeer(sock, peer) {
				sock.peers[peer.addr + ':' + peer.port] = peer;
			},
			removePeer(sock, peer) {
				delete sock.peers[peer.addr + ':' + peer.port];
			},
			handlePeerEvents(sock, peer) {
				var first = true;
				var handleOpen = function () {
					Module['websocket'].emit('open', sock.stream.fd);
					try {
						var queued = peer.dgram_send_queue.shift();
						while (queued) {
							peer.socket.send(queued);
							queued = peer.dgram_send_queue.shift();
						}
					} catch (e) {
						peer.socket.close();
					}
				};
				function handleMessage(data) {
					if (typeof data == 'string') {
						var encoder = new TextEncoder();
						data = encoder.encode(data);
					} else {
						assert(data.byteLength !== undefined);
						if (data.byteLength == 0) {
							return;
						}
						data = new Uint8Array(data);
					}
					var wasfirst = first;
					first = false;
					if (
						wasfirst &&
						data.length === 10 &&
						data[0] === 255 &&
						data[1] === 255 &&
						data[2] === 255 &&
						data[3] === 255 &&
						data[4] === 'p'.charCodeAt(0) &&
						data[5] === 'o'.charCodeAt(0) &&
						data[6] === 'r'.charCodeAt(0) &&
						data[7] === 't'.charCodeAt(0)
					) {
						var newport = (data[8] << 8) | data[9];
						SOCKFS.websocket_sock_ops.removePeer(sock, peer);
						peer.port = newport;
						SOCKFS.websocket_sock_ops.addPeer(sock, peer);
						return;
					}
					sock.recv_queue.push({
						addr: peer.addr,
						port: peer.port,
						data: data,
					});
					Module['websocket'].emit('message', sock.stream.fd);
				}
				if (ENVIRONMENT_IS_NODE) {
					peer.socket.on('open', handleOpen);
					peer.socket.on('message', function (data, isBinary) {
						if (!isBinary) {
							return;
						}
						handleMessage(new Uint8Array(data).buffer);
					});
					peer.socket.on('close', function () {
						Module['websocket'].emit('close', sock.stream.fd);
					});
					peer.socket.on('error', function (error) {
						sock.error = 14;
						Module['websocket'].emit('error', [
							sock.stream.fd,
							sock.error,
							'ECONNREFUSED: Connection refused',
						]);
					});
				} else {
					peer.socket.onopen = handleOpen;
					peer.socket.onclose = function () {
						Module['websocket'].emit('close', sock.stream.fd);
					};
					peer.socket.onmessage = function peer_socket_onmessage(
						event
					) {
						handleMessage(event.data);
					};
					peer.socket.onerror = function (error) {
						sock.error = 14;
						Module['websocket'].emit('error', [
							sock.stream.fd,
							sock.error,
							'ECONNREFUSED: Connection refused',
						]);
					};
				}
			},
			poll(sock) {
				if (sock.type === 1 && sock.server) {
					return sock.pending.length ? 64 | 1 : 0;
				}
				var mask = 0;
				var dest =
					sock.type === 1
						? SOCKFS.websocket_sock_ops.getPeer(
								sock,
								sock.daddr,
								sock.dport
						  )
						: null;
				if (
					sock.recv_queue.length ||
					!dest ||
					(dest && dest.socket.readyState === dest.socket.CLOSING) ||
					(dest && dest.socket.readyState === dest.socket.CLOSED)
				) {
					mask |= 64 | 1;
				}
				if (
					!dest ||
					(dest && dest.socket.readyState === dest.socket.OPEN)
				) {
					mask |= 4;
				}
				if (
					(dest && dest.socket.readyState === dest.socket.CLOSING) ||
					(dest && dest.socket.readyState === dest.socket.CLOSED)
				) {
					mask |= 16;
				}
				return mask;
			},
			ioctl(sock, request, arg) {
				switch (request) {
					case 21531:
						var bytes = 0;
						if (sock.recv_queue.length) {
							bytes = sock.recv_queue[0].data.length;
						}
						HEAP32[arg >> 2] = bytes;
						return 0;
					default:
						return 28;
				}
			},
			close(sock) {
				if (sock.server) {
					try {
						sock.server.close();
					} catch (e) {}
					sock.server = null;
				}
				var peers = Object.keys(sock.peers);
				for (var i = 0; i < peers.length; i++) {
					var peer = sock.peers[peers[i]];
					try {
						peer.socket.close();
					} catch (e) {}
					SOCKFS.websocket_sock_ops.removePeer(sock, peer);
				}
				return 0;
			},
			bind(sock, addr, port) {
				if (
					typeof sock.saddr != 'undefined' ||
					typeof sock.sport != 'undefined'
				) {
					throw new FS.ErrnoError(28);
				}
				sock.saddr = addr;
				sock.sport = port;
				if (sock.type === 2) {
					if (sock.server) {
						sock.server.close();
						sock.server = null;
					}
					try {
						sock.sock_ops.listen(sock, 0);
					} catch (e) {
						if (!(e.name === 'ErrnoError')) throw e;
						if (e.errno !== 138) throw e;
					}
				}
			},
			connect(sock, addr, port) {
				if (sock.server) {
					throw new FS.ErrnoError(138);
				}
				if (
					typeof sock.daddr != 'undefined' &&
					typeof sock.dport != 'undefined'
				) {
					var dest = SOCKFS.websocket_sock_ops.getPeer(
						sock,
						sock.daddr,
						sock.dport
					);
					if (dest) {
						if (dest.socket.readyState === dest.socket.CONNECTING) {
							throw new FS.ErrnoError(7);
						} else {
							throw new FS.ErrnoError(30);
						}
					}
				}
				var peer = SOCKFS.websocket_sock_ops.createPeer(
					sock,
					addr,
					port
				);
				sock.daddr = peer.addr;
				sock.dport = peer.port;
				throw new FS.ErrnoError(26);
			},
			listen(sock, backlog) {
				if (!ENVIRONMENT_IS_NODE) {
					throw new FS.ErrnoError(138);
				}
			},
			accept(listensock) {
				if (!listensock.server || !listensock.pending.length) {
					throw new FS.ErrnoError(28);
				}
				var newsock = listensock.pending.shift();
				newsock.stream.flags = listensock.stream.flags;
				return newsock;
			},
			getname(sock, peer) {
				var addr, port;
				if (peer) {
					if (sock.daddr === undefined || sock.dport === undefined) {
						throw new FS.ErrnoError(53);
					}
					addr = sock.daddr;
					port = sock.dport;
				} else {
					addr = sock.saddr || 0;
					port = sock.sport || 0;
				}
				return { addr: addr, port: port };
			},
			sendmsg(sock, buffer, offset, length, addr, port) {
				if (sock.type === 2) {
					if (addr === undefined || port === undefined) {
						addr = sock.daddr;
						port = sock.dport;
					}
					if (addr === undefined || port === undefined) {
						throw new FS.ErrnoError(17);
					}
				} else {
					addr = sock.daddr;
					port = sock.dport;
				}
				var dest = SOCKFS.websocket_sock_ops.getPeer(sock, addr, port);
				if (sock.type === 1) {
					if (
						!dest ||
						dest.socket.readyState === dest.socket.CLOSING ||
						dest.socket.readyState === dest.socket.CLOSED
					) {
						throw new FS.ErrnoError(53);
					} else if (
						dest.socket.readyState === dest.socket.CONNECTING
					) {
						throw new FS.ErrnoError(6);
					}
				}
				if (ArrayBuffer.isView(buffer)) {
					offset += buffer.byteOffset;
					buffer = buffer.buffer;
				}
				var data;
				data = buffer.slice(offset, offset + length);
				if (sock.type === 2) {
					if (!dest || dest.socket.readyState !== dest.socket.OPEN) {
						if (
							!dest ||
							dest.socket.readyState === dest.socket.CLOSING ||
							dest.socket.readyState === dest.socket.CLOSED
						) {
							dest = SOCKFS.websocket_sock_ops.createPeer(
								sock,
								addr,
								port
							);
						}
						dest.dgram_send_queue.push(data);
						return length;
					}
				}
				try {
					dest.socket.send(data);
					return length;
				} catch (e) {
					throw new FS.ErrnoError(28);
				}
			},
			recvmsg(sock, length) {
				if (sock.type === 1 && sock.server) {
					throw new FS.ErrnoError(53);
				}
				var queued = sock.recv_queue.shift();
				if (!queued) {
					if (sock.type === 1) {
						var dest = SOCKFS.websocket_sock_ops.getPeer(
							sock,
							sock.daddr,
							sock.dport
						);
						if (!dest) {
							throw new FS.ErrnoError(53);
						}
						if (
							dest.socket.readyState === dest.socket.CLOSING ||
							dest.socket.readyState === dest.socket.CLOSED
						) {
							return null;
						}
						throw new FS.ErrnoError(6);
					}
					throw new FS.ErrnoError(6);
				}
				var queuedLength = queued.data.byteLength || queued.data.length;
				var queuedOffset = queued.data.byteOffset || 0;
				var queuedBuffer = queued.data.buffer || queued.data;
				var bytesRead = Math.min(length, queuedLength);
				var res = {
					buffer: new Uint8Array(
						queuedBuffer,
						queuedOffset,
						bytesRead
					),
					addr: queued.addr,
					port: queued.port,
				};
				if (sock.type === 1 && bytesRead < queuedLength) {
					var bytesRemaining = queuedLength - bytesRead;
					queued.data = new Uint8Array(
						queuedBuffer,
						queuedOffset + bytesRead,
						bytesRemaining
					);
					sock.recv_queue.unshift(queued);
				}
				return res;
			},
		},
	};
	var getSocketFromFD = (fd) => {
		var socket = SOCKFS.getSocket(fd);
		if (!socket) throw new FS.ErrnoError(8);
		return socket;
	};
	var inetPton4 = (str) => {
		var b = str.split('.');
		for (var i = 0; i < 4; i++) {
			var tmp = Number(b[i]);
			if (isNaN(tmp)) return null;
			b[i] = tmp;
		}
		return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
	};
	var jstoi_q = (str) => parseInt(str);
	var inetPton6 = (str) => {
		var words;
		var w, offset, z;
		var valid6regx =
			/^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i;
		var parts = [];
		if (!valid6regx.test(str)) {
			return null;
		}
		if (str === '::') {
			return [0, 0, 0, 0, 0, 0, 0, 0];
		}
		if (str.startsWith('::')) {
			str = str.replace('::', 'Z:');
		} else {
			str = str.replace('::', ':Z:');
		}
		if (str.indexOf('.') > 0) {
			str = str.replace(new RegExp('[.]', 'g'), ':');
			words = str.split(':');
			words[words.length - 4] =
				jstoi_q(words[words.length - 4]) +
				jstoi_q(words[words.length - 3]) * 256;
			words[words.length - 3] =
				jstoi_q(words[words.length - 2]) +
				jstoi_q(words[words.length - 1]) * 256;
			words = words.slice(0, words.length - 2);
		} else {
			words = str.split(':');
		}
		offset = 0;
		z = 0;
		for (w = 0; w < words.length; w++) {
			if (typeof words[w] == 'string') {
				if (words[w] === 'Z') {
					for (z = 0; z < 8 - words.length + 1; z++) {
						parts[w + z] = 0;
					}
					offset = z - 1;
				} else {
					parts[w + offset] = _htons(parseInt(words[w], 16));
				}
			} else {
				parts[w + offset] = words[w];
			}
		}
		return [
			(parts[1] << 16) | parts[0],
			(parts[3] << 16) | parts[2],
			(parts[5] << 16) | parts[4],
			(parts[7] << 16) | parts[6],
		];
	};
	var writeSockaddr = (sa, family, addr, port, addrlen) => {
		switch (family) {
			case 2:
				addr = inetPton4(addr);
				zeroMemory(sa, 16);
				if (addrlen) {
					HEAP32[addrlen >> 2] = 16;
				}
				HEAP16[sa >> 1] = family;
				HEAP32[(sa + 4) >> 2] = addr;
				HEAP16[(sa + 2) >> 1] = _htons(port);
				break;
			case 10:
				addr = inetPton6(addr);
				zeroMemory(sa, 28);
				if (addrlen) {
					HEAP32[addrlen >> 2] = 28;
				}
				HEAP32[sa >> 2] = family;
				HEAP32[(sa + 8) >> 2] = addr[0];
				HEAP32[(sa + 12) >> 2] = addr[1];
				HEAP32[(sa + 16) >> 2] = addr[2];
				HEAP32[(sa + 20) >> 2] = addr[3];
				HEAP16[(sa + 2) >> 1] = _htons(port);
				break;
			default:
				return 5;
		}
		return 0;
	};
	var DNS = {
		address_map: { id: 1, addrs: {}, names: {} },
		lookup_name(name) {
			var res = inetPton4(name);
			if (res !== null) {
				return name;
			}
			res = inetPton6(name);
			if (res !== null) {
				return name;
			}
			var addr;
			if (DNS.address_map.addrs[name]) {
				addr = DNS.address_map.addrs[name];
			} else {
				var id = DNS.address_map.id++;
				assert(id < 65535, 'exceeded max address mappings of 65535');
				addr = '172.29.' + (id & 255) + '.' + (id & 65280);
				DNS.address_map.names[addr] = name;
				DNS.address_map.addrs[name] = addr;
			}
			return addr;
		},
		lookup_addr(addr) {
			if (DNS.address_map.names[addr]) {
				return DNS.address_map.names[addr];
			}
			return null;
		},
	};
	function ___syscall_accept4(fd, addr, addrlen, flags, d1, d2) {
		try {
			var sock = getSocketFromFD(fd);
			var newsock = sock.sock_ops.accept(sock);
			if (addr) {
				var errno = writeSockaddr(
					addr,
					newsock.family,
					DNS.lookup_name(newsock.daddr),
					newsock.dport,
					addrlen
				);
			}
			return newsock.stream.fd;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	var inetNtop4 = (addr) =>
		(addr & 255) +
		'.' +
		((addr >> 8) & 255) +
		'.' +
		((addr >> 16) & 255) +
		'.' +
		((addr >> 24) & 255);
	var inetNtop6 = (ints) => {
		var str = '';
		var word = 0;
		var longest = 0;
		var lastzero = 0;
		var zstart = 0;
		var len = 0;
		var i = 0;
		var parts = [
			ints[0] & 65535,
			ints[0] >> 16,
			ints[1] & 65535,
			ints[1] >> 16,
			ints[2] & 65535,
			ints[2] >> 16,
			ints[3] & 65535,
			ints[3] >> 16,
		];
		var hasipv4 = true;
		var v4part = '';
		for (i = 0; i < 5; i++) {
			if (parts[i] !== 0) {
				hasipv4 = false;
				break;
			}
		}
		if (hasipv4) {
			v4part = inetNtop4(parts[6] | (parts[7] << 16));
			if (parts[5] === -1) {
				str = '::ffff:';
				str += v4part;
				return str;
			}
			if (parts[5] === 0) {
				str = '::';
				if (v4part === '0.0.0.0') v4part = '';
				if (v4part === '0.0.0.1') v4part = '1';
				str += v4part;
				return str;
			}
		}
		for (word = 0; word < 8; word++) {
			if (parts[word] === 0) {
				if (word - lastzero > 1) {
					len = 0;
				}
				lastzero = word;
				len++;
			}
			if (len > longest) {
				longest = len;
				zstart = word - longest + 1;
			}
		}
		for (word = 0; word < 8; word++) {
			if (longest > 1) {
				if (
					parts[word] === 0 &&
					word >= zstart &&
					word < zstart + longest
				) {
					if (word === zstart) {
						str += ':';
						if (zstart === 0) str += ':';
					}
					continue;
				}
			}
			str += Number(_ntohs(parts[word] & 65535)).toString(16);
			str += word < 7 ? ':' : '';
		}
		return str;
	};
	var readSockaddr = (sa, salen) => {
		var family = HEAP16[sa >> 1];
		var port = _ntohs(HEAPU16[(sa + 2) >> 1]);
		var addr;
		switch (family) {
			case 2:
				if (salen !== 16) {
					return { errno: 28 };
				}
				addr = HEAP32[(sa + 4) >> 2];
				addr = inetNtop4(addr);
				break;
			case 10:
				if (salen !== 28) {
					return { errno: 28 };
				}
				addr = [
					HEAP32[(sa + 8) >> 2],
					HEAP32[(sa + 12) >> 2],
					HEAP32[(sa + 16) >> 2],
					HEAP32[(sa + 20) >> 2],
				];
				addr = inetNtop6(addr);
				break;
			default:
				return { errno: 5 };
		}
		return { family: family, addr: addr, port: port };
	};
	var getSocketAddress = (addrp, addrlen, allowNull) => {
		if (allowNull && addrp === 0) return null;
		var info = readSockaddr(addrp, addrlen);
		if (info.errno) throw new FS.ErrnoError(info.errno);
		info.addr = DNS.lookup_addr(info.addr) || info.addr;
		return info;
	};
	function ___syscall_bind(fd, addr, addrlen, d1, d2, d3) {
		try {
			var sock = getSocketFromFD(fd);
			var info = getSocketAddress(addr, addrlen);
			sock.sock_ops.bind(sock, info.addr, info.port);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_chdir(path) {
		try {
			path = SYSCALLS.getStr(path);
			FS.chdir(path);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_chmod(path, mode) {
		try {
			path = SYSCALLS.getStr(path);
			FS.chmod(path, mode);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_connect(fd, addr, addrlen, d1, d2, d3) {
		try {
			var sock = getSocketFromFD(fd);
			var info = getSocketAddress(addr, addrlen);
			sock.sock_ops.connect(sock, info.addr, info.port);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_dup(fd) {
		try {
			var old = SYSCALLS.getStreamFromFD(fd);
			return FS.dupStream(old).fd;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_dup3(fd, newfd, flags) {
		try {
			var old = SYSCALLS.getStreamFromFD(fd);
			if (old.fd === newfd) return -28;
			if (newfd < 0 || newfd >= FS.MAX_OPEN_FDS) return -8;
			var existing = FS.getStream(newfd);
			if (existing) FS.close(existing);
			return FS.dupStream(old, newfd).fd;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_faccessat(dirfd, path, amode, flags) {
		try {
			path = SYSCALLS.getStr(path);
			path = SYSCALLS.calculateAt(dirfd, path);
			if (amode & ~7) {
				return -28;
			}
			var lookup = FS.lookupPath(path, { follow: true });
			var node = lookup.node;
			if (!node) {
				return -44;
			}
			var perms = '';
			if (amode & 4) perms += 'r';
			if (amode & 2) perms += 'w';
			if (amode & 1) perms += 'x';
			if (perms && FS.nodePermissions(node, perms)) {
				return -2;
			}
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_fchownat(dirfd, path, owner, group, flags) {
		try {
			path = SYSCALLS.getStr(path);
			var nofollow = flags & 256;
			flags = flags & ~256;
			path = SYSCALLS.calculateAt(dirfd, path);
			(nofollow ? FS.lchown : FS.chown)(path, owner, group);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function syscallGetVarargI() {
		var ret = HEAP32[+SYSCALLS.varargs >> 2];
		SYSCALLS.varargs += 4;
		return ret;
	}
	var syscallGetVarargP = syscallGetVarargI;
	function ___syscall_fcntl64(fd, cmd, varargs) {
		SYSCALLS.varargs = varargs;
		try {
			var stream = SYSCALLS.getStreamFromFD(fd);
			switch (cmd) {
				case 0: {
					var arg = syscallGetVarargI();
					if (arg < 0) {
						return -28;
					}
					while (FS.streams[arg]) {
						arg++;
					}
					var newStream;
					newStream = FS.dupStream(stream, arg);
					return newStream.fd;
				}
				case 1:
				case 2:
					return 0;
				case 3:
					return stream.flags;
				case 4: {
					var arg = syscallGetVarargI();
					stream.flags |= arg;
					return 0;
				}
				case 12: {
					var arg = syscallGetVarargP();
					var offset = 0;
					HEAP16[(arg + offset) >> 1] = 2;
					return 0;
				}
				case 13:
				case 14:
					return 0;
			}
			return -28;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_fdatasync(fd) {
		try {
			var stream = SYSCALLS.getStreamFromFD(fd);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_fstat64(fd, buf) {
		try {
			var stream = SYSCALLS.getStreamFromFD(fd);
			return SYSCALLS.doStat(FS.stat, stream.path, buf);
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	var convertI32PairToI53Checked = (lo, hi) =>
		(hi + 2097152) >>> 0 < 4194305 - !!lo
			? (lo >>> 0) + hi * 4294967296
			: NaN;
	function ___syscall_ftruncate64(fd, length_low, length_high) {
		var length = convertI32PairToI53Checked(length_low, length_high);
		try {
			if (isNaN(length)) return 61;
			FS.ftruncate(fd, length);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	var stringToUTF8 = (str, outPtr, maxBytesToWrite) =>
		stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
	function ___syscall_getcwd(buf, size) {
		try {
			if (size === 0) return -28;
			var cwd = FS.cwd();
			var cwdLengthInBytes = lengthBytesUTF8(cwd) + 1;
			if (size < cwdLengthInBytes) return -68;
			stringToUTF8(cwd, buf, size);
			return cwdLengthInBytes;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_getdents64(fd, dirp, count) {
		try {
			var stream = SYSCALLS.getStreamFromFD(fd);
			stream.getdents ||= FS.readdir(stream.path);
			var struct_size = 280;
			var pos = 0;
			var off = FS.llseek(stream, 0, 1);
			var idx = Math.floor(off / struct_size);
			while (idx < stream.getdents.length && pos + struct_size <= count) {
				var id;
				var type;
				var name = stream.getdents[idx];
				if (name === '.') {
					id = stream.node.id;
					type = 4;
				} else if (name === '..') {
					var lookup = FS.lookupPath(stream.path, { parent: true });
					id = lookup.node.id;
					type = 4;
				} else {
					var child = FS.lookupNode(stream.node, name);
					id = child.id;
					type = FS.isChrdev(child.mode)
						? 2
						: FS.isDir(child.mode)
						? 4
						: FS.isLink(child.mode)
						? 10
						: 8;
				}
				(tempI64 = [
					id >>> 0,
					((tempDouble = id),
					+Math.abs(tempDouble) >= 1
						? tempDouble > 0
							? +Math.floor(tempDouble / 4294967296) >>> 0
							: ~~+Math.ceil(
									(tempDouble - +(~~tempDouble >>> 0)) /
										4294967296
							  ) >>> 0
						: 0),
				]),
					(HEAP32[(dirp + pos) >> 2] = tempI64[0]),
					(HEAP32[(dirp + pos + 4) >> 2] = tempI64[1]);
				(tempI64 = [
					((idx + 1) * struct_size) >>> 0,
					((tempDouble = (idx + 1) * struct_size),
					+Math.abs(tempDouble) >= 1
						? tempDouble > 0
							? +Math.floor(tempDouble / 4294967296) >>> 0
							: ~~+Math.ceil(
									(tempDouble - +(~~tempDouble >>> 0)) /
										4294967296
							  ) >>> 0
						: 0),
				]),
					(HEAP32[(dirp + pos + 8) >> 2] = tempI64[0]),
					(HEAP32[(dirp + pos + 12) >> 2] = tempI64[1]);
				HEAP16[(dirp + pos + 16) >> 1] = 280;
				HEAP8[dirp + pos + 18] = type;
				stringToUTF8(name, dirp + pos + 19, 256);
				pos += struct_size;
				idx += 1;
			}
			FS.llseek(stream, idx * struct_size, 0);
			return pos;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_getpeername(fd, addr, addrlen, d1, d2, d3) {
		try {
			var sock = getSocketFromFD(fd);
			if (!sock.daddr) {
				return -53;
			}
			var errno = writeSockaddr(
				addr,
				sock.family,
				DNS.lookup_name(sock.daddr),
				sock.dport,
				addrlen
			);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_getsockname(fd, addr, addrlen, d1, d2, d3) {
		try {
			var sock = getSocketFromFD(fd);
			var errno = writeSockaddr(
				addr,
				sock.family,
				DNS.lookup_name(sock.saddr || '0.0.0.0'),
				sock.sport,
				addrlen
			);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_getsockopt(fd, level, optname, optval, optlen, d1) {
		try {
			var sock = getSocketFromFD(fd);
			if (level === 1) {
				if (optname === 4) {
					HEAP32[optval >> 2] = sock.error;
					HEAP32[optlen >> 2] = 4;
					sock.error = null;
					return 0;
				}
			}
			return -50;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_ioctl(fd, op, varargs) {
		SYSCALLS.varargs = varargs;
		try {
			var stream = SYSCALLS.getStreamFromFD(fd);
			switch (op) {
				case 21509: {
					if (!stream.tty) return -59;
					return 0;
				}
				case 21505: {
					if (!stream.tty) return -59;
					if (stream.tty.ops.ioctl_tcgets) {
						var termios = stream.tty.ops.ioctl_tcgets(stream);
						var argp = syscallGetVarargP();
						HEAP32[argp >> 2] = termios.c_iflag || 0;
						HEAP32[(argp + 4) >> 2] = termios.c_oflag || 0;
						HEAP32[(argp + 8) >> 2] = termios.c_cflag || 0;
						HEAP32[(argp + 12) >> 2] = termios.c_lflag || 0;
						for (var i = 0; i < 32; i++) {
							HEAP8[argp + i + 17] = termios.c_cc[i] || 0;
						}
						return 0;
					}
					return 0;
				}
				case 21510:
				case 21511:
				case 21512: {
					if (!stream.tty) return -59;
					return 0;
				}
				case 21506:
				case 21507:
				case 21508: {
					if (!stream.tty) return -59;
					if (stream.tty.ops.ioctl_tcsets) {
						var argp = syscallGetVarargP();
						var c_iflag = HEAP32[argp >> 2];
						var c_oflag = HEAP32[(argp + 4) >> 2];
						var c_cflag = HEAP32[(argp + 8) >> 2];
						var c_lflag = HEAP32[(argp + 12) >> 2];
						var c_cc = [];
						for (var i = 0; i < 32; i++) {
							c_cc.push(HEAP8[argp + i + 17]);
						}
						return stream.tty.ops.ioctl_tcsets(stream.tty, op, {
							c_iflag: c_iflag,
							c_oflag: c_oflag,
							c_cflag: c_cflag,
							c_lflag: c_lflag,
							c_cc: c_cc,
						});
					}
					return 0;
				}
				case 21519: {
					if (!stream.tty) return -59;
					var argp = syscallGetVarargP();
					HEAP32[argp >> 2] = 0;
					return 0;
				}
				case 21520: {
					if (!stream.tty) return -59;
					return -28;
				}
				case 21531: {
					var argp = syscallGetVarargP();
					return FS.ioctl(stream, op, argp);
				}
				case 21523: {
					if (!stream.tty) return -59;
					if (stream.tty.ops.ioctl_tiocgwinsz) {
						var winsize = stream.tty.ops.ioctl_tiocgwinsz(
							stream.tty
						);
						var argp = syscallGetVarargP();
						HEAP16[argp >> 1] = winsize[0];
						HEAP16[(argp + 2) >> 1] = winsize[1];
					}
					return 0;
				}
				case 21524: {
					if (!stream.tty) return -59;
					return 0;
				}
				case 21515: {
					if (!stream.tty) return -59;
					return 0;
				}
				default:
					return -28;
			}
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_listen(fd, backlog) {
		try {
			var sock = getSocketFromFD(fd);
			sock.sock_ops.listen(sock, backlog);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_lstat64(path, buf) {
		try {
			path = SYSCALLS.getStr(path);
			return SYSCALLS.doStat(FS.lstat, path, buf);
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_mkdirat(dirfd, path, mode) {
		try {
			path = SYSCALLS.getStr(path);
			path = SYSCALLS.calculateAt(dirfd, path);
			path = PATH.normalize(path);
			if (path[path.length - 1] === '/')
				path = path.substr(0, path.length - 1);
			FS.mkdir(path, mode, 0);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_newfstatat(dirfd, path, buf, flags) {
		try {
			path = SYSCALLS.getStr(path);
			var nofollow = flags & 256;
			var allowEmpty = flags & 4096;
			flags = flags & ~6400;
			path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);
			return SYSCALLS.doStat(nofollow ? FS.lstat : FS.stat, path, buf);
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_openat(dirfd, path, flags, varargs) {
		SYSCALLS.varargs = varargs;
		try {
			path = SYSCALLS.getStr(path);
			path = SYSCALLS.calculateAt(dirfd, path);
			var mode = varargs ? syscallGetVarargI() : 0;
			return FS.open(path, flags, mode).fd;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	var PIPEFS = {
		BUCKET_BUFFER_SIZE: 8192,
		mount(mount) {
			return FS.createNode(null, '/', 16384 | 511, 0);
		},
		createPipe() {
			var pipe = { buckets: [], refcnt: 2 };
			pipe.buckets.push({
				buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
				offset: 0,
				roffset: 0,
			});
			var rName = PIPEFS.nextname();
			var wName = PIPEFS.nextname();
			var rNode = FS.createNode(PIPEFS.root, rName, 4096, 0);
			var wNode = FS.createNode(PIPEFS.root, wName, 4096, 0);
			rNode.pipe = pipe;
			wNode.pipe = pipe;
			var readableStream = FS.createStream({
				path: rName,
				node: rNode,
				flags: 0,
				seekable: false,
				stream_ops: PIPEFS.stream_ops,
			});
			rNode.stream = readableStream;
			var writableStream = FS.createStream({
				path: wName,
				node: wNode,
				flags: 1,
				seekable: false,
				stream_ops: PIPEFS.stream_ops,
			});
			wNode.stream = writableStream;
			return {
				readable_fd: readableStream.fd,
				writable_fd: writableStream.fd,
			};
		},
		stream_ops: {
			poll(stream) {
				var pipe = stream.node.pipe;
				if ((stream.flags & 2097155) === 1) {
					return 256 | 4;
				}
				if (pipe.buckets.length > 0) {
					for (var i = 0; i < pipe.buckets.length; i++) {
						var bucket = pipe.buckets[i];
						if (bucket.offset - bucket.roffset > 0) {
							return 64 | 1;
						}
					}
				}
				return 0;
			},
			ioctl(stream, request, varargs) {
				return 28;
			},
			fsync(stream) {
				return 28;
			},
			read(stream, buffer, offset, length, position) {
				var pipe = stream.node.pipe;
				var currentLength = 0;
				for (var i = 0; i < pipe.buckets.length; i++) {
					var bucket = pipe.buckets[i];
					currentLength += bucket.offset - bucket.roffset;
				}
				var data = buffer.subarray(offset, offset + length);
				if (length <= 0) {
					return 0;
				}
				if (currentLength == 0) {
					throw new FS.ErrnoError(6);
				}
				var toRead = Math.min(currentLength, length);
				var totalRead = toRead;
				var toRemove = 0;
				for (var i = 0; i < pipe.buckets.length; i++) {
					var currBucket = pipe.buckets[i];
					var bucketSize = currBucket.offset - currBucket.roffset;
					if (toRead <= bucketSize) {
						var tmpSlice = currBucket.buffer.subarray(
							currBucket.roffset,
							currBucket.offset
						);
						if (toRead < bucketSize) {
							tmpSlice = tmpSlice.subarray(0, toRead);
							currBucket.roffset += toRead;
						} else {
							toRemove++;
						}
						data.set(tmpSlice);
						break;
					} else {
						var tmpSlice = currBucket.buffer.subarray(
							currBucket.roffset,
							currBucket.offset
						);
						data.set(tmpSlice);
						data = data.subarray(tmpSlice.byteLength);
						toRead -= tmpSlice.byteLength;
						toRemove++;
					}
				}
				if (toRemove && toRemove == pipe.buckets.length) {
					toRemove--;
					pipe.buckets[toRemove].offset = 0;
					pipe.buckets[toRemove].roffset = 0;
				}
				pipe.buckets.splice(0, toRemove);
				return totalRead;
			},
			write(stream, buffer, offset, length, position) {
				var pipe = stream.node.pipe;
				var data = buffer.subarray(offset, offset + length);
				var dataLen = data.byteLength;
				if (dataLen <= 0) {
					return 0;
				}
				var currBucket = null;
				if (pipe.buckets.length == 0) {
					currBucket = {
						buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
						offset: 0,
						roffset: 0,
					};
					pipe.buckets.push(currBucket);
				} else {
					currBucket = pipe.buckets[pipe.buckets.length - 1];
				}
				assert(currBucket.offset <= PIPEFS.BUCKET_BUFFER_SIZE);
				var freeBytesInCurrBuffer =
					PIPEFS.BUCKET_BUFFER_SIZE - currBucket.offset;
				if (freeBytesInCurrBuffer >= dataLen) {
					currBucket.buffer.set(data, currBucket.offset);
					currBucket.offset += dataLen;
					return dataLen;
				} else if (freeBytesInCurrBuffer > 0) {
					currBucket.buffer.set(
						data.subarray(0, freeBytesInCurrBuffer),
						currBucket.offset
					);
					currBucket.offset += freeBytesInCurrBuffer;
					data = data.subarray(
						freeBytesInCurrBuffer,
						data.byteLength
					);
				}
				var numBuckets =
					(data.byteLength / PIPEFS.BUCKET_BUFFER_SIZE) | 0;
				var remElements = data.byteLength % PIPEFS.BUCKET_BUFFER_SIZE;
				for (var i = 0; i < numBuckets; i++) {
					var newBucket = {
						buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
						offset: PIPEFS.BUCKET_BUFFER_SIZE,
						roffset: 0,
					};
					pipe.buckets.push(newBucket);
					newBucket.buffer.set(
						data.subarray(0, PIPEFS.BUCKET_BUFFER_SIZE)
					);
					data = data.subarray(
						PIPEFS.BUCKET_BUFFER_SIZE,
						data.byteLength
					);
				}
				if (remElements > 0) {
					var newBucket = {
						buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
						offset: data.byteLength,
						roffset: 0,
					};
					pipe.buckets.push(newBucket);
					newBucket.buffer.set(data);
				}
				return dataLen;
			},
			close(stream) {
				var pipe = stream.node.pipe;
				pipe.refcnt--;
				if (pipe.refcnt === 0) {
					pipe.buckets = null;
				}
			},
		},
		nextname() {
			if (!PIPEFS.nextname.current) {
				PIPEFS.nextname.current = 0;
			}
			return 'pipe[' + PIPEFS.nextname.current++ + ']';
		},
	};
	function ___syscall_pipe(fdPtr) {
		try {
			if (fdPtr == 0) {
				throw new FS.ErrnoError(21);
			}
			var res = PIPEFS.createPipe();
			HEAP32[fdPtr >> 2] = res.readable_fd;
			HEAP32[(fdPtr + 4) >> 2] = res.writable_fd;
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_poll(fds, nfds, timeout) {
		try {
			var nonzero = 0;
			for (var i = 0; i < nfds; i++) {
				var pollfd = fds + 8 * i;
				var fd = HEAP32[pollfd >> 2];
				var events = HEAP16[(pollfd + 4) >> 1];
				var mask = 32;
				var stream = FS.getStream(fd);
				if (stream) {
					mask = SYSCALLS.DEFAULT_POLLMASK;
					if (stream.stream_ops?.poll) {
						mask = stream.stream_ops.poll(stream, -1);
					}
				}
				mask &= events | 8 | 16;
				if (mask) nonzero++;
				HEAP16[(pollfd + 6) >> 1] = mask;
			}
			return nonzero;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_readlinkat(dirfd, path, buf, bufsize) {
		try {
			path = SYSCALLS.getStr(path);
			path = SYSCALLS.calculateAt(dirfd, path);
			if (bufsize <= 0) return -28;
			var ret = FS.readlink(path);
			var len = Math.min(bufsize, lengthBytesUTF8(ret));
			var endChar = HEAP8[buf + len];
			stringToUTF8(ret, buf, bufsize + 1);
			HEAP8[buf + len] = endChar;
			return len;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_recvfrom(fd, buf, len, flags, addr, addrlen) {
		try {
			var sock = getSocketFromFD(fd);
			var msg = sock.sock_ops.recvmsg(sock, len);
			if (!msg) return 0;
			if (addr) {
				var errno = writeSockaddr(
					addr,
					sock.family,
					DNS.lookup_name(msg.addr),
					msg.port,
					addrlen
				);
			}
			HEAPU8.set(msg.buffer, buf);
			return msg.buffer.byteLength;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_renameat(olddirfd, oldpath, newdirfd, newpath) {
		try {
			oldpath = SYSCALLS.getStr(oldpath);
			newpath = SYSCALLS.getStr(newpath);
			oldpath = SYSCALLS.calculateAt(olddirfd, oldpath);
			newpath = SYSCALLS.calculateAt(newdirfd, newpath);
			FS.rename(oldpath, newpath);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_rmdir(path) {
		try {
			path = SYSCALLS.getStr(path);
			FS.rmdir(path);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_sendto(fd, message, length, flags, addr, addr_len) {
		try {
			var sock = getSocketFromFD(fd);
			var dest = getSocketAddress(addr, addr_len, true);
			if (!dest) {
				return FS.write(sock.stream, HEAP8, message, length);
			}
			return sock.sock_ops.sendmsg(
				sock,
				HEAP8,
				message,
				length,
				dest.addr,
				dest.port
			);
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_socket(domain, type, protocol) {
		try {
			var sock = SOCKFS.createSocket(domain, type, protocol);
			return sock.stream.fd;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_stat64(path, buf) {
		try {
			path = SYSCALLS.getStr(path);
			return SYSCALLS.doStat(FS.stat, path, buf);
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_statfs64(path, size, buf) {
		try {
			path = SYSCALLS.getStr(path);
			HEAP32[(buf + 4) >> 2] = 4096;
			HEAP32[(buf + 40) >> 2] = 4096;
			HEAP32[(buf + 8) >> 2] = 1e6;
			HEAP32[(buf + 12) >> 2] = 5e5;
			HEAP32[(buf + 16) >> 2] = 5e5;
			HEAP32[(buf + 20) >> 2] = FS.nextInode;
			HEAP32[(buf + 24) >> 2] = 1e6;
			HEAP32[(buf + 28) >> 2] = 42;
			HEAP32[(buf + 44) >> 2] = 2;
			HEAP32[(buf + 36) >> 2] = 255;
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_symlink(target, linkpath) {
		try {
			target = SYSCALLS.getStr(target);
			linkpath = SYSCALLS.getStr(linkpath);
			FS.symlink(target, linkpath);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function ___syscall_unlinkat(dirfd, path, flags) {
		try {
			path = SYSCALLS.getStr(path);
			path = SYSCALLS.calculateAt(dirfd, path);
			if (flags === 0) {
				FS.unlink(path);
			} else if (flags === 512) {
				FS.rmdir(path);
			} else {
				abort('Invalid flags passed to unlinkat');
			}
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	var readI53FromI64 = (ptr) =>
		HEAPU32[ptr >> 2] + HEAP32[(ptr + 4) >> 2] * 4294967296;
	function ___syscall_utimensat(dirfd, path, times, flags) {
		try {
			path = SYSCALLS.getStr(path);
			path = SYSCALLS.calculateAt(dirfd, path, true);
			if (!times) {
				var atime = Date.now();
				var mtime = atime;
			} else {
				var seconds = readI53FromI64(times);
				var nanoseconds = HEAP32[(times + 8) >> 2];
				atime = seconds * 1e3 + nanoseconds / (1e3 * 1e3);
				times += 16;
				seconds = readI53FromI64(times);
				nanoseconds = HEAP32[(times + 8) >> 2];
				mtime = seconds * 1e3 + nanoseconds / (1e3 * 1e3);
			}
			FS.utime(path, atime, mtime);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	var __abort_js = () => {
		abort('');
	};
	var nowIsMonotonic = 1;
	var __emscripten_get_now_is_monotonic = () => nowIsMonotonic;
	var __emscripten_lookup_name = (name) => {
		var nameString = UTF8ToString(name);
		return inetPton4(DNS.lookup_name(nameString));
	};
	var __emscripten_memcpy_js = (dest, src, num) =>
		HEAPU8.copyWithin(dest, src, src + num);
	var __emscripten_runtime_keepalive_clear = () => {
		noExitRuntime = false;
		runtimeKeepaliveCounter = 0;
	};
	var __emscripten_throw_longjmp = () => {
		throw Infinity;
	};
	function __gmtime_js(time_low, time_high, tmPtr) {
		var time = convertI32PairToI53Checked(time_low, time_high);
		var date = new Date(time * 1e3);
		HEAP32[tmPtr >> 2] = date.getUTCSeconds();
		HEAP32[(tmPtr + 4) >> 2] = date.getUTCMinutes();
		HEAP32[(tmPtr + 8) >> 2] = date.getUTCHours();
		HEAP32[(tmPtr + 12) >> 2] = date.getUTCDate();
		HEAP32[(tmPtr + 16) >> 2] = date.getUTCMonth();
		HEAP32[(tmPtr + 20) >> 2] = date.getUTCFullYear() - 1900;
		HEAP32[(tmPtr + 24) >> 2] = date.getUTCDay();
		var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
		var yday = ((date.getTime() - start) / (1e3 * 60 * 60 * 24)) | 0;
		HEAP32[(tmPtr + 28) >> 2] = yday;
	}
	var isLeapYear = (year) =>
		year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	var MONTH_DAYS_LEAP_CUMULATIVE = [
		0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335,
	];
	var MONTH_DAYS_REGULAR_CUMULATIVE = [
		0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334,
	];
	var ydayFromDate = (date) => {
		var leap = isLeapYear(date.getFullYear());
		var monthDaysCumulative = leap
			? MONTH_DAYS_LEAP_CUMULATIVE
			: MONTH_DAYS_REGULAR_CUMULATIVE;
		var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1;
		return yday;
	};
	function __localtime_js(time_low, time_high, tmPtr) {
		var time = convertI32PairToI53Checked(time_low, time_high);
		var date = new Date(time * 1e3);
		HEAP32[tmPtr >> 2] = date.getSeconds();
		HEAP32[(tmPtr + 4) >> 2] = date.getMinutes();
		HEAP32[(tmPtr + 8) >> 2] = date.getHours();
		HEAP32[(tmPtr + 12) >> 2] = date.getDate();
		HEAP32[(tmPtr + 16) >> 2] = date.getMonth();
		HEAP32[(tmPtr + 20) >> 2] = date.getFullYear() - 1900;
		HEAP32[(tmPtr + 24) >> 2] = date.getDay();
		var yday = ydayFromDate(date) | 0;
		HEAP32[(tmPtr + 28) >> 2] = yday;
		HEAP32[(tmPtr + 36) >> 2] = -(date.getTimezoneOffset() * 60);
		var start = new Date(date.getFullYear(), 0, 1);
		var summerOffset = new Date(
			date.getFullYear(),
			6,
			1
		).getTimezoneOffset();
		var winterOffset = start.getTimezoneOffset();
		var dst =
			(summerOffset != winterOffset &&
				date.getTimezoneOffset() ==
					Math.min(winterOffset, summerOffset)) | 0;
		HEAP32[(tmPtr + 32) >> 2] = dst;
	}
	var setTempRet0 = (val) => __emscripten_tempret_set(val);
	var __mktime_js = function (tmPtr) {
		var ret = (() => {
			var date = new Date(
				HEAP32[(tmPtr + 20) >> 2] + 1900,
				HEAP32[(tmPtr + 16) >> 2],
				HEAP32[(tmPtr + 12) >> 2],
				HEAP32[(tmPtr + 8) >> 2],
				HEAP32[(tmPtr + 4) >> 2],
				HEAP32[tmPtr >> 2],
				0
			);
			var dst = HEAP32[(tmPtr + 32) >> 2];
			var guessedOffset = date.getTimezoneOffset();
			var start = new Date(date.getFullYear(), 0, 1);
			var summerOffset = new Date(
				date.getFullYear(),
				6,
				1
			).getTimezoneOffset();
			var winterOffset = start.getTimezoneOffset();
			var dstOffset = Math.min(winterOffset, summerOffset);
			if (dst < 0) {
				HEAP32[(tmPtr + 32) >> 2] = Number(
					summerOffset != winterOffset && dstOffset == guessedOffset
				);
			} else if (dst > 0 != (dstOffset == guessedOffset)) {
				var nonDstOffset = Math.max(winterOffset, summerOffset);
				var trueOffset = dst > 0 ? dstOffset : nonDstOffset;
				date.setTime(
					date.getTime() + (trueOffset - guessedOffset) * 6e4
				);
			}
			HEAP32[(tmPtr + 24) >> 2] = date.getDay();
			var yday = ydayFromDate(date) | 0;
			HEAP32[(tmPtr + 28) >> 2] = yday;
			HEAP32[tmPtr >> 2] = date.getSeconds();
			HEAP32[(tmPtr + 4) >> 2] = date.getMinutes();
			HEAP32[(tmPtr + 8) >> 2] = date.getHours();
			HEAP32[(tmPtr + 12) >> 2] = date.getDate();
			HEAP32[(tmPtr + 16) >> 2] = date.getMonth();
			HEAP32[(tmPtr + 20) >> 2] = date.getYear();
			var timeMs = date.getTime();
			if (isNaN(timeMs)) {
				return -1;
			}
			return timeMs / 1e3;
		})();
		return (
			setTempRet0(
				((tempDouble = ret),
				+Math.abs(tempDouble) >= 1
					? tempDouble > 0
						? +Math.floor(tempDouble / 4294967296) >>> 0
						: ~~+Math.ceil(
								(tempDouble - +(~~tempDouble >>> 0)) /
									4294967296
						  ) >>> 0
					: 0)
			),
			ret >>> 0
		);
	};
	function __mmap_js(
		len,
		prot,
		flags,
		fd,
		offset_low,
		offset_high,
		allocated,
		addr
	) {
		var offset = convertI32PairToI53Checked(offset_low, offset_high);
		try {
			if (isNaN(offset)) return 61;
			var stream = SYSCALLS.getStreamFromFD(fd);
			var res = FS.mmap(stream, len, offset, prot, flags);
			var ptr = res.ptr;
			HEAP32[allocated >> 2] = res.allocated;
			HEAPU32[addr >> 2] = ptr;
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	function __munmap_js(addr, len, prot, flags, fd, offset_low, offset_high) {
		var offset = convertI32PairToI53Checked(offset_low, offset_high);
		try {
			var stream = SYSCALLS.getStreamFromFD(fd);
			if (prot & 2) {
				SYSCALLS.doMsync(addr, stream, len, flags, offset);
			}
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return -e.errno;
		}
	}
	var timers = {};
	var handleException = (e) => {
		if (e instanceof ExitStatus || e == 'unwind') {
			return EXITSTATUS;
		}
		quit_(1, e);
	};
	var runtimeKeepaliveCounter = 0;
	var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
	var _proc_exit = (code) => {
		EXITSTATUS = code;
		if (!keepRuntimeAlive()) {
			Module['onExit']?.(code);
			ABORT = true;
		}
		quit_(code, new ExitStatus(code));
	};
	var exitJS = (status, implicit) => {
		EXITSTATUS = status;
		if (!keepRuntimeAlive()) {
			exitRuntime();
		}
		_proc_exit(status);
	};
	var _exit = exitJS;
	var maybeExit = () => {
		if (runtimeExited) {
			return;
		}
		if (!keepRuntimeAlive()) {
			try {
				_exit(EXITSTATUS);
			} catch (e) {
				handleException(e);
			}
		}
	};
	var callUserCallback = (func) => {
		if (runtimeExited || ABORT) {
			return;
		}
		try {
			func();
			maybeExit();
		} catch (e) {
			handleException(e);
		}
	};
	var _emscripten_get_now;
	_emscripten_get_now = () => performance.now();
	var __setitimer_js = (which, timeout_ms) => {
		if (timers[which]) {
			clearTimeout(timers[which].id);
			delete timers[which];
		}
		if (!timeout_ms) return 0;
		var id = setTimeout(() => {
			delete timers[which];
			callUserCallback(() =>
				__emscripten_timeout(which, _emscripten_get_now())
			);
		}, timeout_ms);
		timers[which] = { id: id, timeout_ms: timeout_ms };
		return 0;
	};
	var __tzset_js = (timezone, daylight, std_name, dst_name) => {
		var currentYear = new Date().getFullYear();
		var winter = new Date(currentYear, 0, 1);
		var summer = new Date(currentYear, 6, 1);
		var winterOffset = winter.getTimezoneOffset();
		var summerOffset = summer.getTimezoneOffset();
		var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
		HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;
		HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);
		var extractZone = (date) =>
			date
				.toLocaleTimeString(undefined, {
					hour12: false,
					timeZoneName: 'short',
				})
				.split(' ')[1];
		var winterName = extractZone(winter);
		var summerName = extractZone(summer);
		if (summerOffset < winterOffset) {
			stringToUTF8(winterName, std_name, 17);
			stringToUTF8(summerName, dst_name, 17);
		} else {
			stringToUTF8(winterName, dst_name, 17);
			stringToUTF8(summerName, std_name, 17);
		}
	};
	var _emscripten_date_now = () => Date.now();
	var getHeapMax = () => 2147483648;
	var _emscripten_get_heap_max = () => getHeapMax();
	var growMemory = (size) => {
		var b = wasmMemory.buffer;
		var pages = (size - b.byteLength + 65535) / 65536;
		try {
			wasmMemory.grow(pages);
			updateMemoryViews();
			return 1;
		} catch (e) {}
	};
	var _emscripten_resize_heap = (requestedSize) => {
		var oldSize = HEAPU8.length;
		requestedSize >>>= 0;
		var maxHeapSize = getHeapMax();
		if (requestedSize > maxHeapSize) {
			return false;
		}
		var alignUp = (x, multiple) =>
			x + ((multiple - (x % multiple)) % multiple);
		for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
			var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
			overGrownHeapSize = Math.min(
				overGrownHeapSize,
				requestedSize + 100663296
			);
			var newSize = Math.min(
				maxHeapSize,
				alignUp(Math.max(requestedSize, overGrownHeapSize), 65536)
			);
			var replacement = growMemory(newSize);
			if (replacement) {
				return true;
			}
		}
		return false;
	};
	var ENV = PHPLoader.ENV || {};
	var getExecutableName = () => thisProgram || './this.program';
	var getEnvStrings = () => {
		if (!getEnvStrings.strings) {
			var lang =
				(
					(typeof navigator == 'object' &&
						navigator.languages &&
						navigator.languages[0]) ||
					'C'
				).replace('-', '_') + '.UTF-8';
			var env = {
				USER: 'web_user',
				LOGNAME: 'web_user',
				PATH: '/',
				PWD: '/',
				HOME: '/home/web_user',
				LANG: lang,
				_: getExecutableName(),
			};
			for (var x in ENV) {
				if (ENV[x] === undefined) delete env[x];
				else env[x] = ENV[x];
			}
			var strings = [];
			for (var x in env) {
				strings.push(`${x}=${env[x]}`);
			}
			getEnvStrings.strings = strings;
		}
		return getEnvStrings.strings;
	};
	var stringToAscii = (str, buffer) => {
		for (var i = 0; i < str.length; ++i) {
			HEAP8[buffer++] = str.charCodeAt(i);
		}
		HEAP8[buffer] = 0;
	};
	var _environ_get = (__environ, environ_buf) => {
		var bufSize = 0;
		getEnvStrings().forEach((string, i) => {
			var ptr = environ_buf + bufSize;
			HEAPU32[(__environ + i * 4) >> 2] = ptr;
			stringToAscii(string, ptr);
			bufSize += string.length + 1;
		});
		return 0;
	};
	var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
		var strings = getEnvStrings();
		HEAPU32[penviron_count >> 2] = strings.length;
		var bufSize = 0;
		strings.forEach((string) => (bufSize += string.length + 1));
		HEAPU32[penviron_buf_size >> 2] = bufSize;
		return 0;
	};
	function _fd_close(fd) {
		try {
			var stream = SYSCALLS.getStreamFromFD(fd);
			FS.close(stream);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return e.errno;
		}
	}
	function _fd_fdstat_get(fd, pbuf) {
		try {
			var rightsBase = 0;
			var rightsInheriting = 0;
			var flags = 0;
			{
				var stream = SYSCALLS.getStreamFromFD(fd);
				var type = stream.tty
					? 2
					: FS.isDir(stream.mode)
					? 3
					: FS.isLink(stream.mode)
					? 7
					: 4;
			}
			HEAP8[pbuf] = type;
			HEAP16[(pbuf + 2) >> 1] = flags;
			(tempI64 = [
				rightsBase >>> 0,
				((tempDouble = rightsBase),
				+Math.abs(tempDouble) >= 1
					? tempDouble > 0
						? +Math.floor(tempDouble / 4294967296) >>> 0
						: ~~+Math.ceil(
								(tempDouble - +(~~tempDouble >>> 0)) /
									4294967296
						  ) >>> 0
					: 0),
			]),
				(HEAP32[(pbuf + 8) >> 2] = tempI64[0]),
				(HEAP32[(pbuf + 12) >> 2] = tempI64[1]);
			(tempI64 = [
				rightsInheriting >>> 0,
				((tempDouble = rightsInheriting),
				+Math.abs(tempDouble) >= 1
					? tempDouble > 0
						? +Math.floor(tempDouble / 4294967296) >>> 0
						: ~~+Math.ceil(
								(tempDouble - +(~~tempDouble >>> 0)) /
									4294967296
						  ) >>> 0
					: 0),
			]),
				(HEAP32[(pbuf + 16) >> 2] = tempI64[0]),
				(HEAP32[(pbuf + 20) >> 2] = tempI64[1]);
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return e.errno;
		}
	}
	var doReadv = (stream, iov, iovcnt, offset) => {
		var ret = 0;
		for (var i = 0; i < iovcnt; i++) {
			var ptr = HEAPU32[iov >> 2];
			var len = HEAPU32[(iov + 4) >> 2];
			iov += 8;
			var curr = FS.read(stream, HEAP8, ptr, len, offset);
			if (curr < 0) return -1;
			ret += curr;
			if (curr < len) break;
			if (typeof offset != 'undefined') {
				offset += curr;
			}
		}
		return ret;
	};
	function _fd_read(fd, iov, iovcnt, pnum) {
		try {
			var stream = SYSCALLS.getStreamFromFD(fd);
			var num = doReadv(stream, iov, iovcnt);
			HEAPU32[pnum >> 2] = num;
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return e.errno;
		}
	}
	function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
		var offset = convertI32PairToI53Checked(offset_low, offset_high);
		try {
			if (isNaN(offset)) return 61;
			var stream = SYSCALLS.getStreamFromFD(fd);
			FS.llseek(stream, offset, whence);
			(tempI64 = [
				stream.position >>> 0,
				((tempDouble = stream.position),
				+Math.abs(tempDouble) >= 1
					? tempDouble > 0
						? +Math.floor(tempDouble / 4294967296) >>> 0
						: ~~+Math.ceil(
								(tempDouble - +(~~tempDouble >>> 0)) /
									4294967296
						  ) >>> 0
					: 0),
			]),
				(HEAP32[newOffset >> 2] = tempI64[0]),
				(HEAP32[(newOffset + 4) >> 2] = tempI64[1]);
			if (stream.getdents && offset === 0 && whence === 0)
				stream.getdents = null;
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return e.errno;
		}
	}
	function _fd_sync(fd) {
		try {
			var stream = SYSCALLS.getStreamFromFD(fd);
			if (stream.stream_ops?.fsync) {
				return stream.stream_ops.fsync(stream);
			}
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return e.errno;
		}
	}
	var doWritev = (stream, iov, iovcnt, offset) => {
		var ret = 0;
		for (var i = 0; i < iovcnt; i++) {
			var ptr = HEAPU32[iov >> 2];
			var len = HEAPU32[(iov + 4) >> 2];
			iov += 8;
			var curr = FS.write(stream, HEAP8, ptr, len, offset);
			if (curr < 0) return -1;
			ret += curr;
			if (typeof offset != 'undefined') {
				offset += curr;
			}
		}
		return ret;
	};
	function _fd_write(fd, iov, iovcnt, pnum) {
		try {
			var stream = SYSCALLS.getStreamFromFD(fd);
			var num = doWritev(stream, iov, iovcnt);
			HEAPU32[pnum >> 2] = num;
			return 0;
		} catch (e) {
			if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
			return e.errno;
		}
	}
	var _getaddrinfo = (node, service, hint, out) => {
		var addr = 0;
		var port = 0;
		var flags = 0;
		var family = 0;
		var type = 0;
		var proto = 0;
		var ai;
		function allocaddrinfo(family, type, proto, canon, addr, port) {
			var sa, salen, ai;
			var errno;
			salen = family === 10 ? 28 : 16;
			addr = family === 10 ? inetNtop6(addr) : inetNtop4(addr);
			sa = _malloc(salen);
			errno = writeSockaddr(sa, family, addr, port);
			assert(!errno);
			ai = _malloc(32);
			HEAP32[(ai + 4) >> 2] = family;
			HEAP32[(ai + 8) >> 2] = type;
			HEAP32[(ai + 12) >> 2] = proto;
			HEAPU32[(ai + 24) >> 2] = canon;
			HEAPU32[(ai + 20) >> 2] = sa;
			if (family === 10) {
				HEAP32[(ai + 16) >> 2] = 28;
			} else {
				HEAP32[(ai + 16) >> 2] = 16;
			}
			HEAP32[(ai + 28) >> 2] = 0;
			return ai;
		}
		if (hint) {
			flags = HEAP32[hint >> 2];
			family = HEAP32[(hint + 4) >> 2];
			type = HEAP32[(hint + 8) >> 2];
			proto = HEAP32[(hint + 12) >> 2];
		}
		if (type && !proto) {
			proto = type === 2 ? 17 : 6;
		}
		if (!type && proto) {
			type = proto === 17 ? 2 : 1;
		}
		if (proto === 0) {
			proto = 6;
		}
		if (type === 0) {
			type = 1;
		}
		if (!node && !service) {
			return -2;
		}
		if (flags & ~(1 | 2 | 4 | 1024 | 8 | 16 | 32)) {
			return -1;
		}
		if (hint !== 0 && HEAP32[hint >> 2] & 2 && !node) {
			return -1;
		}
		if (flags & 32) {
			return -2;
		}
		if (type !== 0 && type !== 1 && type !== 2) {
			return -7;
		}
		if (family !== 0 && family !== 2 && family !== 10) {
			return -6;
		}
		if (service) {
			service = UTF8ToString(service);
			port = parseInt(service, 10);
			if (isNaN(port)) {
				if (flags & 1024) {
					return -2;
				}
				return -8;
			}
		}
		if (!node) {
			if (family === 0) {
				family = 2;
			}
			if ((flags & 1) === 0) {
				if (family === 2) {
					addr = _htonl(2130706433);
				} else {
					addr = [0, 0, 0, 1];
				}
			}
			ai = allocaddrinfo(family, type, proto, null, addr, port);
			HEAPU32[out >> 2] = ai;
			return 0;
		}
		node = UTF8ToString(node);
		addr = inetPton4(node);
		if (addr !== null) {
			if (family === 0 || family === 2) {
				family = 2;
			} else if (family === 10 && flags & 8) {
				addr = [0, 0, _htonl(65535), addr];
				family = 10;
			} else {
				return -2;
			}
		} else {
			addr = inetPton6(node);
			if (addr !== null) {
				if (family === 0 || family === 10) {
					family = 10;
				} else {
					return -2;
				}
			}
		}
		if (addr != null) {
			ai = allocaddrinfo(family, type, proto, node, addr, port);
			HEAPU32[out >> 2] = ai;
			return 0;
		}
		if (flags & 4) {
			return -2;
		}
		node = DNS.lookup_name(node);
		addr = inetPton4(node);
		if (family === 0) {
			family = 2;
		} else if (family === 10) {
			addr = [0, 0, _htonl(65535), addr];
		}
		ai = allocaddrinfo(family, type, proto, null, addr, port);
		HEAPU32[out >> 2] = ai;
		return 0;
	};
	function _getcontext() {
		abort('missing function: getcontext');
	}
	_getcontext.stub = true;
	function _getdtablesize() {
		abort('missing function: getdtablesize');
	}
	_getdtablesize.stub = true;
	var _getnameinfo = (sa, salen, node, nodelen, serv, servlen, flags) => {
		var info = readSockaddr(sa, salen);
		if (info.errno) {
			return -6;
		}
		var port = info.port;
		var addr = info.addr;
		var overflowed = false;
		if (node && nodelen) {
			var lookup;
			if (flags & 1 || !(lookup = DNS.lookup_addr(addr))) {
				if (flags & 8) {
					return -2;
				}
			} else {
				addr = lookup;
			}
			var numBytesWrittenExclNull = stringToUTF8(addr, node, nodelen);
			if (numBytesWrittenExclNull + 1 >= nodelen) {
				overflowed = true;
			}
		}
		if (serv && servlen) {
			port = '' + port;
			var numBytesWrittenExclNull = stringToUTF8(port, serv, servlen);
			if (numBytesWrittenExclNull + 1 >= servlen) {
				overflowed = true;
			}
		}
		if (overflowed) {
			return -12;
		}
		return 0;
	};
	var Protocols = { list: [], map: {} };
	var _setprotoent = (stayopen) => {
		function allocprotoent(name, proto, aliases) {
			var nameBuf = _malloc(name.length + 1);
			stringToAscii(name, nameBuf);
			var j = 0;
			var length = aliases.length;
			var aliasListBuf = _malloc((length + 1) * 4);
			for (var i = 0; i < length; i++, j += 4) {
				var alias = aliases[i];
				var aliasBuf = _malloc(alias.length + 1);
				stringToAscii(alias, aliasBuf);
				HEAPU32[(aliasListBuf + j) >> 2] = aliasBuf;
			}
			HEAPU32[(aliasListBuf + j) >> 2] = 0;
			var pe = _malloc(12);
			HEAPU32[pe >> 2] = nameBuf;
			HEAPU32[(pe + 4) >> 2] = aliasListBuf;
			HEAP32[(pe + 8) >> 2] = proto;
			return pe;
		}
		var list = Protocols.list;
		var map = Protocols.map;
		if (list.length === 0) {
			var entry = allocprotoent('tcp', 6, ['TCP']);
			list.push(entry);
			map['tcp'] = map['6'] = entry;
			entry = allocprotoent('udp', 17, ['UDP']);
			list.push(entry);
			map['udp'] = map['17'] = entry;
		}
		_setprotoent.index = 0;
	};
	var _getprotobyname = (name) => {
		name = UTF8ToString(name);
		_setprotoent(true);
		var result = Protocols.map[name];
		return result;
	};
	var _getprotobynumber = (number) => {
		_setprotoent(true);
		var result = Protocols.map[number];
		return result;
	};
	var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
	var stringToUTF8OnStack = (str) => {
		var size = lengthBytesUTF8(str) + 1;
		var ret = stackAlloc(size);
		stringToUTF8(str, ret, size);
		return ret;
	};
	var allocateUTF8OnStack = stringToUTF8OnStack;
	var PHPWASM = {
		getAllWebSockets: function (sock) {
			const webSockets = new Set();
			if (sock.server) {
				sock.server.clients.forEach((ws) => {
					webSockets.add(ws);
				});
			}
			for (const peer of PHPWASM.getAllPeers(sock)) {
				webSockets.add(peer.socket);
			}
			return Array.from(webSockets);
		},
		getAllPeers: function (sock) {
			const peers = new Set();
			if (sock.server) {
				sock.pending
					.filter((pending) => pending.peers)
					.forEach((pending) => {
						for (const peer of Object.values(pending.peers)) {
							peers.add(peer);
						}
					});
			}
			if (sock.peers) {
				for (const peer of Object.values(sock.peers)) {
					peers.add(peer);
				}
			}
			return Array.from(peers);
		},
		awaitData: function (ws) {
			return PHPWASM.awaitWsEvent(ws, 'message');
		},
		awaitConnection: function (ws) {
			if (ws.OPEN === ws.readyState) {
				return [Promise.resolve(), PHPWASM.noop];
			}
			return PHPWASM.awaitWsEvent(ws, 'open');
		},
		awaitClose: function (ws) {
			if ([ws.CLOSING, ws.CLOSED].includes(ws.readyState)) {
				return [Promise.resolve(), PHPWASM.noop];
			}
			return PHPWASM.awaitWsEvent(ws, 'close');
		},
		awaitError: function (ws) {
			if ([ws.CLOSING, ws.CLOSED].includes(ws.readyState)) {
				return [Promise.resolve(), PHPWASM.noop];
			}
			return PHPWASM.awaitWsEvent(ws, 'error');
		},
		awaitWsEvent: function (ws, event) {
			let resolve;
			const listener = () => {
				resolve();
			};
			const promise = new Promise(function (_resolve) {
				resolve = _resolve;
				ws.once(event, listener);
			});
			const cancel = () => {
				ws.removeListener(event, listener);
				setTimeout(resolve);
			};
			return [promise, cancel];
		},
		noop: function () {},
		shutdownSocket: function (socketd, how) {
			const sock = getSocketFromFD(socketd);
			const peer = Object.values(sock.peers)[0];
			if (!peer) {
				return -1;
			}
			try {
				peer.socket.close();
				SOCKFS.websocket_sock_ops.removePeer(sock, peer);
				return 0;
			} catch (e) {
				console.log('Socket shutdown error', e);
				return -1;
			}
		},
	};
	function _js_popen_to_file(command, mode, exitCodePtr) {
		if (!command) return 1;
		const cmdstr = UTF8ToString(command);
		if (!cmdstr.length) return 0;
		const modestr = UTF8ToString(mode);
		if (!modestr.length) return 0;
		if (Module['popen_to_file']) {
			const { path: path, exitCode: exitCode } = Module['popen_to_file'](
				cmdstr,
				modestr
			);
			HEAPU8[exitCodePtr] = exitCode;
			return allocateUTF8OnStack(path);
		}
		throw new Error(
			'popen() is unsupported in the browser. Implement popen_to_file in your Module ' +
				'or disable shell_exec() and similar functions via php.ini.'
		);
		return _W_EXITCODE(0, 2);
	}
	function _makecontext() {
		abort('missing function: makecontext');
	}
	_makecontext.stub = true;
	function _posix_spawnp() {
		abort('missing function: posix_spawnp');
	}
	_posix_spawnp.stub = true;
	var arraySum = (array, index) => {
		var sum = 0;
		for (var i = 0; i <= index; sum += array[i++]) {}
		return sum;
	};
	var MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	var MONTH_DAYS_REGULAR = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	var addDays = (date, days) => {
		var newDate = new Date(date.getTime());
		while (days > 0) {
			var leap = isLeapYear(newDate.getFullYear());
			var currentMonth = newDate.getMonth();
			var daysInCurrentMonth = (
				leap ? MONTH_DAYS_LEAP : MONTH_DAYS_REGULAR
			)[currentMonth];
			if (days > daysInCurrentMonth - newDate.getDate()) {
				days -= daysInCurrentMonth - newDate.getDate() + 1;
				newDate.setDate(1);
				if (currentMonth < 11) {
					newDate.setMonth(currentMonth + 1);
				} else {
					newDate.setMonth(0);
					newDate.setFullYear(newDate.getFullYear() + 1);
				}
			} else {
				newDate.setDate(newDate.getDate() + days);
				return newDate;
			}
		}
		return newDate;
	};
	var _strptime = (buf, format, tm) => {
		var pattern = UTF8ToString(format);
		var SPECIAL_CHARS = '\\!@#$^&*()+=-[]/{}|:<>?,.';
		for (var i = 0, ii = SPECIAL_CHARS.length; i < ii; ++i) {
			pattern = pattern.replace(
				new RegExp('\\' + SPECIAL_CHARS[i], 'g'),
				'\\' + SPECIAL_CHARS[i]
			);
		}
		var EQUIVALENT_MATCHERS = {
			A: '%a',
			B: '%b',
			c: '%a %b %d %H:%M:%S %Y',
			D: '%m\\/%d\\/%y',
			e: '%d',
			F: '%Y-%m-%d',
			h: '%b',
			R: '%H\\:%M',
			r: '%I\\:%M\\:%S\\s%p',
			T: '%H\\:%M\\:%S',
			x: '%m\\/%d\\/(?:%y|%Y)',
			X: '%H\\:%M\\:%S',
		};
		var DATE_PATTERNS = {
			a: '(?:Sun(?:day)?)|(?:Mon(?:day)?)|(?:Tue(?:sday)?)|(?:Wed(?:nesday)?)|(?:Thu(?:rsday)?)|(?:Fri(?:day)?)|(?:Sat(?:urday)?)',
			b: '(?:Jan(?:uary)?)|(?:Feb(?:ruary)?)|(?:Mar(?:ch)?)|(?:Apr(?:il)?)|May|(?:Jun(?:e)?)|(?:Jul(?:y)?)|(?:Aug(?:ust)?)|(?:Sep(?:tember)?)|(?:Oct(?:ober)?)|(?:Nov(?:ember)?)|(?:Dec(?:ember)?)',
			C: '\\d\\d',
			d: '0[1-9]|[1-9](?!\\d)|1\\d|2\\d|30|31',
			H: '\\d(?!\\d)|[0,1]\\d|20|21|22|23',
			I: '\\d(?!\\d)|0\\d|10|11|12',
			j: '00[1-9]|0?[1-9](?!\\d)|0?[1-9]\\d(?!\\d)|[1,2]\\d\\d|3[0-6]\\d',
			m: '0[1-9]|[1-9](?!\\d)|10|11|12',
			M: '0\\d|\\d(?!\\d)|[1-5]\\d',
			n: ' ',
			p: 'AM|am|PM|pm|A\\.M\\.|a\\.m\\.|P\\.M\\.|p\\.m\\.',
			S: '0\\d|\\d(?!\\d)|[1-5]\\d|60',
			U: '0\\d|\\d(?!\\d)|[1-4]\\d|50|51|52|53',
			W: '0\\d|\\d(?!\\d)|[1-4]\\d|50|51|52|53',
			w: '[0-6]',
			y: '\\d\\d',
			Y: '\\d\\d\\d\\d',
			t: ' ',
			z: 'Z|(?:[\\+\\-]\\d\\d:?(?:\\d\\d)?)',
		};
		var MONTH_NUMBERS = {
			JAN: 0,
			FEB: 1,
			MAR: 2,
			APR: 3,
			MAY: 4,
			JUN: 5,
			JUL: 6,
			AUG: 7,
			SEP: 8,
			OCT: 9,
			NOV: 10,
			DEC: 11,
		};
		var DAY_NUMBERS_SUN_FIRST = {
			SUN: 0,
			MON: 1,
			TUE: 2,
			WED: 3,
			THU: 4,
			FRI: 5,
			SAT: 6,
		};
		var DAY_NUMBERS_MON_FIRST = {
			MON: 0,
			TUE: 1,
			WED: 2,
			THU: 3,
			FRI: 4,
			SAT: 5,
			SUN: 6,
		};
		var capture = [];
		var pattern_out = pattern
			.replace(/%(.)/g, (m, c) => EQUIVALENT_MATCHERS[c] || m)
			.replace(/%(.)/g, (_, c) => {
				let pat = DATE_PATTERNS[c];
				if (pat) {
					capture.push(c);
					return `(${pat})`;
				} else {
					return c;
				}
			})
			.replace(/\s+/g, '\\s*');
		var matches = new RegExp('^' + pattern_out, 'i').exec(
			UTF8ToString(buf)
		);
		function initDate() {
			function fixup(value, min, max) {
				return typeof value != 'number' || isNaN(value)
					? min
					: value >= min
					? value <= max
						? value
						: max
					: min;
			}
			return {
				year: fixup(HEAP32[(tm + 20) >> 2] + 1900, 1970, 9999),
				month: fixup(HEAP32[(tm + 16) >> 2], 0, 11),
				day: fixup(HEAP32[(tm + 12) >> 2], 1, 31),
				hour: fixup(HEAP32[(tm + 8) >> 2], 0, 23),
				min: fixup(HEAP32[(tm + 4) >> 2], 0, 59),
				sec: fixup(HEAP32[tm >> 2], 0, 59),
				gmtoff: 0,
			};
		}
		if (matches) {
			var date = initDate();
			var value;
			var getMatch = (symbol) => {
				var pos = capture.indexOf(symbol);
				if (pos >= 0) {
					return matches[pos + 1];
				}
				return;
			};
			if ((value = getMatch('S'))) {
				date.sec = jstoi_q(value);
			}
			if ((value = getMatch('M'))) {
				date.min = jstoi_q(value);
			}
			if ((value = getMatch('H'))) {
				date.hour = jstoi_q(value);
			} else if ((value = getMatch('I'))) {
				var hour = jstoi_q(value);
				if ((value = getMatch('p'))) {
					hour += value.toUpperCase()[0] === 'P' ? 12 : 0;
				}
				date.hour = hour;
			}
			if ((value = getMatch('Y'))) {
				date.year = jstoi_q(value);
			} else if ((value = getMatch('y'))) {
				var year = jstoi_q(value);
				if ((value = getMatch('C'))) {
					year += jstoi_q(value) * 100;
				} else {
					year += year < 69 ? 2e3 : 1900;
				}
				date.year = year;
			}
			if ((value = getMatch('m'))) {
				date.month = jstoi_q(value) - 1;
			} else if ((value = getMatch('b'))) {
				date.month =
					MONTH_NUMBERS[value.substring(0, 3).toUpperCase()] || 0;
			}
			if ((value = getMatch('d'))) {
				date.day = jstoi_q(value);
			} else if ((value = getMatch('j'))) {
				var day = jstoi_q(value);
				var leapYear = isLeapYear(date.year);
				for (var month = 0; month < 12; ++month) {
					var daysUntilMonth = arraySum(
						leapYear ? MONTH_DAYS_LEAP : MONTH_DAYS_REGULAR,
						month - 1
					);
					if (
						day <=
						daysUntilMonth +
							(leapYear ? MONTH_DAYS_LEAP : MONTH_DAYS_REGULAR)[
								month
							]
					) {
						date.day = day - daysUntilMonth;
					}
				}
			} else if ((value = getMatch('a'))) {
				var weekDay = value.substring(0, 3).toUpperCase();
				if ((value = getMatch('U'))) {
					var weekDayNumber = DAY_NUMBERS_SUN_FIRST[weekDay];
					var weekNumber = jstoi_q(value);
					var janFirst = new Date(date.year, 0, 1);
					var endDate;
					if (janFirst.getDay() === 0) {
						endDate = addDays(
							janFirst,
							weekDayNumber + 7 * (weekNumber - 1)
						);
					} else {
						endDate = addDays(
							janFirst,
							7 -
								janFirst.getDay() +
								weekDayNumber +
								7 * (weekNumber - 1)
						);
					}
					date.day = endDate.getDate();
					date.month = endDate.getMonth();
				} else if ((value = getMatch('W'))) {
					var weekDayNumber = DAY_NUMBERS_MON_FIRST[weekDay];
					var weekNumber = jstoi_q(value);
					var janFirst = new Date(date.year, 0, 1);
					var endDate;
					if (janFirst.getDay() === 1) {
						endDate = addDays(
							janFirst,
							weekDayNumber + 7 * (weekNumber - 1)
						);
					} else {
						endDate = addDays(
							janFirst,
							7 -
								janFirst.getDay() +
								1 +
								weekDayNumber +
								7 * (weekNumber - 1)
						);
					}
					date.day = endDate.getDate();
					date.month = endDate.getMonth();
				}
			}
			if ((value = getMatch('z'))) {
				if (value.toLowerCase() === 'z') {
					date.gmtoff = 0;
				} else {
					var match = value.match(/^((?:\-|\+)\d\d):?(\d\d)?/);
					date.gmtoff = match[1] * 3600;
					if (match[2]) {
						date.gmtoff +=
							date.gmtoff > 0 ? match[2] * 60 : -match[2] * 60;
					}
				}
			}
			var fullDate = new Date(
				date.year,
				date.month,
				date.day,
				date.hour,
				date.min,
				date.sec,
				0
			);
			HEAP32[tm >> 2] = fullDate.getSeconds();
			HEAP32[(tm + 4) >> 2] = fullDate.getMinutes();
			HEAP32[(tm + 8) >> 2] = fullDate.getHours();
			HEAP32[(tm + 12) >> 2] = fullDate.getDate();
			HEAP32[(tm + 16) >> 2] = fullDate.getMonth();
			HEAP32[(tm + 20) >> 2] = fullDate.getFullYear() - 1900;
			HEAP32[(tm + 24) >> 2] = fullDate.getDay();
			HEAP32[(tm + 28) >> 2] =
				arraySum(
					isLeapYear(fullDate.getFullYear())
						? MONTH_DAYS_LEAP
						: MONTH_DAYS_REGULAR,
					fullDate.getMonth() - 1
				) +
				fullDate.getDate() -
				1;
			HEAP32[(tm + 32) >> 2] = 0;
			HEAP32[(tm + 36) >> 2] = date.gmtoff;
			return buf + intArrayFromString(matches[0]).length - 1;
		}
		return 0;
	};
	function _swapcontext() {
		abort('missing function: swapcontext');
	}
	_swapcontext.stub = true;
	function _vrzno_del_callback() {
		abort('missing function: vrzno_del_callback');
	}
	_vrzno_del_callback.stub = true;
	function _vrzno_exec_callback() {
		abort('missing function: vrzno_exec_callback');
	}
	_vrzno_exec_callback.stub = true;
	var _wasm_poll_socket = function (socketd, events, timeout) {
		const POLLIN = 1;
		const POLLPRI = 2;
		const POLLOUT = 4;
		const POLLERR = 8;
		const POLLHUP = 16;
		const POLLNVAL = 32;
		return Asyncify.handleSleep((wakeUp) => {
			const sock = getSocketFromFD(socketd);
			if (!sock) {
				wakeUp(0);
				return;
			}
			const polls = [];
			const lookingFor = new Set();
			if (events & POLLIN || events & POLLPRI) {
				if (sock.server) {
					for (const client of sock.pending) {
						if ((client.recv_queue || []).length > 0) {
							wakeUp(1);
							return;
						}
					}
				} else if ((sock.recv_queue || []).length > 0) {
					wakeUp(1);
					return;
				}
			}
			const webSockets = PHPWASM.getAllWebSockets(sock);
			if (!webSockets.length) {
				wakeUp(0);
				return;
			}
			for (const ws of webSockets) {
				if (events & POLLIN || events & POLLPRI) {
					polls.push(PHPWASM.awaitData(ws));
					lookingFor.add('POLLIN');
				}
				if (events & POLLOUT) {
					polls.push(PHPWASM.awaitConnection(ws));
					lookingFor.add('POLLOUT');
				}
				if (events & POLLHUP) {
					polls.push(PHPWASM.awaitClose(ws));
					lookingFor.add('POLLHUP');
				}
				if (events & POLLERR || events & POLLNVAL) {
					polls.push(PHPWASM.awaitError(ws));
					lookingFor.add('POLLERR');
				}
			}
			if (polls.length === 0) {
				console.warn(
					'Unsupported poll event ' +
						events +
						', defaulting to setTimeout().'
				);
				setTimeout(function () {
					wakeUp(0);
				}, timeout);
				return;
			}
			const promises = polls.map(([promise]) => promise);
			const clearPolling = () => polls.forEach(([, clear]) => clear());
			let awaken = false;
			Promise.race(promises).then(function (results) {
				if (!awaken) {
					awaken = true;
					wakeUp(1);
					clearTimeout(timeoutId);
					clearPolling();
				}
			});
			const timeoutId = setTimeout(function () {
				if (!awaken) {
					awaken = true;
					wakeUp(0);
					clearPolling();
				}
			}, timeout);
		});
	};
	function _wasm_setsockopt(
		socketd,
		level,
		optionName,
		optionValuePtr,
		optionLen
	) {
		const optionValue = HEAPU8[optionValuePtr];
		const SOL_SOCKET = 1;
		const SO_KEEPALIVE = 9;
		const IPPROTO_TCP = 6;
		const TCP_NODELAY = 1;
		const isSupported =
			(level === SOL_SOCKET && optionName === SO_KEEPALIVE) ||
			(level === IPPROTO_TCP && optionName === TCP_NODELAY);
		if (!isSupported) {
			console.warn(
				`Unsupported socket option: ${level}, ${optionName}, ${optionValue}`
			);
			return -1;
		}
		const ws = PHPWASM.getAllWebSockets(socketd)[0];
		if (!ws) {
			return -1;
		}
		ws.setSocketOpt(level, optionName, optionValuePtr);
		return 0;
	}
	var getCFunc = (ident) => {
		var func = Module['_' + ident];
		return func;
	};
	var writeArrayToMemory = (array, buffer) => {
		HEAP8.set(array, buffer);
	};
	var ccall = (ident, returnType, argTypes, args, opts) => {
		var toC = {
			string: (str) => {
				var ret = 0;
				if (str !== null && str !== undefined && str !== 0) {
					ret = stringToUTF8OnStack(str);
				}
				return ret;
			},
			array: (arr) => {
				var ret = stackAlloc(arr.length);
				writeArrayToMemory(arr, ret);
				return ret;
			},
		};
		function convertReturnValue(ret) {
			if (returnType === 'string') {
				return UTF8ToString(ret);
			}
			if (returnType === 'boolean') return Boolean(ret);
			return ret;
		}
		var func = getCFunc(ident);
		var cArgs = [];
		var stack = 0;
		if (args) {
			for (var i = 0; i < args.length; i++) {
				var converter = toC[argTypes[i]];
				if (converter) {
					if (stack === 0) stack = stackSave();
					cArgs[i] = converter(args[i]);
				} else {
					cArgs[i] = args[i];
				}
			}
		}
		var ret = func(...cArgs);
		function onDone(ret) {
			if (stack !== 0) stackRestore(stack);
			return convertReturnValue(ret);
		}
		ret = onDone(ret);
		return ret;
	};
	var FS_createPath = FS.createPath;
	var FS_unlink = (path) => FS.unlink(path);
	var FS_createLazyFile = FS.createLazyFile;
	var FS_createDevice = FS.createDevice;
	FS.createPreloadedFile = FS_createPreloadedFile;
	FS.staticInit();
	Module['FS_createPath'] = FS.createPath;
	Module['FS_createDataFile'] = FS.createDataFile;
	Module['FS_createPreloadedFile'] = FS.createPreloadedFile;
	Module['FS_unlink'] = FS.unlink;
	Module['FS_createLazyFile'] = FS.createLazyFile;
	Module['FS_createDevice'] = FS.createDevice;
	var wasmImports = {
		p: ___assert_fail,
		ha: ___call_sighandler,
		ca: ___syscall__newselect,
		W: ___syscall_accept4,
		V: ___syscall_bind,
		ya: ___syscall_chdir,
		xa: ___syscall_chmod,
		U: ___syscall_connect,
		wa: ___syscall_dup,
		va: ___syscall_dup3,
		za: ___syscall_faccessat,
		D: ___syscall_fchownat,
		k: ___syscall_fcntl64,
		sa: ___syscall_fdatasync,
		ra: ___syscall_fstat64,
		M: ___syscall_ftruncate64,
		ma: ___syscall_getcwd,
		ga: ___syscall_getdents64,
		S: ___syscall_getpeername,
		R: ___syscall_getsockname,
		Q: ___syscall_getsockopt,
		x: ___syscall_ioctl,
		P: ___syscall_listen,
		oa: ___syscall_lstat64,
		la: ___syscall_mkdirat,
		pa: ___syscall_newfstatat,
		u: ___syscall_openat,
		ka: ___syscall_pipe,
		ja: ___syscall_poll,
		fa: ___syscall_readlinkat,
		O: ___syscall_recvfrom,
		ea: ___syscall_renameat,
		da: ___syscall_rmdir,
		N: ___syscall_sendto,
		A: ___syscall_socket,
		qa: ___syscall_stat64,
		ba: ___syscall_statfs64,
		aa: ___syscall_symlink,
		_: ___syscall_unlinkat,
		Z: ___syscall_utimensat,
		Aa: __abort_js,
		ta: __emscripten_get_now_is_monotonic,
		T: __emscripten_lookup_name,
		ua: __emscripten_memcpy_js,
		ia: __emscripten_runtime_keepalive_clear,
		X: __emscripten_throw_longjmp,
		I: __gmtime_js,
		J: __localtime_js,
		K: __mktime_js,
		G: __mmap_js,
		H: __munmap_js,
		B: __setitimer_js,
		Ca: __tzset_js,
		v: _emscripten_date_now,
		$: _emscripten_get_heap_max,
		q: _emscripten_get_now,
		Y: _emscripten_resize_heap,
		Da: _environ_get,
		Ea: _environ_sizes_get,
		s: _exit,
		o: _fd_close,
		C: _fd_fdstat_get,
		E: _fd_read,
		L: _fd_seek,
		na: _fd_sync,
		w: _fd_write,
		Pa: _getaddrinfo,
		Oa: _getcontext,
		Ma: _getdtablesize,
		t: _getnameinfo,
		La: _getprotobyname,
		Ka: _getprotobynumber,
		j: invoke_i,
		e: invoke_ii,
		b: invoke_iii,
		h: invoke_iiii,
		i: invoke_iiiii,
		n: invoke_iiiiii,
		r: invoke_iiiiiii,
		Qa: invoke_iiiiiiiiii,
		c: invoke_v,
		a: invoke_vi,
		g: invoke_vii,
		z: invoke_viidii,
		f: invoke_viii,
		l: invoke_viiii,
		d: invoke_viiiii,
		y: invoke_viiiiii,
		Ra: _js_popen_to_file,
		Ha: _makecontext,
		Na: _posix_spawnp,
		Ba: _proc_exit,
		Ja: _strptime,
		Ia: _swapcontext,
		Fa: _vrzno_del_callback,
		Ga: _vrzno_exec_callback,
		F: _wasm_poll_socket,
		m: _wasm_setsockopt,
	};
	var wasmExports = createWasm();
	var ___wasm_call_ctors = () => (___wasm_call_ctors = wasmExports['Ta'])();
	var _wasm_popen = (Module['_wasm_popen'] = (a0, a1) =>
		(_wasm_popen = Module['_wasm_popen'] = wasmExports['Ua'])(a0, a1));
	var _wasm_pclose = (Module['_wasm_pclose'] = (a0) =>
		(_wasm_pclose = Module['_wasm_pclose'] = wasmExports['Va'])(a0));
	var _php_pollfd_for = (Module['_php_pollfd_for'] = (a0, a1, a2) =>
		(_php_pollfd_for = Module['_php_pollfd_for'] = wasmExports['Wa'])(
			a0,
			a1,
			a2
		));
	var _malloc = (a0) => (_malloc = wasmExports['Ya'])(a0);
	var _fflush = (a0) => (_fflush = wasmExports['Za'])(a0);
	var _htons = (a0) => (_htons = wasmExports['_a'])(a0);
	var _ntohs = (a0) => (_ntohs = wasmExports['$a'])(a0);
	var _htonl = (a0) => (_htonl = wasmExports['ab'])(a0);
	var _wasm_set_phpini_path = (Module['_wasm_set_phpini_path'] = (a0) =>
		(_wasm_set_phpini_path = Module['_wasm_set_phpini_path'] =
			wasmExports['bb'])(a0));
	var _wasm_set_phpini_entries = (Module['_wasm_set_phpini_entries'] = (a0) =>
		(_wasm_set_phpini_entries = Module['_wasm_set_phpini_entries'] =
			wasmExports['cb'])(a0));
	var _wasm_add_SERVER_entry = (Module['_wasm_add_SERVER_entry'] = (a0, a1) =>
		(_wasm_add_SERVER_entry = Module['_wasm_add_SERVER_entry'] =
			wasmExports['db'])(a0, a1));
	var _wasm_add_uploaded_file = (Module['_wasm_add_uploaded_file'] = (
		a0,
		a1,
		a2,
		a3,
		a4,
		a5
	) =>
		(_wasm_add_uploaded_file = Module['_wasm_add_uploaded_file'] =
			wasmExports['eb'])(a0, a1, a2, a3, a4, a5));
	var _wasm_set_query_string = (Module['_wasm_set_query_string'] = (a0) =>
		(_wasm_set_query_string = Module['_wasm_set_query_string'] =
			wasmExports['fb'])(a0));
	var _wasm_set_path_translated = (Module['_wasm_set_path_translated'] = (
		a0
	) =>
		(_wasm_set_path_translated = Module['_wasm_set_path_translated'] =
			wasmExports['gb'])(a0));
	var _wasm_set_skip_shebang = (Module['_wasm_set_skip_shebang'] = (a0) =>
		(_wasm_set_skip_shebang = Module['_wasm_set_skip_shebang'] =
			wasmExports['hb'])(a0));
	var _wasm_set_request_uri = (Module['_wasm_set_request_uri'] = (a0) =>
		(_wasm_set_request_uri = Module['_wasm_set_request_uri'] =
			wasmExports['ib'])(a0));
	var _wasm_set_request_method = (Module['_wasm_set_request_method'] = (a0) =>
		(_wasm_set_request_method = Module['_wasm_set_request_method'] =
			wasmExports['jb'])(a0));
	var _wasm_set_request_host = (Module['_wasm_set_request_host'] = (a0) =>
		(_wasm_set_request_host = Module['_wasm_set_request_host'] =
			wasmExports['kb'])(a0));
	var _wasm_set_content_type = (Module['_wasm_set_content_type'] = (a0) =>
		(_wasm_set_content_type = Module['_wasm_set_content_type'] =
			wasmExports['lb'])(a0));
	var _wasm_set_request_body = (Module['_wasm_set_request_body'] = (a0) =>
		(_wasm_set_request_body = Module['_wasm_set_request_body'] =
			wasmExports['mb'])(a0));
	var _wasm_set_content_length = (Module['_wasm_set_content_length'] = (a0) =>
		(_wasm_set_content_length = Module['_wasm_set_content_length'] =
			wasmExports['nb'])(a0));
	var _wasm_set_cookies = (Module['_wasm_set_cookies'] = (a0) =>
		(_wasm_set_cookies = Module['_wasm_set_cookies'] = wasmExports['ob'])(
			a0
		));
	var _wasm_set_php_code = (Module['_wasm_set_php_code'] = (a0) =>
		(_wasm_set_php_code = Module['_wasm_set_php_code'] = wasmExports['pb'])(
			a0
		));
	var _wasm_set_request_port = (Module['_wasm_set_request_port'] = (a0) =>
		(_wasm_set_request_port = Module['_wasm_set_request_port'] =
			wasmExports['qb'])(a0));
	var _phpwasm_init_uploaded_files_hash = (Module[
		'_phpwasm_init_uploaded_files_hash'
	] = () =>
		(_phpwasm_init_uploaded_files_hash = Module[
			'_phpwasm_init_uploaded_files_hash'
		] =
			wasmExports['rb'])());
	var _phpwasm_register_uploaded_file = (Module[
		'_phpwasm_register_uploaded_file'
	] = (a0) =>
		(_phpwasm_register_uploaded_file = Module[
			'_phpwasm_register_uploaded_file'
		] =
			wasmExports['sb'])(a0));
	var _phpwasm_destroy_uploaded_files_hash = (Module[
		'_phpwasm_destroy_uploaded_files_hash'
	] = () =>
		(_phpwasm_destroy_uploaded_files_hash = Module[
			'_phpwasm_destroy_uploaded_files_hash'
		] =
			wasmExports['tb'])());
	var _wasm_sapi_handle_request = (Module['_wasm_sapi_handle_request'] = () =>
		(_wasm_sapi_handle_request = Module['_wasm_sapi_handle_request'] =
			wasmExports['ub'])());
	var _php_wasm_init = (Module['_php_wasm_init'] = () =>
		(_php_wasm_init = Module['_php_wasm_init'] = wasmExports['vb'])());
	var _exec_callback = (Module['_exec_callback'] = (a0) =>
		(_exec_callback = Module['_exec_callback'] = wasmExports['wb'])(a0));
	var _del_callback = (Module['_del_callback'] = (a0) =>
		(_del_callback = Module['_del_callback'] = wasmExports['xb'])(a0));
	var ___funcs_on_exit = () => (___funcs_on_exit = wasmExports['yb'])();
	var _emscripten_builtin_memalign = (a0, a1) =>
		(_emscripten_builtin_memalign = wasmExports['zb'])(a0, a1);
	var __emscripten_timeout = (a0, a1) =>
		(__emscripten_timeout = wasmExports['Ab'])(a0, a1);
	var _setThrew = (a0, a1) => (_setThrew = wasmExports['Bb'])(a0, a1);
	var __emscripten_tempret_set = (a0) =>
		(__emscripten_tempret_set = wasmExports['Cb'])(a0);
	var __emscripten_stack_restore = (a0) =>
		(__emscripten_stack_restore = wasmExports['Db'])(a0);
	var __emscripten_stack_alloc = (a0) =>
		(__emscripten_stack_alloc = wasmExports['Eb'])(a0);
	var _emscripten_stack_get_current = () =>
		(_emscripten_stack_get_current = wasmExports['Fb'])();
	function invoke_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
		var sp = stackSave();
		try {
			return getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_vi(index, a1) {
		var sp = stackSave();
		try {
			getWasmTableEntry(index)(a1);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_iiii(index, a1, a2, a3) {
		var sp = stackSave();
		try {
			return getWasmTableEntry(index)(a1, a2, a3);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_iii(index, a1, a2) {
		var sp = stackSave();
		try {
			return getWasmTableEntry(index)(a1, a2);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_vii(index, a1, a2) {
		var sp = stackSave();
		try {
			getWasmTableEntry(index)(a1, a2);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_ii(index, a1) {
		var sp = stackSave();
		try {
			return getWasmTableEntry(index)(a1);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_viii(index, a1, a2, a3) {
		var sp = stackSave();
		try {
			getWasmTableEntry(index)(a1, a2, a3);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_v(index) {
		var sp = stackSave();
		try {
			getWasmTableEntry(index)();
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_i(index) {
		var sp = stackSave();
		try {
			return getWasmTableEntry(index)();
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_viiii(index, a1, a2, a3, a4) {
		var sp = stackSave();
		try {
			getWasmTableEntry(index)(a1, a2, a3, a4);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_viiiii(index, a1, a2, a3, a4, a5) {
		var sp = stackSave();
		try {
			getWasmTableEntry(index)(a1, a2, a3, a4, a5);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_iiiiii(index, a1, a2, a3, a4, a5) {
		var sp = stackSave();
		try {
			return getWasmTableEntry(index)(a1, a2, a3, a4, a5);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_iiiii(index, a1, a2, a3, a4) {
		var sp = stackSave();
		try {
			return getWasmTableEntry(index)(a1, a2, a3, a4);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
		var sp = stackSave();
		try {
			return getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6, a7, a8, a9);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_viidii(index, a1, a2, a3, a4, a5) {
		var sp = stackSave();
		try {
			getWasmTableEntry(index)(a1, a2, a3, a4, a5);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	function invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {
		var sp = stackSave();
		try {
			getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}
	Module['addRunDependency'] = addRunDependency;
	Module['removeRunDependency'] = removeRunDependency;
	Module['ccall'] = ccall;
	Module['UTF8ToString'] = UTF8ToString;
	Module['lengthBytesUTF8'] = lengthBytesUTF8;
	Module['FS_createPreloadedFile'] = FS_createPreloadedFile;
	Module['FS_unlink'] = FS_unlink;
	Module['FS_createPath'] = FS_createPath;
	Module['FS_createDevice'] = FS_createDevice;
	Module['FS'] = FS;
	Module['FS_createDataFile'] = FS_createDataFile;
	Module['FS_createLazyFile'] = FS_createLazyFile;
	var calledRun;
	dependenciesFulfilled = function runCaller() {
		if (!calledRun) run();
		if (!calledRun) dependenciesFulfilled = runCaller;
	};
	function run() {
		if (runDependencies > 0) {
			return;
		}
		preRun();
		if (runDependencies > 0) {
			return;
		}
		function doRun() {
			if (calledRun) return;
			calledRun = true;
			Module['calledRun'] = true;
			if (ABORT) return;
			initRuntime();
			Module['onRuntimeInitialized']?.();
			postRun();
		}
		if (Module['setStatus']) {
			Module['setStatus']('Running...');
			setTimeout(function () {
				setTimeout(function () {
					Module['setStatus']('');
				}, 1);
				doRun();
			}, 1);
		} else {
			doRun();
		}
	}
	if (Module['preInit']) {
		if (typeof Module['preInit'] == 'function')
			Module['preInit'] = [Module['preInit']];
		while (Module['preInit'].length > 0) {
			Module['preInit'].pop()();
		}
	}
	run();
	return PHPLoader;
}
