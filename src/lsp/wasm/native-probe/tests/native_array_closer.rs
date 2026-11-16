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
async fn original_multiline_and_same_line_array_closers_preserve_full_payloads() {
    let rows = include_str!("fixtures/array-closer-original.tsv")
        .strip_suffix('\n')
        .unwrap()
        .split('\n')
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 15);
    let mut requests = 0;
    let mut payloads = 0;
    let mut failures = Vec::new();
    let mut multiline_failed = 0;
    let mut same_line_passed = 0;
    for row in rows {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        assert_eq!(f.len(), 15);
        let source = &f[1];
        let wanted = expected(&f);
        let tail = &source[offset(
            source,
            wanted
                .text_edit
                .as_ref()
                .and_then(|e| {
                    if let CompletionItemTextEdit::TextEdit(e) = e {
                        Some(e.range.end)
                    } else {
                        None
                    }
                })
                .unwrap(),
        )
        .unwrap()..];
        let multiline = tail[..tail.find(']').unwrap_or(tail.len())].contains(['\r', '\n']);
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///array-closer-original.php").unwrap();
            sut.did_open(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: uri.clone(),
                    language_id: "php".into(),
                    version: 1,
                    text: source.clone(),
                },
            })
            .await;
            for warm in [false, true] {
                requests += 1;
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
                        "ARRAY_ORIGINAL_MISSING name={} minor={minor} warm={warm} source={source:?} items={all:?}",
                        f[0]
                    );
                    failures.push(format!("{} missing", f[0]));
                    continue;
                }
                let initial = selected[0];
                let resolved = sut.completion_resolve(initial.clone()).await.unwrap();
                for (stage, payload) in [("initial", initial), ("resolved", &resolved)] {
                    let accepted = apply(source, payload);
                    eprintln!(
                        "ARRAY_ORIGINAL_EDIT name={} minor={minor} warm={warm} stage={stage} source={source:?} accepted={accepted:?} payload={payload:?}",
                        f[0]
                    );
                    let passed = payload == &wanted && accepted.as_deref() == Some(f[12].as_str());
                    if !passed {
                        failures.push(format!(
                            "{} {minor} warm={warm} {stage} full contract",
                            f[0]
                        ));
                        if multiline {
                            multiline_failed += 1;
                        }
                    } else if !multiline {
                        same_line_passed += 1;
                    }
                    payloads += 1;
                }
            }
        }
    }
    eprintln!(
        "ARRAY_ORIGINAL requests={requests} payloads={payloads} multiline_failed={multiline_failed} same_line_passed={same_line_passed} failures={}",
        failures.len()
    );
    assert_eq!((requests, payloads), (60, 120));
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn expanded_trivia_spelling_drafts_and_boundaries_keep_full_documents() {
    let rows = include_str!("fixtures/array-closer-expanded.tsv")
        .strip_suffix('\n')
        .unwrap()
        .split('\n')
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 158);
    let mut requests = 0;
    let mut payloads = 0;
    let mut rejected = 0;
    let mut failures = Vec::new();
    for (row_index, row) in rows.iter().enumerate() {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        assert_eq!(f.len(), 15);
        assert!(matches!(f[13].as_str(), "valid" | "draft"));
        let source = &f[1];
        let wanted = expected(&f);
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///array-closer-expanded.php").unwrap();
            sut.did_open(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: uri.clone(),
                    language_id: "php".into(),
                    version: 1,
                    text: source.clone(),
                },
            })
            .await;
            for warm in [false, true] {
                requests += 1;
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
                        "ARRAY_EXPANDED_MISSING name={} minor={minor} warm={warm} source={source:?} items={all:?}",
                        f[0]
                    );
                    failures.push(format!(
                        "{} {minor} warm={warm} selected={}",
                        f[0],
                        selected.len()
                    ));
                    continue;
                }
                let initial = selected[0];
                let resolved = sut.completion_resolve(initial.clone()).await.unwrap();
                for (stage, payload) in [("initial", initial), ("resolved", &resolved)] {
                    let accepted = apply(source, payload);
                    eprintln!(
                        "ARRAY_EXPANDED_EDIT name={} minor={minor} warm={warm} stage={stage} mode={} source={source:?} accepted={accepted:?} payload={payload:?}",
                        f[0], f[13]
                    );
                    if payload != &wanted || accepted.as_deref() != Some(f[12].as_str()) {
                        failures.push(format!("{} {minor} warm={warm} {stage} full contract expected={wanted:?} expectedDoc={:?}",f[0],f[12]));
                    }
                    payloads += 1;
                    if row_index == 0 && minor == 0 && !warm {
                        for mutation in 0..3 {
                            let mut wrong = payload.clone();
                            match mutation {
                                0 => {
                                    let Some(CompletionItemTextEdit::TextEdit(edit)) =
                                        &mut wrong.text_edit
                                    else {
                                        panic!("primary")
                                    };
                                    edit.range.end.character -= 1;
                                }
                                1 => {
                                    let Some(CompletionItemTextEdit::TextEdit(edit)) =
                                        &mut wrong.text_edit
                                    else {
                                        panic!("primary")
                                    };
                                    edit.new_text.push_str("_WRONG");
                                }
                                _ => {
                                    wrong.additional_text_edits = Some(vec![TextEdit {
                                        range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                                        new_text: "/*WRONG*/".into(),
                                    }])
                                }
                            };
                            assert_eq!(wrong.data, payload.data);
                            assert_eq!(wrong.label, payload.label);
                            assert!(
                                wrong != wanted
                                    || apply(source, &wrong).as_deref() != Some(f[12].as_str())
                            );
                            rejected += 1;
                        }
                    }
                }
            }
        }
    }
    eprintln!(
        "ARRAY_EXPANDED requests={requests} payloads={payloads} rejected={rejected} failures={}",
        failures.len()
    );
    assert_eq!((requests, payloads), (632, 1264), "{failures:#?}");
    assert_eq!(rejected, 6);
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn document_changes_recompute_closers_and_invalid_positions_do_not_select_keys() {
    let rows = include_str!("fixtures/array-closer-expanded.tsv")
        .strip_suffix('\n')
        .unwrap()
        .split('\n');
    let names = [
        "LF-newline-step0",
        "CRLF-multilineblock-step2",
        "CR-missing-quote-nextline-step1",
        "mixed-unicode-step3",
    ];
    let fixtures = rows
        .map(|row| row.split('\t').map(decode).collect::<Vec<_>>())
        .collect::<Vec<_>>();
    let mut payloads = 0;
    for minor in [0, 3] {
        let sut = Backend::new_headless();
        sut.set_php_version(PhpVersion::new(8, minor));
        let uri = Uri::parse("file:///array-closer-changed.php").unwrap();
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
            let source = &f[1];
            let wanted = expected(f);
            sut.did_change(DidChangeTextDocumentParams {
                text_document: VersionedTextDocumentIdentifier {
                    text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                    version: index as i32 + 2,
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
                assert_eq!(selected.len(), 1);
                let resolved = sut.completion_resolve(selected[0].clone()).await.unwrap();
                for (stage, payload) in [("initial", selected[0]), ("resolved", &resolved)] {
                    assert_eq!(payload, &wanted);
                    assert_eq!(apply(source, payload).as_deref(), Some(f[12].as_str()));
                    payloads += 1;
                    eprintln!(
                        "ARRAY_CHANGE_EDIT name={name} minor={minor} warm={warm} stage={stage} source={source:?} accepted={:?} payload={payload:?}",
                        apply(source, payload)
                    );
                }
            }
        }
        let source = "<?php\r/* 🌟 */ $data=['name'=>7];\r";
        sut.did_change(DidChangeTextDocumentParams {
            text_document: VersionedTextDocumentIdentifier {
                text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                version: 10,
            },
            content_changes: vec![
                TextDocumentContentChangeEvent::TextDocumentContentChangeWholeDocument(
                    TextDocumentContentChangeWholeDocument {
                        text: source.into(),
                    },
                ),
            ],
        })
        .await;
        for position in [
            Position::new(1, 4),
            Position::new(1, 999),
            Position::new(9, 0),
        ] {
            let all = items(&sut, &uri, position).await;
            assert!(
                !all.iter()
                    .any(|i| i.label == "name" && i.kind == Some(CompletionItemKind::Field)),
                "{position:?}: {all:?}"
            );
        }
    }
    assert_eq!(payloads, 32);
    eprintln!("ARRAY_CHANGE payloads={payloads} invalidRequests=6");
}
