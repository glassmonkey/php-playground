#[path = "../../phpantom-source/build_support/stub_availability.rs"]
mod scanner;
use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};

#[tokio::test]
async fn scanner_and_lazy_stub_parser_agree_on_scoped_imports_and_opaque_literals() {
    let fixtures = [
        r"<?php use JetBrains\PhpStorm\Internal\{Other, PhpStormStubsElementAvailable as Available}; #[Available(from:'8.4')] function future() {} function existing() {}",
        r"<?php namespace A { use JetBrains\PhpStorm\Internal\PhpStormStubsElementAvailable as Available; #[Available(from:'8.4')] function future() {} } namespace B { use Other\Available; #[Available(from:'8.4')] function existing() {} }",
        "<?php $s=<<<TXT\n/** @since 8.5 */ function phantom() {}\nTXT;\n$s=<<<'RAW'\nfunction phantom_again() {}\nRAW;\nfunction real() {}",
        r#"<?php $x=new class { function member() {} }; $s="function quoted() {}"; $f=function() use ($x) {}; function real() {}"#,
    ];
    for source in fixtures {
        for (major, minor) in [(7, 4), (8, 0), (8, 4)] {
            let backend = Backend::new_headless();
            backend.set_php_version(PhpVersion::new(major, minor));
            // This URI supplies the same embedded-stub provenance used by the production lazy parser.
            backend.update_ast("phpantom-stub://function/lexical-regression.php", source);
            let expected = scanner::entries(source, true)
                .into_iter()
                .filter(|e| {
                    e.kind == "function"
                        && u16::from(major) * 100 + u16::from(minor) >= e.from
                        && u16::from(major) * 100 + u16::from(minor) <= e.to
                        && u16::from(major) * 100 + u16::from(minor) < e.removed
                })
                .map(|e| e.name)
                .collect::<Vec<_>>();
            for name in [
                "future",
                "existing",
                "real",
                "phantom",
                "phantom_again",
                "member",
                "quoted",
                "A\\future",
                "B\\existing",
            ] {
                let tail = name.rsplit('\\').next().unwrap();
                let query = format!("<?php\n{tail}");
                let uri = Uri::parse("file:///lexical-user.php").unwrap();
                backend
                    .did_open(DidOpenTextDocumentParams {
                        text_document: TextDocumentItem {
                            uri: uri.clone(),
                            language_id: "php".to_string().into(),
                            version: 1,
                            text: query,
                        },
                    })
                    .await;
                let result = backend
                    .completion(CompletionParams {
                        text_document_position_params: TextDocumentPositionParams {
                            text_document: TextDocumentIdentifier { uri },
                            position: Position {
                                line: 1,
                                character: tail.len() as u32,
                            },
                        },
                        work_done_progress_params: Default::default(),
                        partial_result_params: Default::default(),
                        context: None,
                    })
                    .await
                    .unwrap();
                let items = match result {
                    Some(CompletionResponse::CompletionItemList(x)) => x,
                    Some(CompletionResponse::CompletionList(x)) => x.items,
                    None => Vec::new(),
                };
                let actual = items.iter().any(|item| {
                    item.data
                        .as_ref()
                        .and_then(|d| d.get("m"))
                        .and_then(|x| x.as_str())
                        == Some(name)
                });
                assert_eq!(
                    actual,
                    expected.iter().any(|e| e == name),
                    "PHP {major}.{minor} {name}: {source}"
                );
            }
        }
    }
    assert!(scanner::php_version_domain("Core/Core_d.php"));
    assert!(!scanner::PHP_DOC_MARKER.is_empty());
}

#[tokio::test]
async fn nested_classes_never_publish_enclosing_methods_or_constants_as_globals() {
    let fixtures = [
        (
            "<?php class Outer { function first(){ $x=new class { function inner(){} }; } function outerMethod(){} const OUTER_CONST=1; } function real(){} const TOP=1;",
            "",
        ),
        (
            "<?php namespace N { class Outer { function first(){ class Inner { function inner(){} const INNER=1; } } function outerMethod(){} const OUTER_CONST=1; } function real(){} const TOP=1; }",
            "N\\",
        ),
    ];
    for (source, namespace) in fixtures {
        let entries = scanner::entries(source, true);
        let actual = entries
            .iter()
            .filter(|e| e.kind != "class")
            .map(|e| (e.kind, e.name.clone()))
            .collect::<Vec<_>>();
        assert_eq!(
            actual,
            vec![
                ("function", format!("{namespace}real")),
                ("constant", format!("{namespace}TOP"))
            ]
        );
        let backend = Backend::new_headless();
        backend.set_php_version(PhpVersion::new(8, 3));
        backend.update_ast("phpantom-stub://function/nested-owners.php", source);
        for (name, expected) in [
            ("real", true),
            ("TOP", true),
            ("outerMethod", false),
            ("OUTER_CONST", false),
            ("inner", false),
            ("INNER", false),
        ] {
            let text = if namespace.is_empty() {
                format!("<?php\n{name}")
            } else {
                format!(
                    "<?php\nnamespace {};\n{name}",
                    namespace.trim_end_matches('\\')
                )
            };
            let query_line = text.lines().count() as u32 - 1;
            let uri = Uri::parse("file:///nested-owner-user.php").unwrap();
            backend
                .did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: uri.clone(),
                        language_id: "php".to_string().into(),
                        version: 1,
                        text,
                    },
                })
                .await;
            let response = backend
                .completion(CompletionParams {
                    text_document_position_params: TextDocumentPositionParams {
                        text_document: TextDocumentIdentifier { uri },
                        position: Position {
                            line: query_line,
                            character: name.len() as u32,
                        },
                    },
                    work_done_progress_params: Default::default(),
                    partial_result_params: Default::default(),
                    context: None,
                })
                .await
                .unwrap();
            let items = match response {
                Some(CompletionResponse::CompletionItemList(x)) => x,
                Some(CompletionResponse::CompletionList(x)) => x.items,
                None => Vec::new(),
            };
            let fqn = format!("{namespace}{name}");
            let offered = items.iter().any(|i| {
                i.data
                    .as_ref()
                    .and_then(|d| d.get("m"))
                    .and_then(|v| v.as_str())
                    == Some(fqn.as_str())
            });
            assert_eq!(offered, expected, "{fqn}: {items:?}");
        }
    }
}
