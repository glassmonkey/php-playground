use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};

fn backend(major: u8, minor: u8) -> Backend {
    let backend = Backend::new_headless();
    backend.set_php_version(PhpVersion::new(major, minor));
    backend
}
async fn open_uri(backend: &Backend, source: &str, path: &str) -> Uri {
    let uri = Uri::parse(path).unwrap();
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
    uri
}
async fn open(backend: &Backend, source: &str) -> Uri {
    open_uri(backend, source, "file:///release-quality.php").await
}
async fn warm_function(backend: &Backend, name: &str) {
    let source = format!("<?php\n{}", &name[..name.len() - 1]);
    let uri = open_uri(backend, &source, "file:///warm-sibling.php").await;
    let items = completion(backend, &uri, &source).await;
    backend
        .completion_resolve(selected(&items, name).clone())
        .await
        .unwrap();
}
async fn completion(backend: &Backend, uri: &Uri, source: &str) -> Vec<CompletionItem> {
    let line = source.lines().count() as u32 - 1;
    let response = backend
        .completion(CompletionParams {
            text_document_position_params: TextDocumentPositionParams {
                text_document: TextDocumentIdentifier { uri: uri.clone() },
                position: Position {
                    line,
                    character: source.lines().last().unwrap().len() as u32,
                },
            },
            work_done_progress_params: Default::default(),
            partial_result_params: Default::default(),
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
fn selected<'a>(items: &'a [CompletionItem], fqn: &str) -> &'a CompletionItem {
    items
        .iter()
        .find(|item| {
            item.data
                .as_ref()
                .and_then(|d| d.get("m"))
                .and_then(|s| s.as_str())
                == Some(fqn)
        })
        .unwrap_or_else(|| panic!("Missing selected FQN {fqn}: {items:?}"))
}
fn docs(item: &CompletionItem) -> String {
    match &item.documentation {
        Some(Documentation::MarkupContent(m)) => m.value.clone(),
        Some(Documentation::String(s)) => s.clone(),
        None => String::new(),
    }
}
#[tokio::test]
async fn selected_namespaced_function_keeps_own_docs_and_signature() {
    for (major, minor) in [(7, 4), (8, 5)] {
        let backend = backend(major, minor);
        let source = "<?php\nnamespace App;\n/** OWN_FUNCTION_MARKER\n * @param int $custom OWN_PARAM_MARKER\n * @return string OWN_RETURN_MARKER\n */\nfunction str_contains(int $custom): string {}\nstr_con";
        let uri = open(&backend, source).await;
        let items = completion(&backend, &uri, source).await;
        let resolved = backend
            .completion_resolve(selected(&items, "App\\str_contains").clone())
            .await
            .unwrap();
        let got = docs(&resolved);
        assert!(
            got.contains("OWN_FUNCTION_MARKER")
                && got.contains("OWN_PARAM_MARKER")
                && got.contains("OWN_RETURN_MARKER")
                && got.contains("function str_contains(int $custom): string"),
            "{major}.{minor}: {got:?}"
        );
    }
}
#[tokio::test]
async fn selected_global_function_keeps_global_docs_and_executable_spelling_cold_and_warm() {
    for warm in [false, true] {
        let backend = backend(8, 5);
        let source = "<?php\nnamespace App;\n/** USER_SHADOW_MARKER */\nfunction str_contains(int $ownOnly): string { return 'user'; }\nstr_con";
        let uri = open(&backend, source).await;
        if warm {
            warm_function(&backend, "strlen").await;
            warm_function(&backend, "str_ends_with").await;
        }
        let items = completion(&backend, &uri, source).await;
        let builtin = selected(&items, "str_contains");
        let resolved = backend.completion_resolve(builtin.clone()).await.unwrap();
        let got = docs(&resolved);
        assert!(
            !got.contains("USER_SHADOW_MARKER") && got.contains("string $haystack"),
            "warm={warm}: {got:?}"
        );
        assert!(
            builtin
                .insert_text
                .as_deref()
                .unwrap()
                .starts_with("\\str_contains("),
            "warm={warm}: {:?}",
            builtin.insert_text
        );
    }
}
#[tokio::test]
async fn randomizer_class_availability_agrees_before_and_after_shared_source_resolve() {
    for (major, minor, expected) in [
        (5, 6, false),
        (7, 4, false),
        (8, 0, false),
        (8, 1, false),
        (8, 2, true),
        (8, 5, true),
    ] {
        let backend = backend(major, minor);
        let source = "<?php\nnew Random\\Randomiz";
        let uri = open(&backend, source).await;
        for warm in [false, true] {
            if warm {
                warm_function(&backend, "mt_rand").await;
            }
            let items = completion(&backend, &uri, source).await;
            assert_eq!(
                items.iter().any(|i| i.label.contains("Randomizer")),
                expected,
                "{major}.{minor} warm={warm}: {items:?}"
            );
        }
    }
}
#[tokio::test]
async fn future_function_and_constant_are_not_cold_candidates() {
    for (prefix, name) in [
        ("random_b", "random_bytes"),
        ("PHP_FLOAT_EPS", "PHP_FLOAT_EPSILON"),
        ("JSON_THROW_ON_ER", "JSON_THROW_ON_ERROR"),
    ] {
        let backend = backend(5, 6);
        let source = format!("<?php\n{prefix}");
        let uri = open(&backend, &source).await;
        let items = completion(&backend, &uri, &source).await;
        assert!(
            !items
                .iter()
                .any(|i| i.label == name || i.filter_text.as_deref() == Some(name)),
            "5.6 offered {name}: {items:?}"
        );
    }
}

fn offered(items: &[CompletionItem], symbol: &str) -> bool {
    let short = symbol.rsplit(['\\', ':']).next().unwrap();
    items.iter().any(|i| {
        i.filter_text.as_deref() == Some(symbol)
            || i.filter_text.as_deref() == Some(short)
            || i.label == short
            || i.label.starts_with(&format!("{short}("))
            || i.data
                .as_ref()
                .and_then(|d| d.get("m"))
                .and_then(|v| v.as_str())
                == Some(symbol)
    })
}
async fn availability_family(family: &str) {
    let mut mismatches = Vec::new();
    let mut checked = 0;
    for line in include_str!("fixtures/minimum-availability.tsv")
        .lines()
        .filter(|l| !l.starts_with('#'))
    {
        let c = line.split('\t').collect::<Vec<_>>();
        if c[1] != family {
            continue;
        }
        let mut version = c[0].split('.');
        let backend = backend(
            version.next().unwrap().parse().unwrap(),
            version.next().unwrap().parse().unwrap(),
        );
        let expected = c[3] == "true";
        let symbol = c[2];
        let tail = match family {
            "class" => format!("new {}", &symbol[..symbol.len() - 1]),
            "interface" => format!("function f({}", &symbol[..symbol.len() - 1]),
            "member" => "DateTime::createFromI".to_string(),
            _ => symbol[..symbol.len() - 1].to_string(),
        };
        let source = format!("<?php\n{tail}");
        let uri = open(&backend, &source).await;
        for warm in [false, true] {
            if warm {
                let (warm_source, warm_symbol) = match c[4].split(':').next().unwrap() {
                    "random/random.php" => ("<?php\nmt_ran", "mt_rand"),
                    "standard/standard_9.php" => ("<?php\narray_chun", "array_chunk"),
                    "standard/standard_3.php" => ("<?php\nab", "abs"),
                    "Core/Core_c.php" => ("<?php\nnew Exceptio", "Exception"),
                    "Core/Core_d.php" => ("<?php\nPHP_O", "PHP_OS"),
                    "json/json.php" => ("<?php\njson_encod", "json_encode"),
                    "date/date_c.php" => ("<?php\nnew DateTim", "DateTime"),
                    _ => ("<?php\nclass_exist", "class_exists"),
                };
                let sibling_uri =
                    open_uri(&backend, warm_source, "file:///shared-stub-sibling.php").await;
                let siblings = completion(&backend, &sibling_uri, warm_source).await;
                let sibling = siblings
                    .iter()
                    .find(|i| {
                        i.data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|v| v.as_str())
                            == Some(warm_symbol)
                    })
                    .unwrap_or_else(|| panic!("Missing warm sibling {warm_symbol}"));
                backend.completion_resolve(sibling.clone()).await.unwrap();
            }
            let items = completion(&backend, &uri, &source).await;
            let actual = offered(&items, symbol);
            if actual != expected {
                mismatches.push(format!(
                    "{} {symbol} warm={warm} expected={expected} actual={actual}",
                    c[0]
                ));
            }
            checked += 1;
        }
    }
    assert_eq!(
        mismatches,
        Vec::<String>::new(),
        "{family}: {checked} public checks"
    );
    eprintln!("ORACLE {family}: {checked} public cold/warm checks passed");
}
#[tokio::test]
async fn function_availability_manager_oracle_cold_and_warm() {
    availability_family("function").await;
}
#[tokio::test]
async fn class_availability_manager_oracle_cold_and_warm() {
    availability_family("class").await;
}
#[tokio::test]
async fn interface_availability_manager_oracle_cold_and_warm() {
    availability_family("interface").await;
}
#[tokio::test]
async fn constant_availability_manager_oracle_cold_and_warm() {
    availability_family("constant").await;
}
#[tokio::test]
async fn member_availability_manager_oracle_cold_and_warm() {
    availability_family("member").await;
}
#[tokio::test]
async fn removal_availability_manager_oracle_cold_and_warm() {
    availability_family("removed").await;
}

#[tokio::test]
async fn selected_functions_keep_alias_and_collision_bindings() {
    for (imports, expected) in [
        ("use function Vendor\\chosen as picked;", "picked("),
        ("use function Other\\chosen;", "\\Vendor\\chosen("),
    ] {
        let backend = backend(8, 5);
        let source = format!(
            "<?php\nnamespace Vendor {{ /** VENDOR_OWN_DOC */ function chosen(int $value): string {{ return 'vendor'; }} }}\nnamespace Other {{ function chosen(int $value): string {{ return 'other'; }} }}\nnamespace Consumer {{ {imports}\nchos"
        );
        let uri = open(&backend, &source).await;
        let items = completion(&backend, &uri, &source).await;
        let item = selected(&items, "Vendor\\chosen");
        assert!(
            item.insert_text.as_deref().unwrap().starts_with(expected),
            "{imports}: {item:?}"
        );
        assert!(
            item.additional_text_edits.is_none(),
            "Existing alias/conflict must not add an import: {item:?}"
        );
        let resolved = backend.completion_resolve(item.clone()).await.unwrap();
        assert!(docs(&resolved).contains("VENDOR_OWN_DOC"));
    }
}
#[tokio::test]
async fn selected_function_docs_follow_edits_and_rename_after_public_warm_requests() {
    let backend = backend(8, 5);
    let first = "<?php\nnamespace App;\n/** OLD_REQUIRED_MARKER */\nfunction own_name(int $old): string {}\nown_na";
    let uri = open(&backend, first).await;
    let items = completion(&backend, &uri, first).await;
    assert!(
        docs(
            &backend
                .completion_resolve(selected(&items, "App\\own_name").clone())
                .await
                .unwrap()
        )
        .contains("OLD_REQUIRED_MARKER")
    );
    warm_function(&backend, "str_contains").await;
    let edited = "<?php\nnamespace App;\n/** NEW_REQUIRED_MARKER */\nfunction renamed_name(bool $fresh): int {}\nrenamed_na";
    backend
        .did_change(DidChangeTextDocumentParams {
            text_document: VersionedTextDocumentIdentifier {
                text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                version: 2,
            },
            content_changes: vec![
                TextDocumentContentChangeEvent::TextDocumentContentChangeWholeDocument(
                    TextDocumentContentChangeWholeDocument {
                        text: edited.to_string(),
                    },
                ),
            ],
        })
        .await;
    let items = completion(&backend, &uri, edited).await;
    let resolved = backend
        .completion_resolve(selected(&items, "App\\renamed_name").clone())
        .await
        .unwrap();
    let text = docs(&resolved);
    assert!(
        text.contains("NEW_REQUIRED_MARKER")
            && text.contains("bool $fresh")
            && !text.contains("OLD_REQUIRED_MARKER"),
        "{text}"
    );
}
#[tokio::test]
async fn php_type_and_parameter_boundaries_keep_phpdoc_enrichment() {
    for (major, minor) in [
        (5, 6),
        (7, 0),
        (7, 1),
        (7, 2),
        (7, 3),
        (7, 4),
        (8, 0),
        (8, 1),
        (8, 2),
        (8, 3),
        (8, 4),
        (8, 5),
    ] {
        let backend = backend(major, minor);
        let source = "<?php\nsubstr(\"abc\", 0,";
        let uri = open(&backend, source).await;
        let got = backend
            .signature_help(SignatureHelpParams {
                text_document_position_params: TextDocumentPositionParams {
                    text_document: TextDocumentIdentifier { uri },
                    position: Position {
                        line: 1,
                        character: source.lines().last().unwrap().len() as u32,
                    },
                },
                work_done_progress_params: Default::default(),
                context: None,
            })
            .await
            .unwrap()
            .unwrap();
        let label = &got.signatures[0].label;
        assert_eq!(
            label.contains("false"),
            major < 8,
            "substr PHP {major}.{minor}: {label}"
        );
        let source = "<?php\n$d=new DateTime();\n$d->setTime(1,2,3,";
        let uri = open(&backend, source).await;
        let got = backend
            .signature_help(SignatureHelpParams {
                text_document_position_params: TextDocumentPositionParams {
                    text_document: TextDocumentIdentifier { uri },
                    position: Position {
                        line: 2,
                        character: source.lines().last().unwrap().len() as u32,
                    },
                },
                work_done_progress_params: Default::default(),
                context: None,
            })
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            got.signatures[0].label.contains("microsecond"),
            (major, minor) >= (7, 1),
            "setTime PHP {major}.{minor}: {:?}",
            got.signatures
        );
    }
}
#[tokio::test]
async fn user_source_is_not_filtered_by_stub_domain_marker_or_version_tags() {
    let backend = backend(5, 6);
    let source = "<?php /* PHPANTOM_PHP_VERSION_DOCS */ ?>\n<?php\nnamespace User;\n/** USER_DOC @since 8.5 */\n#[Unrelated(from: '8.5')]\nfunction user_function(int $value): string {}\nuser_fun";
    let uri = open(&backend, source).await;
    let items = completion(&backend, &uri, source).await;
    let resolved = backend
        .completion_resolve(selected(&items, "User\\user_function").clone())
        .await
        .unwrap();
    assert!(docs(&resolved).contains("USER_DOC"));
}
#[tokio::test]
async fn offered_builtin_and_user_calls_have_distinct_executable_names() {
    let backend = backend(8, 5);
    let source = "<?php\nnamespace App;\n/** USER_TRUE */\nfunction str_contains(string $ownOnly): bool { return true; }\nstr_con";
    let uri = open(&backend, source).await;
    let items = completion(&backend, &uri, source).await;
    let builtin = selected(&items, "str_contains");
    let user = selected(&items, "App\\str_contains");
    let global_call = builtin
        .insert_text
        .as_ref()
        .unwrap()
        .split('(')
        .next()
        .unwrap();
    let user_call = user
        .insert_text
        .as_ref()
        .unwrap()
        .split('(')
        .next()
        .unwrap();
    assert_eq!((global_call, user_call), ("\\str_contains", "str_contains"));
    eprintln!("OFFERED_PHP_BINDING|global|{global_call}|user|{user_call}");
}

#[test]
fn same_named_stub_parameter_variants_keep_only_the_matching_native_hint_and_docs() {
    let source = r#"<?php
use JetBrains\PhpStorm\Internal\PhpStormStubsElementAvailable as Available;
/** @param int|string $value MATCHING_PARAMETER_DOCUMENTATION */
function version_variant(#[Available(to: '7.4')] string $value, #[Available(from: '8.0')] int $value): void {}
"#;
    for (version, want) in [
        (PhpVersion::new(7, 4), "string"),
        (PhpVersion::new(8, 0), "int"),
    ] {
        let backend = backend(version.major, version.minor);
        let functions = backend.parse_functions_versioned(source, Some(version));
        let parameters = &functions[0].parameters;
        let got = parameters
            .iter()
            .map(|p| {
                (
                    p.name.to_string(),
                    p.native_type_hint.as_ref().map(ToString::to_string),
                    p.description.clone(),
                )
            })
            .collect::<Vec<_>>();
        assert_eq!(
            got,
            vec![(
                "$value".to_string(),
                Some(want.to_string()),
                Some("MATCHING_PARAMETER_DOCUMENTATION".to_string())
            )]
        );
    }
}

fn apply_item(source: &str, item: &CompletionItem) -> String {
    fn offset(source: &str, position: Position) -> usize {
        let before = source
            .split_inclusive('\n')
            .take(position.line as usize)
            .map(str::len)
            .sum::<usize>();
        let line = &source[before..];
        let mut units = 0;
        before
            + line
                .char_indices()
                .find_map(|(i, c)| {
                    if units == position.character as usize {
                        Some(i)
                    } else {
                        units += c.len_utf16();
                        None
                    }
                })
                .unwrap_or(line.len())
    }
    let Some(CompletionItemTextEdit::TextEdit(primary)) = &item.text_edit else {
        panic!("Explicit function replacement edit required: {item:?}");
    };
    let mut edits = vec![primary.clone()];
    edits.extend(item.additional_text_edits.clone().unwrap_or_default());
    edits.sort_by_key(|edit| std::cmp::Reverse(offset(source, edit.range.start)));
    let mut got = source.to_string();
    for edit in edits {
        got.replace_range(
            offset(source, edit.range.start)..offset(source, edit.range.end),
            &edit.new_text,
        );
    }
    got
}
#[tokio::test]
async fn absolute_and_qualified_function_prefixes_apply_to_the_entire_written_name() {
    for warm in [false, true] {
        let backend = backend(8, 5);
        let source = "<?php\nnamespace App;\n/** USER */ function str_contains(int $local): string {}\n\\str_con";
        let uri = open(&backend, source).await;
        if warm {
            warm_function(&backend, "str_ends_with").await;
        }
        let items = completion(&backend, &uri, source).await;
        let item = selected(&items, "str_contains");
        let call = if warm {
            r"\str_contains(${1:\$haystack}, ${2:\$needle})$0"
        } else {
            r"\str_contains()$0"
        };
        let want = format!(
            "<?php\nnamespace App;\n/** USER */ function str_contains(int $local): string {{}}\n{call}"
        );
        assert_eq!(apply_item(source, item), want, "warm={warm}");
    }
    let backend = backend(8, 5);
    let source = "<?php\nnamespace Vendor { /** VENDOR */ function chosen(int $value): string {} }\nnamespace Consumer {\nuse function Vendor\\chosen as picked;\nVendor\\chos";
    let uri = open(&backend, source).await;
    let items = completion(&backend, &uri, source).await;
    let item = selected(&items, "Vendor\\chosen");
    let want = "<?php\nnamespace Vendor { /** VENDOR */ function chosen(int $value): string {} }\nnamespace Consumer {\nuse function Vendor\\chosen as picked;\npicked(${1:\\$value})$0";
    assert_eq!(apply_item(source, item), want);
    assert!(item.additional_text_edits.is_none());
}
#[tokio::test]
async fn class_constant_and_property_introduction_boundaries_use_their_own_metadata() {
    for (major, minor) in [
        (5, 6),
        (7, 0),
        (7, 1),
        (7, 2),
        (7, 3),
        (7, 4),
        (8, 0),
        (8, 1),
        (8, 2),
        (8, 3),
        (8, 4),
        (8, 5),
    ] {
        for (tail, symbol, expected) in [
            (
                "DateTime::RFC3339_EXT",
                "RFC3339_EXTENDED",
                (major, minor) >= (7, 0),
            ),
            (
                "$d=new DateInterval('PT1S');\n$d->f",
                "f",
                (major, minor) >= (7, 1),
            ),
        ] {
            let backend = backend(major, minor);
            let source = format!("<?php\n{tail}");
            let uri = open(&backend, &source).await;
            let items = completion(&backend, &uri, &source).await;
            assert_eq!(
                offered(&items, symbol),
                expected,
                "PHP {major}.{minor} {symbol}: {items:?}"
            );
        }
    }
}

#[tokio::test]
async fn autoload_selected_identity_survives_resolve_and_parsed_warm_path() {
    for (imports, expected_name) in [
        ("use function Vendor\\chosen as picked;", "picked"),
        ("use function Other\\chosen;", "\\Vendor\\chosen"),
    ] {
        let backend = backend(8, 5);
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "phpantom-autoload-{}-{unique}.php",
            std::process::id()
        ));
        std::fs::write(&path, "<?php namespace Vendor; /** AUTOLOAD_OWN_DOC */ function chosen(int $own): string { return 'vendor'; }").unwrap();
        backend
            .autoload_function_index()
            .write()
            .insert("Vendor\\chosen".to_string(), path);
        let source = format!("<?php\nnamespace Consumer;\n{imports}\nVendor\\chos");
        let uri = open(&backend, &source).await;
        let cold = completion(&backend, &uri, &source).await;
        let item = selected(&cold, "Vendor\\chosen");
        let base = source.strip_suffix("Vendor\\chos").unwrap();
        assert_eq!(
            apply_item(&source, item),
            format!("{base}{expected_name}()$0")
        );
        let resolved = backend.completion_resolve(item.clone()).await.unwrap();
        assert!(docs(&resolved).contains("AUTOLOAD_OWN_DOC"), "{resolved:?}");
        let warm = completion(&backend, &uri, &source).await;
        let item = selected(&warm, "Vendor\\chosen");
        assert_eq!(
            apply_item(&source, item),
            format!("{base}{expected_name}(${{1:\\$own}})$0")
        );
        assert!(
            docs(&backend.completion_resolve(item.clone()).await.unwrap())
                .contains("AUTOLOAD_OWN_DOC")
        );
    }
}
