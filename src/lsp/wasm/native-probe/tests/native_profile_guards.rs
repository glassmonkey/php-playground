use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::LanguageServer;
use tower_lsp_server::gen_lsp_types::*;

fn backend() -> Backend {
    let backend = Backend::new_headless();
    backend.set_php_version(PhpVersion::new(7, 4));
    backend
}

async fn open(backend: &Backend, uri: &Uri, source: &str) {
    backend
        .did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri.clone(),
                language_id: "php".to_string().into(),
                version: 1,
                text: source.to_string(),
            },
        })
        .await;
}

async fn complete(backend: &Backend, uri: &Uri, line: u32, character: u32) -> Vec<CompletionItem> {
    let response = backend
        .completion(CompletionParams {
            text_document_position_params: TextDocumentPositionParams {
                text_document: TextDocumentIdentifier { uri: uri.clone() },
                position: Position { line, character },
            },
            work_done_progress_params: WorkDoneProgressParams::default(),
            partial_result_params: PartialResultParams::default(),
            context: None,
        })
        .await
        .unwrap();
    match response {
        Some(CompletionResponse::CompletionItemList(items)) => items,
        Some(CompletionResponse::CompletionList(list)) => list.items,
        None => Vec::new(),
    }
}

fn signature_params(signature: &SignatureHelp) -> Vec<String> {
    let signature = signature.signatures.first().expect("one signature");
    signature
        .parameters
        .as_ref()
        .expect("signature parameters")
        .iter()
        .map(|parameter| match &parameter.label {
            ParameterInformationLabel::String(label) => label.clone(),
            ParameterInformationLabel::Tuple((start, end)) => {
                signature.label[*start as usize..*end as usize].to_string()
            }
        })
        .collect()
}

async fn signature_help(
    backend: &Backend,
    uri: &Uri,
    line: u32,
    character: u32,
) -> Option<SignatureHelp> {
    backend
        .signature_help(SignatureHelpParams {
            text_document_position_params: TextDocumentPositionParams {
                text_document: TextDocumentIdentifier { uri: uri.clone() },
                position: Position { line, character },
            },
            work_done_progress_params: WorkDoneProgressParams::default(),
            context: None,
        })
        .await
        .unwrap()
}

#[tokio::test]
async fn adjacent_core_function_without_since_remains_available() {
    let backend = backend();
    let uri = Uri::parse("file:///core_neighbour_without_since.php").unwrap();
    let source = "<?php\nstrncase";
    open(&backend, &uri, source).await;
    let items = complete(&backend, &uri, 1, "strncase".len() as u32).await;
    assert!(
        items
            .iter()
            .any(|item| item.label.starts_with("strncasecmp")),
        "the nearby Core.php function without @since must remain available: {:?}",
        items.iter().map(|item| &item.label).collect::<Vec<_>>()
    );
}

#[tokio::test]
async fn user_phpdoc_virtual_function_and_method_parameters_survive() {
    let backend = backend();
    let function_uri = Uri::parse("file:///user_virtual_function_parameter.php").unwrap();
    let function_source = concat!(
        "<?php\n",
        "/**\n",
        " * @param string $virtualFunctionOption User PHPDoc parameter.\n",
        " */\n",
        "function user_profile_call(...$args): void {}\n",
        "user_profile_call("
    );
    open(&backend, &function_uri, function_source).await;
    let function_cursor = "user_profile_call(".len() as u32;
    let function_signature = signature_help(&backend, &function_uri, 5, function_cursor)
        .await
        .expect("user-defined function signature");
    let function_parameters = signature_params(&function_signature);
    assert!(
        function_parameters
            .iter()
            .any(|parameter| parameter.contains("virtualFunctionOption")),
        "PHP 7.4 must keep a user-defined virtual @param: {function_parameters:?}"
    );

    let method_uri = Uri::parse("file:///user_virtual_method_parameter.php").unwrap();
    let method_source = concat!(
        "<?php\n",
        "class VersionProfileUserMethod {\n",
        "    /**\n",
        "     * @param string $virtualMethodOption User method PHPDoc parameter.\n",
        "     */\n",
        "    public function execute(int $id): void {}\n",
        "}\n",
        "$profile = new VersionProfileUserMethod();\n",
        "$profile->execute("
    );
    open(&backend, &method_uri, method_source).await;
    let method_cursor = "$profile->execute(".len() as u32;
    let method_signature = signature_help(&backend, &method_uri, 8, method_cursor)
        .await
        .expect("user-defined method signature");
    let method_parameters = signature_params(&method_signature);
    assert!(
        method_parameters
            .iter()
            .any(|parameter| parameter.contains("id")),
        "PHP 7.4 must retain the method's declared native parameter: {method_parameters:?}"
    );
    assert!(
        method_parameters
            .iter()
            .any(|parameter| parameter.contains("virtualMethodOption")),
        "PHP 7.4 must keep a user method's virtual @param: {method_parameters:?}"
    );
}
