<?php

declare(strict_types=1);

// Measurement-only mirror of src/lsp/phpactor/dispatch.php. Keep its request,
// Phpactor boot, handler, and LSP mapping behavior aligned with that source.
$profile = true;
$timings = [];
$mark = static function (string $name) use (&$timings, &$profile): void {
	if ($profile) {
		$timings[$name] = hrtime(true);
	}
};
$finish = static function (string $name) use (&$timings, &$profile): void {
	if ($profile) {
		$timings[$name] = (hrtime(true) - $timings[$name]) / 1_000_000;
	}
};

$mark('autoload');
require '/phpactor/vendor/autoload.php';
$finish('autoload');

try {
	$mark('request_decode');
	$request = json_decode(file_get_contents('/tmp/phpactor-request.json'), true, flags: JSON_THROW_ON_ERROR);
	$finish('request_decode');
	$phpVersion = $request['phpVersion'];
	$root = $request['workspaceRoot'] ?? '/workspace';
	$config = json_encode(['php.version' => $phpVersion], JSON_THROW_ON_ERROR);
	$input = new Symfony\Component\Console\Input\ArgvInput([
		'phpactor',
		'rpc',
		'--working-dir=' . $root,
		'--config-extra=' . $config,
	]);

	// Phpactor::boot contains container creation, extension configuration,
	// loading, booting, and container build; this timer deliberately reports it
	// as one aggregate and does not infer sub-costs.
	$mark('phpactor_boot_container_build');
	$container = Phpactor\Phpactor::boot(
		$input,
		new Symfony\Component\Console\Output\NullOutput(),
		'/phpactor',
		'/phpactor/bin/phpactor'
	);
	$finish('phpactor_boot_container_build');
	$source = $request['textDocument']['text'];
	$offset = $request['offset'];
	$result = null;

	switch ($request['operation']) {
		case 'completion':
			$handler = new Phpactor\Extension\CompletionRpc\Handler\CompleteHandler(
				$container->get(Phpactor\Extension\Completion\CompletionExtension::SERVICE_REGISTRY)
			);
			$mark('completion_handler');
			$response = $handler->handle([
				'source' => $source,
				'type' => 'php',
				'offset' => $offset,
			]);
			$finish('completion_handler');
			$mark('adapter_mapping');
			$suggestions = $response->value()['suggestions'];
			$items = array_map(static function (array $suggestion): array {
				$item = [
					'label' => $suggestion['label'],
					'insertText' => $suggestion['snippet'] ?: $suggestion['name'],
					'detail' => $suggestion['short_description'],
					'documentation' => $suggestion['documentation'],
				];
				$kind = Phpactor\Extension\LanguageServerCompletion\Util\PhpactorToLspCompletionType::fromPhpactorType($suggestion['type']);
				if (null !== $kind) {
					$item['kind'] = $kind;
				}
				if ($suggestion['snippet']) {
					$item['insertTextFormat'] = Phpactor\LanguageServerProtocol\InsertTextFormat::SNIPPET;
				}
				return $item;
			}, $suggestions);
			$result = ['isIncomplete' => false, 'items' => $items];
			$finish('adapter_mapping');
			break;

		case 'signatureHelp':
			$mark('signature_handler_and_mapping');
			$helper = $container->get(Phpactor\Extension\Completion\CompletionExtension::SERVICE_SIGNATURE_HELPER);
			try {
				$help = $helper->signatureHelp(
					Phpactor\TextDocument\TextDocumentBuilder::create($source)->language('php')->build(),
					Phpactor\TextDocument\ByteOffset::fromInt($offset)
				);
				$result = Phpactor\Extension\LanguageServerCompletion\Util\PhpactorToLspSignature::toLspSignatureHelp($help);
			} catch (Phpactor\Completion\Core\Exception\CouldNotHelpWithSignature) {
				$result = null;
			}
			$finish('signature_handler_and_mapping');
			break;

		case 'hover':
			$mark('hover_handler_and_mapping');
			$handler = $container->get('class_mover.handler.hover');
			$response = $handler->handle(['source' => $source, 'offset' => $offset]);
			$result = ['contents' => ['kind' => 'markdown', 'value' => $response->message()]];
			$finish('hover_handler_and_mapping');
			break;

		default:
			throw new InvalidArgumentException('Unsupported Phpactor operation');
	}
	$mark('response_encode');
	$encoded = json_encode($result, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
	$finish('response_encode');
	if ($profile) {
		echo json_encode(['result' => $result, 'timingsMs' => $timings], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
	} else {
		echo $encoded;
	}
} catch (Throwable $error) {
	echo json_encode(['error' => $error->getMessage()], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
}
