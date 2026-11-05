use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};

#[tokio::test]
async fn import_kind_survives_trivia_without_stealing_closure_or_trait_use() {
    let targets = [
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
    ];
    let rows = include_str!("fixtures/import-completion.tsv")
        .lines()
        .filter(|s| !s.starts_with('#'))
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 21);
    assert_eq!(
        rows.iter()
            .map(|r| r.split('\t').next().unwrap())
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        21
    );
    let mut failures = Vec::new();
    let mut checked = 0;
    for row in rows {
        let c = row.split('\t').collect::<Vec<_>>();
        assert_eq!(c.len(), 5);
        let source = c[1].replace("\\n", "\n");
        let kind = match c[3] {
            "21" => CompletionItemKind::Constant,
            "7" => CompletionItemKind::Class,
            "3" => CompletionItemKind::Function,
            "6" => CompletionItemKind::Variable,
            _ => panic!("Unknown fixture kind"),
        };
        for (major, minor) in targets {
            let backend = Backend::new_headless();
            backend.set_php_version(PhpVersion::new(major, minor));
            let uri = Uri::parse("file:///import-regression.php").unwrap();
            backend
                .did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: uri.clone(),
                        language_id: "php".to_string().into(),
                        version: 1,
                        text: source.clone(),
                    },
                })
                .await;
            let response = backend
                .completion(CompletionParams {
                    text_document_position_params: TextDocumentPositionParams {
                        text_document: TextDocumentIdentifier { uri },
                        position: Position {
                            line: source.lines().count() as u32 - 1,
                            character: source.lines().last().unwrap().encode_utf16().count() as u32,
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
            let found = items.iter().any(|i| {
                i.kind == Some(kind)
                    && (i.label == c[2]
                        || i.filter_text.as_deref() == Some(c[2])
                        || i.data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|v| v.as_str())
                            == Some(c[2]))
            });
            let wrong = items.iter().any(|i| {
                i.kind != Some(kind)
                    || (c[4] != "-"
                        && (i.label == c[4]
                            || i.filter_text.as_deref() == Some(c[4])
                            || i.data
                                .as_ref()
                                .and_then(|d| d.get("m"))
                                .and_then(|v| v.as_str())
                                == Some(c[4])))
            });
            if !found || wrong {
                failures.push(format!("{} PHP {major}.{minor} required={} kind={:?} found={found} wrongKind={wrong}: {items:?}",c[0],c[2],kind));
            }
            checked += 1;
        }
    }
    assert_eq!(
        failures,
        Vec::<String>::new(),
        "{checked} public import-kind checks"
    );
    eprintln!("IMPORT_ORACLE {checked} public checks passed");
}
