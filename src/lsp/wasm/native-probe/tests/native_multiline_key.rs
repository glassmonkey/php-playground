use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};
fn decode(s: &str) -> String {
    let mut chars = s.chars();
    let mut out = String::new();
    while let Some(c) = chars.next() {
        if c == '\\' {
            out.push(match chars.next().unwrap() {
                '\\' => '\\',
                'n' => '\n',
                'r' => '\r',
                't' => '\t',
                _ => panic!("fixture escape"),
            });
        } else {
            out.push(c);
        }
    }
    out
}
fn offset(source: &str, p: Position) -> Option<usize> {
    let bytes = source.as_bytes();
    let mut starts = vec![0];
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\r' {
            if bytes.get(i + 1) == Some(&b'\n') {
                i += 1;
            }
            starts.push(i + 1);
        } else if bytes[i] == b'\n' {
            starts.push(i + 1);
        }
        i += 1;
    }
    let start = *starts.get(p.line as usize)?;
    let mut units = 0;
    for (i, ch) in source[start..].char_indices() {
        if units == p.character {
            return Some(start + i);
        }
        if matches!(ch, '\r' | '\n') {
            return None;
        }
        units += ch.len_utf16() as u32;
        if units > p.character {
            return None;
        }
    }
    (units == p.character).then_some(source.len())
}
fn apply(source: &str, item: &CompletionItem) -> Option<String> {
    let Some(CompletionItemTextEdit::TextEdit(primary)) = &item.text_edit else {
        return None;
    };
    let mut edits = item.additional_text_edits.clone().unwrap_or_default();
    edits.push(primary.clone());
    let mut spans = Vec::new();
    for edit in edits {
        spans.push((
            offset(source, edit.range.start)?,
            offset(source, edit.range.end)?,
            edit.new_text,
        ));
    }
    spans.sort_by_key(|e| std::cmp::Reverse(e.0));
    let mut out = source.to_owned();
    let mut last = source.len();
    for (a, b, text) in spans {
        if a > b || b > last {
            return None;
        }
        out.replace_range(a..b, &text);
        last = a;
    }
    Some(out)
}
fn expected(f: &[String]) -> CompletionItem {
    CompletionItem {
        label: f[4].clone(),
        kind: Some(CompletionItemKind::Field),
        detail: Some(f[5].clone()),
        sort_text: Some(f[6].clone()),
        filter_text: Some(f[4].clone()),
        text_edit: Some(CompletionItemTextEdit::TextEdit(TextEdit {
            range: Range::new(
                Position::new(f[7].parse().unwrap(), f[8].parse().unwrap()),
                Position::new(f[9].parse().unwrap(), f[10].parse().unwrap()),
            ),
            new_text: f[11].clone(),
        })),
        ..Default::default()
    }
}
async fn items(sut: &Backend, uri: &Uri, position: Position) -> Vec<CompletionItem> {
    match sut
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
        .unwrap()
    {
        Some(CompletionResponse::CompletionItemList(v)) => v,
        Some(CompletionResponse::CompletionList(v)) => v.items,
        None => Vec::new(),
    }
}
#[tokio::test]
async fn original_public_multiline_literals_preserve_full_payloads() {
    run_cases(
        include_str!("fixtures/multiline-key-original.tsv"),
        6,
        "MULTILINE_ORIGINAL",
    )
    .await;
}
async fn run_cases(raw: &str, count: usize, tag: &str) {
    let rows = raw
        .strip_suffix('\n')
        .unwrap()
        .split('\n')
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), count);
    let mut failures = Vec::new();
    let mut payloads = 0;
    for row in rows {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        assert_eq!(f.len(), 15);
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///multiline-key.php").unwrap();
            sut.did_open(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: uri.clone(),
                    language_id: "php".into(),
                    version: 1,
                    text: f[1].clone(),
                },
            })
            .await;
            for warm in [false, true] {
                let all = items(
                    &sut,
                    &uri,
                    Position::new(f[2].parse().unwrap(), f[3].parse().unwrap()),
                )
                .await;
                let selected = all
                    .iter()
                    .filter(|i| i.label == f[4] && i.kind == Some(CompletionItemKind::Field))
                    .collect::<Vec<_>>();
                if selected.len() != 1 {
                    eprintln!(
                        "{tag}_MISSING name={} minor={minor} warm={warm} source={:?} items={all:?}",
                        f[0], f[1]
                    );
                    failures.push(format!("{} missing", f[0]));
                    continue;
                }
                let resolved = sut.completion_resolve(selected[0].clone()).await.unwrap();
                let wanted = expected(&f);
                for (stage, payload) in [("initial", selected[0]), ("resolved", &resolved)] {
                    let accepted = apply(&f[1], payload);
                    eprintln!(
                        "{tag}_EDIT name={} minor={minor} warm={warm} stage={stage} source={:?} accepted={accepted:?} payload={payload:?}",
                        f[0], f[1]
                    );
                    if !contract(&f[1], payload, &wanted, &f[12]) {
                        failures.push(format!("{} {minor} {warm} {stage}", f[0]));
                    }
                    payloads += 1;
                }
            }
        }
    }
    eprintln!(
        "{tag} cases={count} payloads={payloads} failures={}",
        failures.len()
    );
    assert_eq!(payloads, count * 8);
    assert!(failures.is_empty(), "{failures:?}");
}

fn contract(source: &str, item: &CompletionItem, wanted: &CompletionItem, document: &str) -> bool {
    item == wanted && apply(source, item).as_deref() == Some(document)
}
#[tokio::test]
async fn expanded_multiline_keys_have_owned_ranges_and_full_documents() {
    run_cases(
        include_str!("fixtures/multiline-key-expanded.tsv"),
        201,
        "MULTILINE_EXPANDED",
    )
    .await;
}
#[tokio::test]
async fn multiline_document_changes_invalid_positions_and_resolved_mutants() {
    let fixtures = include_str!("fixtures/multiline-key-expanded.tsv")
        .strip_suffix('\n')
        .unwrap()
        .split('\n')
        .map(|row| row.split('\t').map(decode).collect::<Vec<_>>())
        .collect::<Vec<_>>();
    let names = [
        "LF-single-adjacent-step0",
        "CRLF-double-later-cursor-step2",
        "CR-single-unicode-step1",
        "mixed-double-block-step1",
        "LF-single-later-cursor-step1",
        "mixed-double-later-cursor-step2",
    ];
    let mut payloads = 0;
    let mut rejected = 0;
    for minor in [0, 3] {
        let sut = Backend::new_headless();
        sut.set_php_version(PhpVersion::new(8, minor));
        let uri = Uri::parse("file:///multiline-key-changed.php").unwrap();
        sut.did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri.clone(),
                language_id: "php".into(),
                version: 1,
                text: "<?php".into(),
            },
        })
        .await;
        for (index, name) in names.iter().enumerate() {
            let f = fixtures.iter().find(|f| f[0] == *name).unwrap();
            let wanted = expected(f);
            sut.did_change(DidChangeTextDocumentParams {
                text_document: VersionedTextDocumentIdentifier {
                    text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                    version: index as i32 + 2,
                },
                content_changes: vec![
                    TextDocumentContentChangeEvent::TextDocumentContentChangeWholeDocument(
                        TextDocumentContentChangeWholeDocument { text: f[1].clone() },
                    ),
                ],
            })
            .await;
            for warm in [false, true] {
                let all = items(
                    &sut,
                    &uri,
                    Position::new(f[2].parse().unwrap(), f[3].parse().unwrap()),
                )
                .await;
                let selected = all
                    .iter()
                    .filter(|i| i.label == f[4] && i.kind == Some(CompletionItemKind::Field))
                    .collect::<Vec<_>>();
                assert_eq!(selected.len(), 1, "{name}: {all:?}");
                let resolved = sut.completion_resolve(selected[0].clone()).await.unwrap();
                for (stage, payload) in [("initial", selected[0]), ("resolved", &resolved)] {
                    assert!(
                        contract(&f[1], payload, &wanted, &f[12]),
                        "{name} {stage}: {payload:?} wanted={wanted:?}"
                    );
                    eprintln!(
                        "MULTILINE_CHANGE_EDIT name={name} minor={minor} warm={warm} stage={stage} source={:?} accepted={:?} payload={payload:?}",
                        f[1],
                        apply(&f[1], payload)
                    );
                    payloads += 1;
                    if minor == 0 && index == 0 && !warm {
                        for field in 0..3 {
                            let mut wrong = payload.clone();
                            match field {
                                0 => {
                                    let Some(CompletionItemTextEdit::TextEdit(e)) =
                                        &mut wrong.text_edit
                                    else {
                                        panic!("primary")
                                    };
                                    e.range.end.character += 1;
                                }
                                1 => {
                                    let Some(CompletionItemTextEdit::TextEdit(e)) =
                                        &mut wrong.text_edit
                                    else {
                                        panic!("primary")
                                    };
                                    e.new_text.push_str("WRONG");
                                }
                                _ => {
                                    wrong.additional_text_edits = Some(vec![TextEdit {
                                        range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                                        new_text: "WRONG".into(),
                                    }])
                                }
                            };
                            assert_eq!(wrong.label, payload.label);
                            assert_eq!(wrong.data, payload.data);
                            assert!(!contract(&f[1], &wrong, &wanted, &f[12]));
                            rejected += 1;
                        }
                    }
                }
            }
        }
        let f = fixtures
            .iter()
            .find(|f| f[0] == "LF-single-unicode-step1")
            .unwrap();
        sut.did_change(DidChangeTextDocumentParams {
            text_document: VersionedTextDocumentIdentifier {
                text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                version: 10,
            },
            content_changes: vec![
                TextDocumentContentChangeEvent::TextDocumentContentChangeWholeDocument(
                    TextDocumentContentChangeWholeDocument { text: f[1].clone() },
                ),
            ],
        })
        .await;
        for position in [
            Position::new(f[7].parse().unwrap(), f[8].parse::<u32>().unwrap() + 2),
            Position::new(99, 0),
            Position::new(0, 999),
        ] {
            let all = items(&sut, &uri, position).await;
            assert!(
                !all.iter()
                    .any(|i| i.label == f[4] && i.kind == Some(CompletionItemKind::Field)),
                "{position:?} {all:?}"
            );
        }
    }
    assert_eq!(payloads, 48);
    assert_eq!(rejected, 6);
    eprintln!("MULTILINE_CHANGE payloads={payloads} invalidRequests=6 mutants={rejected}");
}

#[tokio::test]
async fn later_line_draft_does_not_consume_next_statement_quote() {
    run_cases(
        include_str!("fixtures/multiline-key-boundary.tsv"),
        2,
        "MULTILINE_BOUNDARY",
    )
    .await;
}
