use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::LanguageServer;
use tower_lsp_server::gen_lsp_types::*;

fn backend(major: u8, minor: u8) -> Backend {
    let backend = Backend::new_headless();
    backend.set_php_version(PhpVersion::new(major, minor));
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

fn labels(items: &[CompletionItem]) -> Vec<&str> {
    items.iter().map(|item| item.label.as_str()).collect()
}

fn record(failures: &mut Vec<String>, label: &str, passed: bool, actual: impl std::fmt::Debug) {
    if passed {
        eprintln!("PASS {label}");
    } else {
        let failure = format!("{label}: actual={actual:?}");
        eprintln!("FAIL {failure}");
        failures.push(failure);
    }
}

fn finish(failures: &[String]) {
    assert!(
        failures.is_empty(),
        "{} failed native checks: {failures:#?}",
        failures.len()
    );
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

async fn builtin_case(major: u8, minor: u8, expected: bool) {
    let mut failures = Vec::new();
    let backend = backend(major, minor);
    let string_uri = Uri::parse("file:///versioned_str_contains.php").unwrap();
    open(&backend, &string_uri, "<?php\nstr_con").await;
    let cold_string = complete(&backend, &string_uri, 1, 7).await;
    let cold_string_labels = labels(&cold_string);
    record(
        &mut failures,
        &format!("PHP {major}.{minor} cold str_contains"),
        cold_string_labels.contains(&"str_contains") == expected,
        &cold_string_labels,
    );

    for (prefix, symbol) in [("array_f", "array_first"), ("array_l", "array_last")] {
        let uri = Uri::parse(&format!("file:///versioned_{symbol}.php")).unwrap();
        open(&backend, &uri, &format!("<?php\n{prefix}")).await;
        let items = complete(&backend, &uri, 1, prefix.len() as u32).await;
        let actual = labels(&items);
        record(
            &mut failures,
            &format!("PHP {major}.{minor} cold {symbol}"),
            actual.contains(&symbol) == expected,
            &actual,
        );
    }

    let abs_uri = Uri::parse("file:///sibling_resolve.php").unwrap();
    open(&backend, &abs_uri, "<?php\nabs").await;
    let abs_items = complete(&backend, &abs_uri, 1, 3).await;
    let abs = abs_items.iter().find(|item| item.label == "abs");
    record(
        &mut failures,
        &format!("PHP {major}.{minor} sibling abs completion"),
        abs.is_some(),
        &labels(&abs_items),
    );
    if let Some(abs) = abs {
        let resolved = backend.completion_resolve(abs.clone()).await.unwrap();
        record(
            &mut failures,
            &format!("PHP {major}.{minor} sibling abs resolve"),
            resolved.label == abs.label,
            &resolved.label,
        );
    }

    let warm_string_items = complete(&backend, &string_uri, 1, 7).await;
    let warm_string = labels(&warm_string_items);
    record(
        &mut failures,
        &format!("PHP {major}.{minor} warm str_contains after sibling resolve"),
        warm_string.contains(&"str_contains") == expected,
        &warm_string,
    );
    for (prefix, symbol) in [("array_f", "array_first"), ("array_l", "array_last")] {
        let uri = Uri::parse(&format!("file:///warm_{symbol}.php")).unwrap();
        open(&backend, &uri, &format!("<?php\n{prefix}")).await;
        let items = complete(&backend, &uri, 1, prefix.len() as u32).await;
        let actual = labels(&items);
        record(
            &mut failures,
            &format!("PHP {major}.{minor} warm {symbol} after sibling resolve"),
            actual.contains(&symbol) == expected,
            &actual,
        );
    }
    finish(&failures);
}

#[tokio::test]
async fn php74_cold_warm_builtin_and_sibling_resolve() {
    builtin_case(7, 4, false).await;
}

#[tokio::test]
async fn php85_cold_warm_builtin_and_sibling_resolve() {
    builtin_case(8, 5, true).await;
}

#[tokio::test]
async fn php74_same_name_user_function_and_local_symbols_survive() {
    let mut failures = Vec::new();
    let backend = backend(7, 4);
    let uri = Uri::parse("file:///same_name_user_function.php").unwrap();
    let source = concat!(
        "<?php\n",
        "namespace EvalProbe;\n",
        "/**\n",
        " * EVAL_USER_SAME_NAME_MARKER\n",
        " */\n",
        "function str_contains(string $haystack, string $needle): bool {}\n",
        "function local_probe_function(string $label): void {}\n",
        "class LocalProbe { public function member_probe(): void {} }\n",
        "$localProbe = new LocalProbe();\n",
        "str_con\n",
        "local_probe_f\n",
        "$localP\n",
        "$localProbe->",
    );
    open(&backend, &uri, source).await;

    let same_name = complete(&backend, &uri, 9, 7).await;
    record(
        &mut failures,
        "PHP 7.4 same-name user function completion",
        same_name.iter().any(|item| {
            item.filter_text
                .as_deref()
                .is_some_and(|name| name.eq_ignore_ascii_case("str_contains"))
                && item
                    .data
                    .as_ref()
                    .and_then(|data| data.get("m"))
                    .and_then(|name| name.as_str())
                    .is_some_and(|name| name.eq_ignore_ascii_case("EvalProbe\\str_contains"))
        }),
        &same_name
            .iter()
            .map(|item| (&item.label, &item.filter_text, &item.data))
            .collect::<Vec<_>>(),
    );
    if let Some(item) = same_name.iter().find(|item| {
        item.filter_text
            .as_deref()
            .is_some_and(|name| name.eq_ignore_ascii_case("str_contains"))
            && item
                .data
                .as_ref()
                .and_then(|data| data.get("m"))
                .and_then(|name| name.as_str())
                .is_some_and(|name| name.eq_ignore_ascii_case("EvalProbe\\str_contains"))
    }) {
        let resolved = backend.completion_resolve(item.clone()).await.unwrap();
        let details = format!("{:?} {:?}", resolved.detail, resolved.documentation);
        record(
            &mut failures,
            "PHP 7.4 same-name user signature resolve",
            resolved.detail.as_deref() == Some("bool"),
            &details,
        );
        record(
            &mut failures,
            "PHP 7.4 same-name user documentation marker (known baseline)",
            details.contains("EVAL_USER_SAME_NAME_MARKER"),
            &details,
        );
        eprintln!("INFO PHP 7.4 same-name user documentation resolve: {:?}", resolved.documentation);
    }

    for (line, character, expected) in [
        (10, 13, "local_probe_function"),
        (11, 7, "$localProbe"),
        (12, 13, "member_probe"),
    ] {
        let items = complete(&backend, &uri, line, character).await;
        let actual = labels(&items);
        let found = if expected.starts_with('$') {
            items.iter().any(|item| item.label.contains(expected))
        } else {
            actual.iter().any(|label| label.starts_with(expected))
        };
        record(
            &mut failures,
            &format!("PHP 7.4 {expected} completion at line {line}"),
            found,
            &actual,
        );
    }
    finish(&failures);
}

async fn named_argument_case(major: u8, minor: u8, expected: bool) {
    let backend = backend(major, minor);
    let uri = Uri::parse(&format!("file:///named_arguments_{major}_{minor}.php")).unwrap();
    let source = concat!(
        "<?php\n",
        "function eval_named_feature(string $firstOption, string $secondOption): void {}\n",
        "eval_named_feature("
    );
    open(&backend, &uri, source).await;
    let items = complete(&backend, &uri, 2, "eval_named_feature(".len() as u32).await;
    let params = items
        .iter()
        .filter_map(|item| item.filter_text.as_deref())
        .collect::<Vec<_>>();
    assert_eq!(
        params.contains(&"firstOption"),
        expected,
        "PHP {major}.{minor} named-argument completion: {params:?}"
    );
}

#[tokio::test]
async fn php74_named_argument_feature_boundary() {
    named_argument_case(7, 4, false).await;
}

#[tokio::test]
async fn php85_named_argument_feature_boundary() {
    named_argument_case(8, 5, true).await;
}

async fn strrchr_case(major: u8, minor: u8, expected: bool) {
    let mut failures = Vec::new();
    let backend = backend(major, minor);
    let uri = Uri::parse(&format!("file:///strrchr_{major}_{minor}.php")).unwrap();
    let source = "<?php\nstrrchr(\"haystack\", \"needle\",";
    let line = 1;
    let character = source.lines().nth(line as usize).unwrap().len() as u32;
    open(&backend, &uri, source).await;

    let items = complete(&backend, &uri, line, character).await;
    let parameter_items = items
        .iter()
        .filter_map(|item| item.filter_text.as_deref())
        .collect::<Vec<_>>();
    record(
        &mut failures,
        &format!("PHP {major}.{minor} strrchr parameter completion"),
        parameter_items.contains(&"before_needle") == expected,
        &parameter_items,
    );

    let signature = signature_help(&backend, &uri, line, character).await;
    record(
        &mut failures,
        &format!("PHP {major}.{minor} strrchr signature available"),
        signature.is_some(),
        &signature.as_ref().map(|value| &value.signatures),
    );
    if let Some(signature) = signature {
        let parameters = signature_params(&signature);
        record(
            &mut failures,
            &format!("PHP {major}.{minor} strrchr signature parameter"),
            parameters
                .iter()
                .any(|parameter| parameter.contains("before_needle"))
                == expected,
            &parameters,
        );
    }
    finish(&failures);
}

#[tokio::test]
async fn php80_strrchr_parameter_boundary() {
    strrchr_case(8, 0, false).await;
}

#[tokio::test]
async fn php83_strrchr_parameter_boundary() {
    strrchr_case(8, 3, true).await;
}
