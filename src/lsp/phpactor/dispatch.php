<?php

declare(strict_types=1);

require '/phpactor/vendor/autoload.php';

try {
	$request = json_decode(file_get_contents('/tmp/phpactor-request.json'), true, flags: JSON_THROW_ON_ERROR);
	$phpVersion = $request['phpVersion'];
	$root = $request['workspaceRoot'] ?? '/workspace';
	$config = json_encode(['php.version' => $phpVersion], JSON_THROW_ON_ERROR);
	$input = new Symfony\Component\Console\Input\ArgvInput([
		'phpactor',
		'rpc',
		'--working-dir=' . $root,
		'--config-extra=' . $config,
	]);
	$container = Phpactor\Phpactor::boot(
		$input,
		new Symfony\Component\Console\Output\NullOutput(),
		'/phpactor',
		'/phpactor/bin/phpactor'
	);
	$source = $request['textDocument']['text'];
	$offset = $request['offset'];
	$result = null;

	switch ($request['operation']) {
		case 'completion':
			$handler = new Phpactor\Extension\CompletionRpc\Handler\CompleteHandler(
				$container->get(Phpactor\Extension\Completion\CompletionExtension::SERVICE_REGISTRY)
			);
			$response = $handler->handle([
				'source' => $source,
				'type' => 'php',
				'offset' => $offset,
			]);
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
			break;

		case 'signatureHelp':
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
			break;

		case 'hover':
			$handler = $container->get('class_mover.handler.hover');
			$response = $handler->handle(['source' => $source, 'offset' => $offset]);
			$result = ['contents' => ['kind' => 'markdown', 'value' => $response->message()]];
			break;

		default:
			throw new InvalidArgumentException('Unsupported Phpactor operation');
	}

	echo json_encode($result, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $error) {
	echo json_encode(['error' => $error->getMessage()], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
}
