use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};
fn editing_item(item: &CompletionItem) -> CompletionItem {
    CompletionItem {
        text_edit: item.text_edit.clone(),
        insert_text: item.insert_text.clone(),
        insert_text_format: item.insert_text_format,
        insert_text_mode: item.insert_text_mode,
        text_edit_text: item.text_edit_text.clone(),
        additional_text_edits: item.additional_text_edits.clone(),
        command: item.command.clone(),
        ..CompletionItem::default()
    }
}

#[tokio::test]
async fn line_boundaries_and_interpolation_preserve_public_context_type_and_docs() {
    let rows = include_str!("fixtures/boundary-interpolation.tsv")
        .lines()
        .filter(|r| !r.starts_with('#'))
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 36);
    let mut failures = Vec::new();
    let mut checked = 0;
    for row in rows {
        let fields = row
            .split('\t')
            .map(|s| {
                s.replace("\\n", "\n")
                    .replace("\\r", "\r")
                    .replace("\\t", "\t")
            })
            .collect::<Vec<_>>();
        assert_eq!(fields.len(), 9);
        let (source, member, class, marker, name) = (
            &fields[0],
            fields[1].as_str(),
            fields[2].as_str(),
            fields[4].as_str(),
            fields[8].as_str(),
        );
        let present = fields[7] == "1";
        let kind = match fields[3].as_str() {
            "7" => CompletionItemKind::Class,
            "3" => CompletionItemKind::Function,
            "2" => CompletionItemKind::Method,
            "10" => CompletionItemKind::Property,
            _ => panic!("fixture kind"),
        };
        for minor in [0, 3] {
            let backend = Backend::new_headless();
            backend.set_php_version(PhpVersion::new(8, minor));

            let uri = Uri::parse("file:///attribute-docs.php").unwrap();
            backend
                .did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: uri.clone(),
                        language_id: "php".into(),
                        version: 1,
                        text: source.clone(),
                    },
                })
                .await;
            for warm in [false, true] {
                let response = backend
                    .completion(CompletionParams {
                        text_document_position_params: TextDocumentPositionParams {
                            text_document: TextDocumentIdentifier { uri: uri.clone() },
                            position: Position {
                                line: fields[5].parse().unwrap(),
                                character: fields[6].parse().unwrap(),
                            },
                        },
                        work_done_progress_params: Default::default(),
                        partial_result_params: Default::default(),
                        context: None,
                    })
                    .await
                    .unwrap();
                let items = match response {
                    Some(CompletionResponse::CompletionItemList(i)) => i,
                    Some(CompletionResponse::CompletionList(i)) => i.items,
                    None => vec![],
                };
                let item = items.iter().find(|i| {
                    i.kind == Some(kind)
                        && i.data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|v| v.as_str())
                            == Some(member)
                        && (class.is_empty()
                            || i.data
                                .as_ref()
                                .and_then(|d| d.get("c"))
                                .and_then(|v| v.as_str())
                                == Some(class))
                });
                if !present {
                    if !items.is_empty() {
                        failures.push(format!(
                            "{name} PHP8.{minor} warm={warm} leaked code completion: {items:?}"
                        ));
                    }
                    checked += 1;
                    continue;
                }
                if let Some(item) = item {
                    let resolved = backend.completion_resolve(item.clone()).await.unwrap();
                    for key in ["c", "m", "k"] {
                        if item.data.as_ref().and_then(|d| d.get(key))
                            != resolved.data.as_ref().and_then(|d| d.get(key))
                        {
                            failures.push(format!(
                                "{name} resolved identity changed {key}: {item:?} -> {resolved:?}"
                            ));
                        }
                    }

                    if editing_item(item) != editing_item(&resolved) {
                        failures.push(format!("{name} warm={warm} resolve changed complete edit payload: {item:?} -> {resolved:?}"));
                    }

                    let docs = match &resolved.documentation {
                        Some(Documentation::MarkupContent(m)) => m.value.as_str(),
                        Some(Documentation::String(s)) => s.as_str(),
                        None => "",
                    };
                    let valid = if marker.is_empty() {
                        !docs.contains("OWN_DOC_")
                    } else {
                        docs.contains(marker)
                    };
                    if !valid
                        || ["FAKE_ARGUMENT", "FAKE_BODY", "NEIGHBOR_DOC", "OTHER_DOC"]
                            .iter()
                            .any(|rejected| docs.contains(rejected))
                    {
                        failures.push(format!(
                            "PHP8.{minor} {name} warm={warm} item={item:?} resolved={resolved:?}"
                        ));
                    }
                } else {
                    failures.push(format!("PHP8.{minor} {name} warm={warm} missing {class}::{member}, source={source:?}, items={items:?}"));
                }
                checked += 1;
            }
        }
    }
    assert_eq!(checked, 144);
    assert!(
        failures.is_empty(),
        "{} failures: {failures:#?}",
        failures.len()
    );
    eprintln!("BOUNDARY_INTERPOLATION_ORACLE {checked} public cold/warm docs checks passed");
}

#[test]
fn string_context_matches_the_independent_boundary_and_interpolation_cursors() {
    use phpantom_lsp::completion::comment_position::{StringContext, classify_string_context};
    let mut failures = Vec::new();
    let mut count = 0;
    for row in include_str!("fixtures/boundary-interpolation.tsv").lines() {
        let f = row
            .split('\t')
            .map(|s| {
                s.replace("\\n", "\n")
                    .replace("\\r", "\r")
                    .replace("\\t", "\t")
            })
            .collect::<Vec<_>>();
        let p = Position {
            line: f[5].parse().unwrap(),
            character: f[6].parse().unwrap(),
        };
        let expected = if f[7] == "0" {
            StringContext::InStringLiteral
        } else if f[8] == "brace-partial" {
            StringContext::BraceInterpolation
        } else if f[3] == "10" {
            StringContext::SimpleInterpolation
        } else {
            StringContext::NotInString
        };
        let actual = classify_string_context(&f[0], p);
        if actual != expected {
            failures.push(format!(
                "{} actual={actual:?}, expected={expected:?}, position={p:?}",
                f[8]
            ));
        }
        count += 1;
    }
    assert_eq!(count, 36);
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn separate_consumer_preserves_docs_for_lf_and_cr_definitions() {
    let rows = include_str!("fixtures/boundary-doc-consumer.tsv")
        .lines()
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 2);
    let mut checked = 0;
    for row in rows {
        let f = row
            .split('\t')
            .map(|s| {
                s.replace("\\n", "\n")
                    .replace("\\r", "\r")
                    .replace("\\t", "\t")
            })
            .collect::<Vec<_>>();
        assert_eq!(f.len(), 4);
        for minor in [0, 3] {
            let backend = Backend::new_headless();
            backend.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///consumer.php").unwrap();
            for (path, text) in [
                ("file:///declaration.php", f[1].clone()),
                ("file:///consumer.php", f[2].clone()),
            ] {
                backend
                    .did_open(DidOpenTextDocumentParams {
                        text_document: TextDocumentItem {
                            uri: Uri::parse(path).unwrap(),
                            language_id: "php".into(),
                            version: 1,
                            text,
                        },
                    })
                    .await;
            }
            for warm in [false, true] {
                let response = backend
                    .completion(CompletionParams {
                        text_document_position_params: TextDocumentPositionParams {
                            text_document: TextDocumentIdentifier { uri: uri.clone() },
                            position: Position::new(1, 3),
                        },
                        work_done_progress_params: Default::default(),
                        partial_result_params: Default::default(),
                        context: None,
                    })
                    .await
                    .unwrap();
                let items = match response {
                    Some(CompletionResponse::CompletionItemList(items)) => items,
                    Some(CompletionResponse::CompletionList(list)) => list.items,
                    None => vec![],
                };
                let item = items
                    .iter()
                    .find(|item| {
                        item.kind == Some(CompletionItemKind::Class)
                            && item
                                .data
                                .as_ref()
                                .and_then(|data| data.get("m"))
                                .and_then(|v| v.as_str())
                                == Some("Target")
                    })
                    .unwrap();
                let resolved = backend.completion_resolve(item.clone()).await.unwrap();
                assert_eq!(editing_item(item), editing_item(&resolved));
                assert_eq!(
                    resolved
                        .data
                        .as_ref()
                        .and_then(|d| d.get("m"))
                        .and_then(|v| v.as_str()),
                    Some("Target")
                );
                let docs = match &resolved.documentation {
                    Some(Documentation::MarkupContent(m)) => m.value.as_str(),
                    Some(Documentation::String(s)) => s.as_str(),
                    None => "",
                };
                assert!(
                    docs.contains(&f[3]),
                    "{} PHP8.{minor} warm={warm} actual={docs:?}",
                    f[0]
                );
                checked += 1;
            }
        }
    }
    assert_eq!(checked, 8);
    eprintln!("SEPARATE_BOUNDARY_DOC_CONTROLS {checked} passed");
}
