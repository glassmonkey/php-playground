use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};

const TARGETS: [(u8, u8); 12] = [
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

#[tokio::test]
async fn declaration_keywords_and_types_follow_the_independent_language_oracle() {
    let mut failures = Vec::new();
    let mut checked = 0;
    let rows = include_str!("fixtures/language-completion.tsv")
        .lines()
        .filter(|row| !row.starts_with('#'))
        .collect::<Vec<_>>();
    assert_eq!(
        rows.len(),
        106,
        "The independent language inventory must not be empty or truncated"
    );
    assert_eq!(
        rows.iter()
            .map(|r| r.split('\t').next().unwrap())
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        106,
        "No duplicated case may hide a missing context"
    );
    for row in rows {
        let cells = row.split('\t').collect::<Vec<_>>();
        assert_eq!(cells.len(), 6, "Malformed independent fixture: {row}");
        let source = cells[3].replace("\\n", "\n");
        assert!(cells[4].bytes().all(|b| b == b'0' || b == b'1'));
        assert_eq!(
            cells[4].len(),
            TARGETS.len(),
            "Every target has an explicit expected value"
        );
        for (index, (major, minor)) in TARGETS.iter().copied().enumerate() {
            let backend = Backend::new_headless();
            backend.set_php_version(PhpVersion::new(major, minor));
            let uri = Uri::parse("file:///language-fixture.php").unwrap();
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
            let position = Position {
                line: source.lines().count() as u32 - 1,
                character: source.lines().last().unwrap().encode_utf16().count() as u32,
            };
            let response = backend
                .completion(CompletionParams {
                    text_document_position_params: TextDocumentPositionParams {
                        text_document: TextDocumentIdentifier { uri },
                        position,
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
                None => Vec::new(),
            };
            let kind = if cells[2] == "function" {
                CompletionItemKind::Function
            } else if cells[2] == "class" {
                CompletionItemKind::Class
            } else {
                CompletionItemKind::Keyword
            };
            let actual = items.iter().any(|item| {
                item.kind == Some(kind)
                    && (cells[2] != "type" || item.detail.as_deref() == Some("PHP built-in type"))
                    && (item.filter_text.as_deref() == Some(cells[1]) || item.label == cells[1])
            });
            let expected = cells[4].as_bytes()[index] == b'1';
            if actual != expected {
                failures.push(format!("{} PHP {major}.{minor} position={position:?} expected={expected} actual={actual}; items={items:?}",cells[0]));
            }
            checked += 1;
        }
    }
    assert_eq!(
        failures,
        Vec::<String>::new(),
        "{checked} public language completion checks"
    );
    eprintln!("LANGUAGE_ORACLE {checked} public checks passed");
}
