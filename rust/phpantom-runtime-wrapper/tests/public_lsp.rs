use phpantom_runtime_wrapper::Runtime;
use serde_json::{Value, json};

fn request(runtime: &Runtime, id: u64, method: &str, params: Value) -> Value {
    let message = json!({"jsonrpc":"2.0", "id":id, "method":method, "params":params});
    let response = runtime
        .handle(&message.to_string())
        .unwrap_or_else(|| panic!("{method} did not return a response"));
    let response: Value =
        serde_json::from_str(&response).expect("dispatcher returns JSON-RPC JSON");
    assert_eq!(response["id"], id, "{method} preserves the request id");
    assert!(
        response.get("error").is_none(),
        "{method} returned an error: {response}"
    );
    response
}

fn notify(runtime: &Runtime, method: &str, params: Value) {
    let message = json!({"jsonrpc":"2.0", "method":method, "params":params});
    assert_eq!(runtime.handle(&message.to_string()), None);
}

fn initialize(runtime: &Runtime, id: u64, version: &str) -> Value {
    let response = request(
        runtime,
        id,
        "initialize",
        json!({
            "capabilities": {},
            "initializationOptions": {"phpVersion": version}
        }),
    );
    assert!(
        response.get("error").is_none(),
        "initialize {version}: {response}"
    );
    assert_eq!(
        response["result"]["serverInfo"]["version"],
        format!("0.11.1+php-version-setting.3:php{version}")
    );
    response
}

fn open(runtime: &Runtime, uri: &str, version: i32, text: &str) {
    notify(
        runtime,
        "textDocument/didOpen",
        json!({"textDocument": {"uri":uri, "languageId":"php", "version":version, "text":text}}),
    );
}

fn change(runtime: &Runtime, uri: &str, version: i32, text: &str) {
    notify(
        runtime,
        "textDocument/didChange",
        json!({"textDocument": {"uri":uri, "version":version}, "contentChanges":[{"text":text}]}),
    );
}

fn completion(runtime: &Runtime, id: u64, uri: &str, text: &str, needle: &str) -> Value {
    let line_index = text
        .lines()
        .position(|line| line.contains(needle))
        .unwrap_or_else(|| panic!("missing {needle:?} in {text:?}"));
    let line = text.lines().nth(line_index).unwrap();
    let character = line.find(needle).unwrap() + needle.len();
    request(
        runtime,
        id,
        "textDocument/completion",
        json!({"textDocument":{"uri":uri}, "position":{"line":line_index, "character":character}}),
    )
}

fn items(response: &Value) -> &[Value] {
    let result = &response["result"];
    assert!(!result.is_null(), "completion returned a null result");
    result["items"]
        .as_array()
        .or_else(|| result.as_array())
        .map(Vec::as_slice)
        .expect("completion returns a list or completion list")
}

fn has_completion(response: &Value, name: &str) -> bool {
    items(response).iter().any(|item| {
        item["label"].as_str() == Some(name) || item["filterText"].as_str() == Some(name)
    })
}

#[test]
fn public_dispatcher_runs_initialize_open_completion_resolve_and_signature_help() {
    let runtime = Runtime::new();
    let init = initialize(&runtime, 1, "8.5");
    assert_eq!(
        init["result"]["capabilities"]["completionProvider"]["resolveProvider"],
        true
    );
    assert!(init["result"]["capabilities"]["signatureHelpProvider"].is_object());

    let uri = "file:///wrapper/public-lsp.php";
    let source = "<?php\nclass Widget { public function run(string $message): string { return $message; } }\n$widget = new Widget();\n$widget->run(\n";
    open(&runtime, uri, 1, source);
    let completion_response = completion(&runtime, 2, uri, source, "->");
    let run = items(&completion_response)
        .iter()
        .find(|item| {
            item["label"]
                .as_str()
                .is_some_and(|label| label.starts_with("run"))
        })
        .expect("member completion comes from PHPantom");
    let resolved = request(&runtime, 3, "completionItem/resolve", run.clone());
    assert_eq!(resolved["result"]["label"], run["label"]);

    let line = source.lines().last().unwrap();
    let signature = request(
        &runtime,
        4,
        "textDocument/signatureHelp",
        json!({"textDocument":{"uri":uri}, "position":{"line":3, "character":line.len()}}),
    );
    assert!(
        signature["result"]["signatures"][0]["label"]
            .as_str()
            .is_some_and(|label| label.contains("message"))
    );

    let virtual_uri = "file:///wrapper/virtual-parameter.php";
    let virtual_source = "<?php\n/** @param string $virtualOption */\nfunction wrapper_virtual(string $base): void { func_get_args(); }\nwrapper_virtual(\n";
    open(&runtime, virtual_uri, 1, virtual_source);
    let virtual_signature = request(
        &runtime,
        5,
        "textDocument/signatureHelp",
        json!({"textDocument":{"uri":virtual_uri}, "position":{"line":3, "character":virtual_source.lines().last().unwrap().len()}}),
    );
    assert!(
        virtual_signature["result"]["signatures"][0]["label"]
            .as_str()
            .is_some_and(|label| label.contains("virtualOption"))
    );
}

#[test]
fn every_supported_php_version_initializes_in_a_fresh_session() {
    for (id, version) in [
        "5.6", "7.0", "7.1", "7.2", "7.3", "7.4", "8.0", "8.1", "8.2", "8.3", "8.4", "8.5",
    ]
    .into_iter()
    .enumerate()
    {
        let runtime = Runtime::new();
        initialize(&runtime, id as u64 + 1, version);
    }
}

#[test]
fn fresh_session_cold_warm_versions_and_parameter_boundaries_use_public_requests() {
    for (cycle_index, version, expected_str_contains) in
        [(0, "7.4", false), (1, "8.5", true), (2, "7.4", false)]
    {
        let runtime = Runtime::new();
        initialize(&runtime, 10 + cycle_index, version);
        let uri = format!("file:///wrapper/{cycle_index}-{version}-str.php");
        let text = "<?php\nstr_c";
        open(&runtime, &uri, 1, text);
        let cold = completion(&runtime, 20 + cycle_index * 3, &uri, text, "str_c");
        assert_eq!(
            has_completion(&cold, "str_contains"),
            expected_str_contains,
            "{version} cold str_contains"
        );

        let sibling_uri = format!("file:///wrapper/{cycle_index}-{version}-strlen.php");
        let sibling_text = "<?php\nstrl";
        open(&runtime, &sibling_uri, 1, sibling_text);
        let sibling = completion(
            &runtime,
            21 + cycle_index * 3,
            &sibling_uri,
            sibling_text,
            "strl",
        );
        let strlen = items(&sibling)
            .iter()
            .find(|item| item["filterText"] == "strlen")
            .expect("strlen resolves as a sibling builtin");
        request(
            &runtime,
            22 + cycle_index * 3,
            "completionItem/resolve",
            strlen.clone(),
        );

        change(&runtime, &uri, 2, text);
        let warm = completion(&runtime, 23 + cycle_index * 3, &uri, text, "str_c");
        assert_eq!(
            has_completion(&warm, "str_contains"),
            expected_str_contains,
            "{version} warm str_contains after sibling resolve"
        );
    }

    for (version, expected_intdiv, expected_array_key_first) in [
        ("5.6", false, false),
        ("7.0", true, false),
        ("7.2", true, false),
        ("7.3", true, true),
    ] {
        let target_runtime = Runtime::new();
        initialize(&target_runtime, 20, version);
        let intdiv_uri = format!("file:///wrapper/{version}-intdiv.php");
        let intdiv_source = "<?php\nintd";
        open(&target_runtime, &intdiv_uri, 1, intdiv_source);
        let intdiv_cold = completion(&target_runtime, 21, &intdiv_uri, intdiv_source, "intd");
        let abs_uri = format!("file:///wrapper/{version}-abs.php");
        let abs_source = "<?php\nab";
        open(&target_runtime, &abs_uri, 1, abs_source);
        let abs = completion(&target_runtime, 22, &abs_uri, abs_source, "ab");
        let abs_item = items(&abs)
            .iter()
            .find(|item| item["filterText"] == "abs")
            .expect("abs resolves as a sibling builtin");
        request(
            &target_runtime,
            23,
            "completionItem/resolve",
            abs_item.clone(),
        );
        change(&target_runtime, &intdiv_uri, 2, intdiv_source);
        let intdiv_warm = completion(&target_runtime, 24, &intdiv_uri, intdiv_source, "intd");
        assert_eq!(
            has_completion(&intdiv_cold, "intdiv"),
            expected_intdiv,
            "{version} cold intdiv"
        );
        assert_eq!(
            has_completion(&intdiv_warm, "intdiv"),
            expected_intdiv,
            "{version} warm intdiv"
        );

        let array_uri = format!("file:///wrapper/{version}-array.php");
        let array_source = "<?php\narray_k";
        open(&target_runtime, &array_uri, 1, array_source);
        let cold = completion(&target_runtime, 25, &array_uri, array_source, "array_k");
        assert_eq!(
            has_completion(&cold, "array_key_first"),
            expected_array_key_first,
            "{version} cold array_key_first"
        );
        change(&target_runtime, &array_uri, 2, array_source);
        let warm = completion(&target_runtime, 26, &array_uri, array_source, "array_k");
        assert_eq!(
            has_completion(&warm, "array_key_first"),
            expected_array_key_first,
            "{version} warm array_key_first"
        );
    }

    for (version, expected_before_needle) in [("8.0", false), ("8.3", true)] {
        let target_runtime = Runtime::new();
        initialize(&target_runtime, 30, version);
        let source = "<?php\nstrrchr(";
        let parameter_uri = format!("file:///wrapper/{version}-strrchr.php");
        open(&target_runtime, &parameter_uri, 1, source);
        let cold = completion(&target_runtime, 31, &parameter_uri, source, "strrchr(");
        change(&target_runtime, &parameter_uri, 2, source);
        let warm = completion(&target_runtime, 32, &parameter_uri, source, "strrchr(");
        assert_eq!(
            has_completion(&cold, "before_needle"),
            expected_before_needle,
            "{version} cold parameter"
        );
        assert_eq!(
            has_completion(&warm, "before_needle"),
            expected_before_needle,
            "{version} warm parameter"
        );

        let signature_source = "<?php\nstrrchr(\"haystack\", ";
        let signature_uri = format!("file:///wrapper/{version}-strrchr-signature.php");
        open(&target_runtime, &signature_uri, 1, signature_source);
        let line = signature_source.lines().last().unwrap();
        let signature = request(
            &target_runtime,
            33,
            "textDocument/signatureHelp",
            json!({"textDocument":{"uri":signature_uri}, "position":{"line":1, "character":line.len()}}),
        );
        let signature_label = signature["result"]["signatures"][0]["label"]
            .as_str()
            .expect("strrchr signature is returned");
        assert_eq!(
            signature_label.contains("before_needle"),
            expected_before_needle,
            "{version} signature parameter boundary: {signature_label}"
        );
    }
}
