use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};

fn position(text: &str) -> Position {
    let lines = text.split('\n').collect::<Vec<_>>();
    Position {
        line: lines.len() as u32 - 1,
        character: lines.last().unwrap().encode_utf16().count() as u32,
    }
}
fn offset(text: &str, p: Position) -> usize {
    let before = text
        .split_inclusive('\n')
        .take(p.line as usize)
        .map(str::len)
        .sum::<usize>();
    let mut units = 0;
    before
        + text[before..]
            .char_indices()
            .find_map(|(i, c)| {
                if units == p.character as usize {
                    Some(i)
                } else {
                    units += c.len_utf16();
                    None
                }
            })
            .unwrap_or(text.len() - before)
}
fn apply(source: &str, item: &CompletionItem) -> String {
    let Some(CompletionItemTextEdit::TextEdit(primary)) = &item.text_edit else {
        panic!("explicit primary edit required: {item:?}")
    };
    let mut edits = vec![primary.clone()];
    edits.extend(item.additional_text_edits.clone().unwrap_or_default());
    edits.sort_by_key(|e| std::cmp::Reverse(offset(source, e.range.start)));
    let mut got = source.to_owned();
    for edit in edits {
        got.replace_range(
            offset(source, edit.range.start)..offset(source, edit.range.end),
            &edit.new_text,
        );
    }
    got
}
// Label, ranking and documentation are not editing instructions. Compare all
// protocol fields that may change the accepted document, before and after resolve.
fn editing_item(item: &CompletionItem) -> CompletionItem {
    CompletionItem {
        text_edit: item.text_edit.clone(),
        insert_text: item.insert_text.clone(),
        insert_text_format: item.insert_text_format,
        insert_text_mode: item.insert_text_mode,
        text_edit_text: item.text_edit_text.clone(),
        additional_text_edits: item.additional_text_edits.clone(),
        command: item.command.clone(),
        ..Default::default()
    }
}
#[tokio::test]
async fn imports_preserve_selected_identity_after_all_edits() {
    let rows = include_str!("fixtures/import-edits.tsv")
        .lines()
        .filter(|r| !r.starts_with('#'))
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 27);
    assert_eq!(
        rows.iter()
            .map(|r| r.split('\t').next().unwrap())
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        27
    );
    let mut checked = 0;
    // PHP7 migration group-use grammar is the independent availability boundary.
    for (target_index, (major, minor)) in [
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
    ]
    .into_iter()
    .enumerate()
    {
        for row in &rows {
            let c = row
                .split('\t')
                .map(|s| s.replace("\\n", "\n"))
                .collect::<Vec<_>>();
            assert_eq!(c.len(), 10);
            assert_eq!(c[9].len(), 12);
            assert!(c[9].bytes().all(|v| v == b'0' || v == b'1'));
            let source = format!("{}{}{}", c[1], c[2], c[3]);
            let cursor = position(&format!("{}{}", c[1], c[2]));
            let backend = Backend::new_headless();
            backend.set_php_version(PhpVersion::new(major, minor));
            let uri = Uri::parse("file:///import-edit.php").unwrap();
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
                            position: cursor,
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
                let kind = match c[7].as_str() {
                    "7" => CompletionItemKind::Class,
                    "3" => CompletionItemKind::Function,
                    "21" => CompletionItemKind::Constant,
                    _ => unreachable!(),
                };
                if c[9].as_bytes()[target_index] == b'0' {
                    assert!(
                        items.is_empty(),
                        "{} {major}.{minor}: unsupported group import: {items:?}",
                        c[0]
                    );
                    checked += 1;
                    continue;
                }
                let selected = items.iter().find(|i| {
                    i.kind == Some(kind)
                        && i.data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|v| v.as_str())
                            == Some(c[6].as_str())
                });
                let item = selected.unwrap_or_else(|| {
                    panic!(
                        "{} {major}.{minor} warm={warm}: required {} missing: {items:?}",
                        c[0], c[6]
                    )
                });
                let mut end = cursor;
                if c[0] == "cursor-middle" {
                    end.character += 3;
                }
                let want = Some(CompletionItemTextEdit::TextEdit(TextEdit {
                    range: Range {
                        start: position(&c[1]),
                        end,
                    },
                    new_text: c[4].clone(),
                }));
                let want = CompletionItem {
                    text_edit: want,
                    insert_text: Some(c[4].clone()),
                    insert_text_format: Some(InsertTextFormat::PlainText),
                    ..Default::default()
                };
                assert_eq!(
                    editing_item(item),
                    want,
                    "{} {major}.{minor} warm={warm}: complete editing payload",
                    c[0]
                );
                assert_eq!(apply(&source, item), c[5], "{}: all edits applied", c[0]);
                assert!(
                    items.iter().all(|i| i.kind == Some(kind)),
                    "{}: wrong-kind candidates: {items:?}",
                    c[0]
                );
                let resolved = backend.completion_resolve(item.clone()).await.unwrap();
                assert_eq!(
                    editing_item(&resolved),
                    want,
                    "{}: resolve editing payload",
                    c[0]
                );
                assert_eq!(
                    apply(&source, &resolved),
                    c[5],
                    "{}: resolved edits applied",
                    c[0]
                );
                checked += 1;
            }
        }
    }
    eprintln!("IMPORT_EDIT_ORACLE {checked} public cold/warm edit contracts passed");
}

#[tokio::test]
async fn headless_edits_publish_renamed_group_functions_before_the_next_request() {
    let backend = Backend::new_headless();
    backend.set_php_version(PhpVersion::new(8, 0));
    let uri = Uri::parse("file:///immediate-group-edit.php").unwrap();
    let initial = "<?php namespace Vendor { function old_name(): string {} } namespace App { use function Vendor\\{old_na";
    backend
        .did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri.clone(),
                language_id: "php".into(),
                version: 1,
                text: initial.to_owned(),
            },
        })
        .await;
    for (version, source, fqn, text) in [
        (
            2,
            "<?php namespace Vendor { /** FIRST */ function new_name(): string {} } namespace App { use function Vendor\\{new_na",
            "Vendor\\new_name",
            "new_name",
        ),
        (
            3,
            "<?php namespace Vendor { /** SECOND */ function latest_name(): int {} } namespace App { use Vendor\\{function latest_na",
            "Vendor\\latest_name",
            "latest_name",
        ),
    ] {
        backend
            .did_change(DidChangeTextDocumentParams {
                text_document: VersionedTextDocumentIdentifier {
                    text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                    version,
                },
                content_changes: vec![
                    TextDocumentContentChangeEvent::TextDocumentContentChangeWholeDocument(
                        TextDocumentContentChangeWholeDocument {
                            text: source.to_owned(),
                        },
                    ),
                ],
            })
            .await;
        let response = backend
            .completion(CompletionParams {
                text_document_position_params: TextDocumentPositionParams {
                    text_document: TextDocumentIdentifier { uri: uri.clone() },
                    position: position(source),
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
                i.data
                    .as_ref()
                    .and_then(|d| d.get("m"))
                    .and_then(|v| v.as_str())
                    == Some(fqn)
            })
            .unwrap_or_else(|| panic!("fresh {fqn} missing after didChange: {items:?}"));
        assert_eq!(item.insert_text.as_deref(), Some(text));
        let resolved = backend.completion_resolve(item.clone()).await.unwrap();
        assert_eq!(resolved.text_edit, item.text_edit);
    }
}
