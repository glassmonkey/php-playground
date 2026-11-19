use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};
#[tokio::test]
async fn opaque_attribute_arguments_preserve_docs_from_an_independent_consumer() {
    let rows = include_str!("fixtures/attribute-opaque-docs.tsv")
        .lines()
        .filter(|r| !r.starts_with('#'))
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 84);
    let mut failures = Vec::new();
    let mut checked = 0;
    for row in rows {
        let fields = row
            .split('\t')
            .map(|s| s.replace("\\n", "\n").replace("\\r", "\r"))
            .collect::<Vec<_>>();
        assert_eq!(fields.len(), 7);
        let (declaration, source, member, class, marker, name) = (
            &fields[0],
            &fields[1],
            fields[2].as_str(),
            fields[3].as_str(),
            fields[5].as_str(),
            fields[6].as_str(),
        );
        let kind = match fields[4].as_str() {
            "7" => CompletionItemKind::Class,
            "3" => CompletionItemKind::Function,
            "2" => CompletionItemKind::Method,
            _ => panic!("fixture kind"),
        };
        for minor in [0, 3] {
            let backend = Backend::new_headless();
            backend.set_php_version(PhpVersion::new(8, minor));
            let tail = source.lines().last().unwrap();
            let uri = Uri::parse("file:///attribute-docs.php").unwrap();
            backend
                .did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: Uri::parse("file:///declaration.php").unwrap(),
                        language_id: "php".into(),
                        version: 1,
                        text: declaration.clone(),
                    },
                })
                .await;
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
                                line: source.lines().count() as u32 - 1,
                                character: tail.encode_utf16().count() as u32,
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
    assert_eq!(checked, 336);
    assert!(
        failures.is_empty(),
        "{} failures: {failures:#?}",
        failures.len()
    );
    eprintln!("ATTRIBUTE_OPAQUE_DOC_ORACLE {checked} public cold/warm docs checks passed");
}
