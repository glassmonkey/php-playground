use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};
#[tokio::test]
async fn attributed_declarations_preserve_their_own_phpdoc_through_public_resolve() {
    let rows = include_str!("fixtures/attribute-docs.tsv")
        .lines()
        .filter(|r| !r.starts_with('#'))
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 17);
    let mut checked = 0;
    for row in rows {
        let fields = row
            .split('\t')
            .map(|s| s.replace("\\n", "\n"))
            .collect::<Vec<_>>();
        assert_eq!(fields.len(), 6);
        let (source, member, class, marker, rejected) = (
            &fields[0],
            fields[1].as_str(),
            fields[2].as_str(),
            fields[4].as_str(),
            fields[5].as_str(),
        );
        let kind = match fields[3].as_str() {
            "7" => CompletionItemKind::Class,
            "3" => CompletionItemKind::Function,
            "2" => CompletionItemKind::Method,
            _ => panic!("fixture kind"),
        };
        for minor in [0, 5] {
            let backend = Backend::new_headless();
            backend.set_php_version(PhpVersion::new(8, minor));
            let tail = source.lines().last().unwrap();
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
                let item = items
                    .iter()
                    .find(|i| {
                        i.kind == Some(kind)
                            && i.data
                                .as_ref()
                                .and_then(|d| d.get("m"))
                                .and_then(|v| v.as_str())
                                == Some(member)
                    })
                    .unwrap_or_else(|| panic!("{marker} selected {member} missing: {items:?}"));
                assert_eq!(item.kind, Some(kind));
                if !class.is_empty() {
                    assert_eq!(
                        item.data
                            .as_ref()
                            .and_then(|d| d.get("c"))
                            .and_then(|v| v.as_str()),
                        Some(class)
                    );
                }
                let resolved = backend.completion_resolve(item.clone()).await.unwrap();
                let docs = match resolved.documentation {
                    Some(Documentation::MarkupContent(m)) => m.value,
                    Some(Documentation::String(s)) => s,
                    None => String::new(),
                };
                assert!(
                    docs.contains(marker) && !docs.contains(rejected),
                    "PHP8.{minor} warm={warm} FQN={class}::{member}, required={marker}, got={docs:?}"
                );
                checked += 1;
            }
        }
    }
    assert_eq!(checked, 68);
    eprintln!("ATTRIBUTE_DOC_ORACLE {checked} public cold/warm docs checks passed");
}
