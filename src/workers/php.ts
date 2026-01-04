// Web Worker for executing PHP code via WASM

import {JavascriptRuntime, PHP, PHPLoaderModule, startPHP, Version} from "../php-wasm/php";

const phpWasmLoaders = import.meta.glob('../wasm-assets/php-*.js', { eager: true }) as Record<string, PHPLoaderModule>;

function loadPHPLoaderModule(v: Version): PHPLoaderModule {
    const loader = phpWasmLoaders[`../wasm-assets/php-${v}.js`];
    if (!loader) {
        throw Error(`PHP ${v} assets not found.`);
    }
    return loader;
}

export async function initPHP(v: Version, runtime?: JavascriptRuntime): Promise<PHP> {
    const PHPLoaderModule = loadPHPLoaderModule(v);
    return startPHP(v, PHPLoaderModule, runtime ||'WEBWORKER', {
        locateFile: (path: string) => {
            const cleanPath = path.split('?')[0];
            // Always load WASM files from the root assets directory
            // This ensures correct paths in both dev and production environments
            if (cleanPath.endsWith('.wasm')) {
                return `/${path}`;
            }
            return path;
        }
    });
}

export async function runPHP(php: PHP, code: string): Promise<string> {
    const output = php.run({ code });
    return new TextDecoder().decode(output.body);
}