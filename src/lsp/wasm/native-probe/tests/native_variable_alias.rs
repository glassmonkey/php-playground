use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};

fn offset(source: &str, p: Position) -> usize {
    let line_start = source
        .split_inclusive('\n')
        .take(p.line as usize)
        .map(str::len)
        .sum::<usize>();
    let mut units = 0;
    for (i, c) in source[line_start..].char_indices() {
        if units == p.character {
            return line_start + i;
        }
        units += c.len_utf16() as u32;
        assert!(units <= p.character, "invalid UTF-16 edit boundary");
    }
    assert_eq!(units, p.character);
    source.len()
}
fn apply(source: &str, primary: &TextEdit, additional: &[TextEdit], snippet: bool) -> String {
    let mut edits = additional.to_vec();
    edits.push(primary.clone());
    let mut ranges = edits
        .iter()
        .map(|e| {
            (
                offset(source, e.range.start),
                offset(source, e.range.end),
                e.new_text.clone(),
            )
        })
        .collect::<Vec<_>>();
    ranges.sort_by_key(|a| std::cmp::Reverse(a.0));
    let mut result = source.to_owned();
    let mut next = source.len();
    for (start, end, text) in ranges {
        assert!(start <= end && end <= next);
        result.replace_range(
            start..end,
            &if snippet {
                text.replace("$0", "")
            } else {
                text
            },
        );
        next = start;
    }
    result
}
#[tokio::test]
async fn variable_suffix_and_class_alias_edits_preserve_the_independent_full_document() {
    let rows = include_str!("fixtures/variable-alias.tsv")
        .lines()
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 36);
    let mut failures = Vec::new();
    let mut checked = 0;
    for row in rows {
        let f = row
            .split('\t')
            .map(|s| s.replace("\\n", "\n").replace("\\r", "\r"))
            .collect::<Vec<_>>();
        assert_eq!(f.len(), 15);
        let name = &f[0];
        let source = &f[2];
        let position = Position {
            line: f[3].parse().unwrap(),
            character: f[4].parse().unwrap(),
        };
        let parts = f[13]
            .split('.')
            .map(|s| s.parse().unwrap())
            .collect::<Vec<u8>>();
        let backend = Backend::new_headless();
        backend.set_php_version(PhpVersion::new(parts[0], parts[1]));
        let uri = Uri::parse("inmemory://model/1").unwrap();
        backend
            .did_open(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: uri.clone(),
                    language_id: "php".into(),
                    version: 1,
                    text: f[1].clone(),
                },
            })
            .await;
        backend
            .did_change(DidChangeTextDocumentParams {
                text_document: VersionedTextDocumentIdentifier {
                    text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                    version: 2,
                },
                content_changes: vec![
                    TextDocumentContentChangeEvent::TextDocumentContentChangeWholeDocument(
                        TextDocumentContentChangeWholeDocument {
                            text: source.clone(),
                        },
                    ),
                ],
            })
            .await;
        let kind = if f[7] == "6" {
            CompletionItemKind::Variable
        } else {
            CompletionItemKind::Class
        };
        for warm in [false, true] {
            let response = backend
                .completion(CompletionParams {
                    text_document_position_params: TextDocumentPositionParams {
                        text_document: TextDocumentIdentifier { uri: uri.clone() },
                        position,
                    },
                    work_done_progress_params: Default::default(),
                    partial_result_params: Default::default(),
                    context: None,
                })
                .await
                .unwrap();
            let items = match response {
                Some(CompletionResponse::CompletionItemList(v)) => v,
                Some(CompletionResponse::CompletionList(v)) => v.items,
                None => vec![],
            };
            let item = items.iter().find(|i| {
                i.label == f[5]
                    && i.kind == Some(kind)
                    && (kind == CompletionItemKind::Variable
                        || i.data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|v| v.as_str())
                            == Some(f[6].as_str()))
            });
            checked += 1;
            if f[14] == "0" {
                if item.is_some() {
                    failures.push(format!("{name} warm={warm} forbidden item: {item:?}"));
                }
                continue;
            }
            let Some(item) = item else {
                failures.push(format!(
                    "{name} warm={warm} missing selected item: {items:?}"
                ));
                continue;
            };
            let resolved = backend.completion_resolve(item.clone()).await.unwrap();
            let Some(CompletionItemTextEdit::TextEdit(edit)) = &item.text_edit else {
                failures.push(format!("{name} missing plain explicit edit: {item:?}"));
                continue;
            };
            let range = Range {
                start: Position {
                    line: position.line,
                    character: f[8].parse().unwrap(),
                },
                end: Position {
                    line: position.line,
                    character: f[9].parse().unwrap(),
                },
            };
            let snippet = f[10].contains("$0");
            let format = if snippet {
                Some(InsertTextFormat::Snippet)
            } else {
                None
            };
            let additions = item.additional_text_edits.as_deref().unwrap_or(&[]);
            let filter = if f[10].starts_with('\\') {
                f[10].as_str()
            } else {
                f[5].as_str()
            };
            let accepted = apply(source, edit, additions, snippet);
            let identity = kind == CompletionItemKind::Variable
                || resolved
                    .data
                    .as_ref()
                    .and_then(|d| d.get("m"))
                    .and_then(|v| v.as_str())
                    == Some(f[6].as_str());
            if edit.range != range
                || edit.new_text != f[10]
                || !additions.is_empty()
                || item.insert_text_format != format
                || item.filter_text.as_deref() != Some(filter)
                || accepted != f[11]
                || !identity
            {
                failures.push(format!("{name} warm={warm} expected range={range:?} text={:?} full={:?}; actual full={accepted:?} item={item:?} resolved={resolved:?}",f[10],f[11]));
            }
        }
    }
    assert_eq!(checked, 72);
    assert!(
        failures.is_empty(),
        "{} failures: {failures:#?}",
        failures.len()
    );
    eprintln!("VARIABLE_ALIAS_ORACLE {checked} public cold/warm complete-edit contracts passed");
}
