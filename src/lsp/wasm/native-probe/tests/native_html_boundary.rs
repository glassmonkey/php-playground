use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};
fn decode(s: &str) -> String {
    if s == "\\e" {
        return String::new();
    }
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

fn fixture_rows(raw: &str, row_count: usize, field_count: usize) -> Vec<Vec<String>> {
    let rows = raw
        .strip_suffix('\n')
        .expect("fixture terminal LF")
        .split('\n')
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), row_count, "complete ordered rows");
    rows.into_iter()
        .map(|row| {
            assert!(!row.is_empty(), "blank fixture row");
            let fields = row.split('\t').collect::<Vec<_>>();
            assert_eq!(fields.len(), field_count, "complete fixture fields");
            fields.into_iter().map(decode).collect()
        })
        .collect()
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
async fn run_cases(raw: &str, count: usize, tag: &str) {
    let rows = fixture_rows(raw, count, 15);
    let mut failures = Vec::new();
    let mut payloads = 0;
    for f in rows {
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
                if warm {
                    warm_php(&sut).await;
                }
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

async fn warm_php(sut: &Backend) {
    let uri = Uri::parse("file:///html-warm-sibling.php").unwrap();
    sut.did_open(DidOpenTextDocumentParams {
        text_document: TextDocumentItem {
            uri: uri.clone(),
            language_id: "php".into(),
            version: 1,
            text: "<?php abs".into(),
        },
    })
    .await;
    let all = items(sut, &uri, Position::new(0, 9)).await;
    let selected = all
        .iter()
        .find(|i| {
            i.kind == Some(CompletionItemKind::Function)
                && i.data
                    .as_ref()
                    .and_then(|d| d.get("m"))
                    .and_then(|m| m.as_str())
                    == Some("abs")
        })
        .expect("real PHP sibling builtin positive");
    let resolved = sut.completion_resolve(selected.clone()).await.unwrap();
    assert_eq!(
        resolved
            .data
            .as_ref()
            .and_then(|d| d.get("m"))
            .and_then(|m| m.as_str()),
        Some("abs")
    );
}
#[tokio::test]
async fn html_outside_php_never_reaches_php_completion() {
    let raw = include_str!("fixtures/html-outside-negative.tsv");
    let rows = fixture_rows(raw, 65, 5);
    let mut failures = Vec::new();
    let mut requests = 0;
    for f in rows {
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///html-boundary.php").unwrap();
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
                if warm {
                    warm_php(&sut).await;
                }
                let got = items(
                    &sut,
                    &uri,
                    Position::new(f[2].parse().unwrap(), f[3].parse().unwrap()),
                )
                .await;
                requests += 1;
                eprintln!(
                    "HTML_NEGATIVE name={} minor={minor} warm={warm} source={:?} items={got:?}",
                    f[0], f[1]
                );
                if !got.is_empty() {
                    failures.push(format!("{} {minor} {warm}", f[0]));
                }
            }
        }
    }
    eprintln!(
        "HTML_NEGATIVE requests={requests} failures={}",
        failures.len()
    );
    assert_eq!(requests, 260);
    assert!(failures.is_empty(), "{failures:?}");
}
#[tokio::test]
async fn php_reopen_and_opaque_lookalikes_keep_full_selected_key_identity() {
    run_cases(
        include_str!("fixtures/html-php-positive.tsv"),
        52,
        "HTML_PHP",
    )
    .await;
}

#[tokio::test]
async fn html_transitions_preserve_docblock_specialized_completion() {
    let mut count = 0;
    for eol in ["\n", "\r\n", "\r"] {
        for prefix in ["<i>🌟</i><?php ", "<?php // ?><i>🌟</i><?php "] {
            let source = format!(
                "{prefix}/** @pa */{eol}function f(int $alpha): int {{ return $alpha; }} echo 7;"
            );
            let at = source.find("@pa").unwrap() + 3;
            let column = source[..at].encode_utf16().count() as u32;
            let want = CompletionItem {
                label: "@param int $alpha".into(),
                kind: Some(CompletionItemKind::Keyword),
                detail: Some("Document a function parameter".into()),
                sort_text: Some("0a_@param_000".into()),
                filter_text: Some("@param".into()),
                insert_text: Some("param int $alpha".into()),
                ..Default::default()
            };
            let expected = source.replacen("@pa */", "@param int $alpha */", 1);
            for minor in [0, 3] {
                let sut = Backend::new_headless();
                sut.set_php_version(PhpVersion::new(8, minor));
                let uri = Uri::parse("file:///html-docblock.php").unwrap();
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
                    if warm {
                        warm_php(&sut).await;
                    }
                    let got = items(&sut, &uri, Position::new(0, column)).await;
                    let initial = got
                        .iter()
                        .find(|i| i.label == want.label)
                        .expect("PHPDoc positive after reopening");
                    let resolved = sut.completion_resolve(initial.clone()).await.unwrap();
                    for (stage, payload) in [("initial", initial), ("resolved", &resolved)] {
                        assert_eq!(payload, &want);
                        let start = offset(&source, Position::new(0, column - 2)).unwrap();
                        let end = offset(&source, Position::new(0, column)).unwrap();
                        let mut document = source.clone();
                        document.replace_range(start..end, payload.insert_text.as_deref().unwrap());
                        assert_eq!(document, expected);
                        eprintln!(
                            "HTML_DOC_EDIT minor={minor} warm={warm} stage={stage} source={source:?} accepted={document:?} payload={payload:?}"
                        );
                        count += 1;
                    }
                }
            }
        }
    }
    assert_eq!(count, 48);
}
#[tokio::test]
async fn did_change_code_html_reopen_keeps_full_edit_contract_and_rejects_mutants() {
    let raw = include_str!("fixtures/html-php-positive.tsv");
    let positive = raw
        .strip_suffix('\n')
        .unwrap()
        .split('\n')
        .map(|row| row.split('\t').map(decode).collect::<Vec<_>>())
        .collect::<Vec<_>>();
    let negative = include_str!("fixtures/html-outside-negative.tsv")
        .strip_suffix('\n')
        .unwrap()
        .split('\n')
        .map(|row| row.split('\t').map(decode).collect::<Vec<_>>())
        .find(|f| f[0] == "original")
        .unwrap();
    let first = positive.iter().find(|f| f[0] == "LF-single-code").unwrap();
    let last = positive
        .iter()
        .find(|f| f[0] == "CR-//-same-line-reopen")
        .unwrap();
    let mut pairs = 0;
    let mut empty = 0;
    let mut mutants = 0;
    for minor in [0, 3] {
        let sut = Backend::new_headless();
        sut.set_php_version(PhpVersion::new(8, minor));
        let uri = Uri::parse("file:///html-lifecycle.php").unwrap();
        for (step, row) in [first, &negative, last].into_iter().enumerate() {
            let source = &row[1];
            if step == 0 {
                sut.did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: uri.clone(),
                        language_id: "php".into(),
                        version: 1,
                        text: source.clone(),
                    },
                })
                .await;
            } else {
                sut.did_change(DidChangeTextDocumentParams {
                    text_document: VersionedTextDocumentIdentifier {
                        text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                        version: step as i32 + 1,
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
            }
            let position = Position::new(row[2].parse().unwrap(), row[3].parse().unwrap());
            let got = items(&sut, &uri, position).await;
            if step == 1 {
                assert_eq!(got, Vec::<CompletionItem>::new());
                empty += 1;
                for invalid in [
                    Position::new(99, 0),
                    Position::new(0, 999),
                    Position::new(3, 6),
                ] {
                    assert!(items(&sut, &uri, invalid).await.is_empty());
                    empty += 1;
                }
            } else {
                let wanted = expected(row);
                let initial = got
                    .iter()
                    .find(|i| i.label == row[4] && i.kind == Some(CompletionItemKind::Field))
                    .unwrap();
                let resolved = sut.completion_resolve(initial.clone()).await.unwrap();
                for (stage, payload) in [("initial", initial), ("resolved", &resolved)] {
                    assert!(contract(source, payload, &wanted, &row[12]));
                    pairs += 1;
                    eprintln!(
                        "HTML_CHANGE_EDIT minor={minor} step={step} stage={stage} source={source:?} accepted={:?} payload={payload:?}",
                        apply(source, payload)
                    );
                    if minor == 0 && step == 0 {
                        for kind in [0, 1, 2] {
                            let mut bad = payload.clone();
                            if let Some(CompletionItemTextEdit::TextEdit(edit)) = &mut bad.text_edit
                            {
                                if kind == 0 {
                                    edit.range.end.character += 1;
                                } else if kind == 1 {
                                    edit.new_text.push_str("bad");
                                }
                            }
                            if kind == 2 {
                                bad.additional_text_edits = Some(vec![TextEdit {
                                    range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                                    new_text: "BAD".into(),
                                }]);
                            }
                            assert_eq!(bad.label, payload.label);
                            assert_eq!(bad.data, payload.data);
                            assert!(!contract(source, &bad, &wanted, &row[12]));
                            mutants += 1;
                        }
                    }
                }
            }
        }
    }
    assert_eq!((pairs, empty, mutants), (8, 8, 6));
}

#[test]
fn html_fixture_transport_preserves_all_cells_and_rejects_unknown_escapes() {
    for (file, raw, rows, columns) in [
        (
            "html-php-positive.tsv",
            include_str!("fixtures/html-php-positive.tsv"),
            52,
            15,
        ),
        (
            "html-outside-negative.tsv",
            include_str!("fixtures/html-outside-negative.tsv"),
            65,
            5,
        ),
        (
            "html-phpdoc-positive.tsv",
            include_str!("fixtures/html-phpdoc-positive.tsv"),
            6,
            6,
        ),
    ] {
        let lines = fixture_rows(raw, rows, columns);
        for (row, fields) in lines.iter().enumerate() {
            for (column, value) in fields.iter().enumerate() {
                let hex = value
                    .as_bytes()
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect::<String>();
                eprintln!("HTML_CELL file={file} row={row} column={column} utf8hex={hex}");
            }
        }
    }
    assert_eq!(fixture_rows("\\e\n", 1, 1), vec![vec![String::new()]]);
    assert_eq!(decode("\\\\e"), "\\e");
    for (name, raw, rows, fields) in [
        ("unknown", "\\q\n", 1, 1),
        ("truncated-escape", "\\\n", 1, 1),
        ("embedded-empty-escape", "\\eX\n", 1, 1),
        ("missing-terminal", "a", 1, 1),
        ("missing-column", "a\n", 1, 2),
        ("extra-column", "a\tb\n", 1, 1),
        ("blank-row-matching-count", "a\n\n", 2, 1),
        ("extra-blank-row", "a\n\n", 1, 1),
    ] {
        assert!(
            std::panic::catch_unwind(|| fixture_rows(raw, rows, fields)).is_err(),
            "malformed fixture {name}"
        );
    }
}

#[tokio::test]
async fn nested_interpolation_preserves_following_php_original_contract() {
    run_cases(
        include_str!("fixtures/nested-interpolation-original.tsv"),
        3,
        "NESTED_ORIGINAL",
    )
    .await;
}

#[tokio::test]
async fn nested_interpolation_preserves_following_php_expanded_contract() {
    run_cases(
        include_str!("fixtures/nested-interpolation-expanded.tsv"),
        204,
        "NESTED_EXPANDED",
    )
    .await;
}

#[tokio::test]
async fn nested_interpolation_did_change_and_resolved_edit_mutants() {
    let originals = fixture_rows(
        include_str!("fixtures/nested-interpolation-original.tsv"),
        3,
        15,
    );
    let expanded = fixture_rows(
        include_str!("fixtures/nested-interpolation-expanded.tsv"),
        204,
        15,
    );
    let rows = [
        originals[0].clone(),
        expanded
            .iter()
            .find(|f| f[0] == "mixed-nested-double-step1")
            .unwrap()
            .clone(),
    ];
    let mut payloads = 0;
    let mut mutants = 0;
    for minor in [0, 3] {
        for row in &rows {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///nested-lifecycle.php").unwrap();
            let html = format!("{} ?><div>na</div>", row[1]);
            for (step, source) in [&row[1], &html, &row[1]].into_iter().enumerate() {
                if step == 0 {
                    sut.did_open(DidOpenTextDocumentParams {
                        text_document: TextDocumentItem {
                            uri: uri.clone(),
                            language_id: "php".into(),
                            version: 1,
                            text: source.clone(),
                        },
                    })
                    .await;
                } else {
                    sut.did_change(DidChangeTextDocumentParams {
                        text_document: VersionedTextDocumentIdentifier {
                            text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                            version: step as i32 + 1,
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
                }
                let position = if step == 1 {
                    let marker = source.rfind("na</div>").unwrap();
                    // Count original canonical EOL/UTF16 independently of the production converter.
                    let mut line = 0;
                    let mut column = 0;
                    let mut chars = source[..marker + 2].chars().peekable();
                    while let Some(ch) = chars.next() {
                        match ch {
                            '\r' => {
                                if chars.peek() == Some(&'\n') {
                                    chars.next();
                                }
                                line += 1;
                                column = 0;
                            }
                            '\n' => {
                                line += 1;
                                column = 0;
                            }
                            _ => column += ch.len_utf16() as u32,
                        }
                    }
                    Position::new(line, column)
                } else {
                    Position::new(row[2].parse().unwrap(), row[3].parse().unwrap())
                };
                let got = items(&sut, &uri, position).await;
                if step == 1 {
                    assert!(got.is_empty());
                    continue;
                }
                let initial = got
                    .iter()
                    .find(|i| i.label == row[4] && i.kind == Some(CompletionItemKind::Field))
                    .expect("positive after lifecycle");
                let resolved = sut.completion_resolve(initial.clone()).await.unwrap();
                let wanted = expected(row);
                for item in [initial, &resolved] {
                    assert!(contract(source, item, &wanted, &row[12]));
                    payloads += 1;
                    for kind in 0..3 {
                        let mut changed = item.clone();
                        if kind == 2 {
                            changed.additional_text_edits = Some(vec![TextEdit {
                                range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                                new_text: "<?php use Wrong; ?>".into(),
                            }]);
                        } else if let Some(CompletionItemTextEdit::TextEdit(edit)) =
                            &mut changed.text_edit
                        {
                            if kind == 0 {
                                edit.range.end.character -= 1;
                            } else {
                                edit.new_text = "wrong']".into();
                            }
                        }
                        assert!(!contract(source, &changed, &wanted, &row[12]));
                        mutants += 1;
                    }
                }
            }
        }
    }
    assert_eq!((payloads, mutants), (16, 48));
}
