<?php

declare(strict_types=1);

use Phpactor\Extension\WorseReflection\WorseReflectionExtension;
use Phpactor\Phpactor;
use Symfony\Component\Console\Input\ArgvInput;
use Symfony\Component\Console\Output\NullOutput;

if ($argc !== 3) {
	fwrite(STDERR, "Usage: prepare-stub-map.php <phpactor-root> <cache-output-root>\n");
	exit(2);
}

$root = realpath($argv[1]);
$outputRoot = $argv[2];
if (false === $root || !is_file($root . '/vendor/autoload.php')) {
	fwrite(STDERR, "Phpactor root must contain vendor/autoload.php\n");
	exit(2);
}

require $root . '/vendor/autoload.php';
$input = new ArgvInput([
	'phpactor',
	'rpc',
	'--working-dir=' . $root,
	'--config-extra={"php.version":"8.2"}',
]);
$container = Phpactor::boot($input, new NullOutput(), $root, $root . '/bin/phpactor');
$container->get(WorseReflectionExtension::SERVICE_REFLECTOR)->reflectFunction('strlen');

$hostStubRoot = realpath($root . '/vendor/jetbrains/phpstorm-stubs');
if (false === $hostStubRoot) {
	fwrite(STDERR, "PhpStorm stubs are missing from the Phpactor PHAR\n");
	exit(1);
}
$hostCacheRoot = getenv('XDG_CACHE_HOME') . '/phpactor/worse-reflection';
$hostCachePath = $hostCacheRoot . '/' . md5($hostStubRoot) . '.map';
if (!is_file($hostCachePath)) {
	fwrite(STDERR, "Phpactor did not generate its PhpStorm stub map at $hostCachePath\n");
	exit(1);
}

$map = unserialize((string)file_get_contents($hostCachePath), ['allowed_classes' => false]);
if (!is_array($map)) {
	fwrite(STDERR, "Phpactor generated an invalid serialized stub map\n");
	exit(1);
}
$wasmStubRoot = '/phpactor/vendor/jetbrains/phpstorm-stubs';
foreach ($map as &$path) {
	if (is_string($path) && str_starts_with($path, $hostStubRoot . '/')) {
		$path = $wasmStubRoot . substr($path, strlen($hostStubRoot));
	}
}
unset($path);

$wasmCacheRoot = $outputRoot . '/phpactor/worse-reflection';
if (!is_dir($wasmCacheRoot) && !mkdir($wasmCacheRoot, 0777, true) && !is_dir($wasmCacheRoot)) {
	fwrite(STDERR, "Could not create generated cache directory $wasmCacheRoot\n");
	exit(1);
}
$wasmCachePath = $wasmCacheRoot . '/' . md5($wasmStubRoot) . '.map';
file_put_contents($wasmCachePath, serialize($map));
printf("Prepared %d PhpStorm stub entries at %s\n", count($map), $wasmCachePath);
