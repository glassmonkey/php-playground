use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};
#[tokio::test]
async fn completion_resumes_after_valid_document_strings_but_stays_inside_their_bodies() {
    let rows = include_str!("fixtures/document-string-completion.tsv")
        .lines()
        .filter(|r| !r.starts_with('#'))
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 42);
    let mut failures = Vec::new();
    let mut checked = 0;
    for row in rows {
        let fields = row
            .split('\t')
            .map(|s| s.replace("\\n", "\n").replace("\\r", "\r"))
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
    assert_eq!(checked, 168);
    assert!(
        failures.is_empty(),
        "{} failures: {failures:#?}",
        failures.len()
    );
    eprintln!("DOCUMENT_STRING_COMPLETION_ORACLE {checked} public cold/warm docs checks passed");
}

#[test]
fn lexical_context_agrees_with_the_independent_valid_document_cursors() {
    use phpantom_lsp::completion::comment_position::{StringContext, classify_string_context};
    let mut failures = Vec::new();
    let mut checked = 0;
    for row in include_str!("fixtures/document-string-completion.tsv").lines() {
        let fields = row
            .split('\t')
            .map(|s| s.replace("\\n", "\n").replace("\\r", "\r"))
            .collect::<Vec<_>>();
        let position = Position {
            line: fields[5].parse().unwrap(),
            character: fields[6].parse().unwrap(),
        };
        let expected = if fields[7] == "1" {
            StringContext::NotInString
        } else {
            StringContext::InStringLiteral
        };
        let actual = classify_string_context(&fields[0], position);
        if actual != expected {
            failures.push(format!(
                "{} at {position:?}: actual={actual:?}, expected={expected:?}",
                fields[8]
            ));
        }
        checked += 1;
    }
    assert_eq!(checked, 42);
    assert!(failures.is_empty(), "{failures:#?}");
}
