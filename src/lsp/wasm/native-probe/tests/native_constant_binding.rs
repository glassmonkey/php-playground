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
fn offset(s: &str, p: Position) -> usize {
    let mut starts = vec![0];
    let b = s.as_bytes();
    let mut at = 0;
    while at < b.len() {
        if b[at] == b'\r' {
            if b.get(at + 1) == Some(&b'\n') {
                at += 1;
            }
            starts.push(at + 1);
        } else if b[at] == b'\n' {
            starts.push(at + 1);
        }
        at += 1;
    }
    let start = *starts.get(p.line as usize).expect("edit line");
    let mut col = 0;
    for (i, c) in s[start..].char_indices() {
        if col == p.character {
            return start + i;
        }
        assert!(!matches!(c, '\r' | '\n'));
        col += c.len_utf16() as u32;
        assert!(col <= p.character);
    }
    assert_eq!(col, p.character);
    s.len()
}
fn apply(s: &str, item: &CompletionItem) -> String {
    let Some(CompletionItemTextEdit::TextEdit(primary)) = &item.text_edit else {
        panic!("explicit primary required")
    };
    let mut edits = item.additional_text_edits.clone().unwrap_or_default();
    edits.push(primary.clone());
    let mut edits = edits
        .iter()
        .map(|e| {
            (
                offset(s, e.range.start),
                offset(s, e.range.end),
                &e.new_text,
            )
        })
        .collect::<Vec<_>>();
    edits.sort_by_key(|e| std::cmp::Reverse(e.0));
    let mut out = s.to_owned();
    let mut last = s.len();
    for (a, b, t) in edits {
        assert!(a <= b && b <= last);
        out.replace_range(a..b, t);
        last = a;
    }
    out
}
#[tokio::test]
async fn original_public_constants_preserve_explicit_selected_identity() {
    let rows = include_str!("fixtures/original-constant-binding.tsv")
        .lines()
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 3);
    let mut failures = Vec::new();
    let mut requests = 0;
    let mut checked = 0;
    for row in rows {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        let (name, fqn, source) = (&f[0], &f[1], &f[2]);
        let token = format!("\\{fqn}");
        let byte = source.rfind(&token).unwrap();
        let start = source[..byte].encode_utf16().count() as u32;
        let end = start + token.encode_utf16().count() as u32;
        let expected = CompletionItemTextEdit::TextEdit(TextEdit {
            range: Range::new(Position::new(0, start), Position::new(0, end)),
            new_text: token.clone(),
        });
        for minor in [0, 3] {
            for step in [0, 3, token.encode_utf16().count() as u32] {
                let sut = Backend::new_headless();
                sut.set_php_version(PhpVersion::new(8, minor));
                let uri = Uri::parse("file:///independent-constant.php").unwrap();
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
                    let response = sut
                        .completion(CompletionParams {
                            text_document_position_params: TextDocumentPositionParams {
                                text_document: TextDocumentIdentifier { uri: uri.clone() },
                                position: Position::new(0, start + step),
                            },
                            work_done_progress_params: Default::default(),
                            partial_result_params: Default::default(),
                            context: None,
                        })
                        .await
                        .unwrap();
                    requests += 1;
                    let items = match response {
                        Some(CompletionResponse::CompletionItemList(v)) => v,
                        Some(CompletionResponse::CompletionList(v)) => v.items,
                        None => Vec::new(),
                    };
                    let Some(item) = items.iter().find(|i| {
                        i.kind == Some(CompletionItemKind::Constant)
                            && i.data
                                .as_ref()
                                .and_then(|d| d.get("m"))
                                .and_then(|m| m.as_str())
                                == Some(fqn.as_str())
                    }) else {
                        failures.push(format!("{name} PHP8.{minor} step={step} warm={warm} missing candidate, items={items:?}"));
                        continue;
                    };
                    let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                    for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                        let actual = apply(source, payload);
                        let identity = payload.data.as_ref().is_some_and(|d| {
                            d.get("m").and_then(|m| m.as_str()) == Some(fqn.as_str())
                                && d.get("k").and_then(|m| m.as_str()) == Some("global_constant")
                                && d.get("c").and_then(|m| m.as_str()) == Some("")
                                && d.get("u").and_then(|m| m.as_str()) == Some(uri.as_str())
                        });
                        eprintln!(
                            "ORIGINAL_CONSTANT name={name} minor={minor} step={step} warm={warm} stage={stage} source={source:?} applied={actual:?} payload={payload:?}"
                        );
                        if !identity
                            || payload.kind != Some(CompletionItemKind::Constant)
                            || payload.label != *fqn
                            || payload.filter_text.as_deref() != Some(fqn.as_str())
                            || payload.insert_text.as_deref() != Some(token.as_str())
                            || payload.text_edit.as_ref() != Some(&expected)
                            || actual != *source
                            || payload
                                .additional_text_edits
                                .as_ref()
                                .is_some_and(|v| !v.is_empty())
                            || payload.insert_text_format.is_some()
                            || payload.command.is_some()
                            || payload.text_edit_text.is_some()
                            || payload.insert_text_mode.is_some()
                        {
                            failures.push(format!("{name} PHP8.{minor} step={step} warm={warm} {stage} identity={identity} expectedDoc={source:?} actualDoc={actual:?}"));
                        }
                        checked += 1;
                    }
                }
            }
        }
    }
    eprintln!(
        "ORIGINAL_CONSTANT requests={requests} payloads={checked} failures={}",
        failures.len()
    );
    assert_eq!(requests, 36);
    assert_eq!(checked, 72, "missing positives: {failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}

fn scoped_contract(source: &str, payload: &CompletionItem, f: &[String], uri: &Uri) -> bool {
    let range = Range::new(
        Position::new(f[11].parse().unwrap(), f[12].parse().unwrap()),
        Position::new(f[11].parse().unwrap(), f[13].parse().unwrap()),
    );
    let edit = CompletionItemTextEdit::TextEdit(TextEdit {
        range,
        new_text: f[4].clone(),
    });
    let format = if f[6] == "none" {
        None
    } else {
        Some(InsertTextFormat::PlainText)
    };
    let identity = payload.data.as_ref().is_some_and(|d| {
        d.get("m").and_then(|v| v.as_str()) == Some(f[3].as_str())
            && d.get("c").and_then(|v| v.as_str()) == Some("")
            && d.get("k").and_then(|v| v.as_str()) == Some("global_constant")
            && d.get("u").and_then(|v| v.as_str()) == Some(uri.as_str())
    });
    identity
        && payload.kind == Some(CompletionItemKind::Constant)
        && payload.label == f[3]
        && payload.filter_text.as_deref() == Some(f[5].as_str())
        && payload.insert_text.as_deref() == Some(f[4].as_str())
        && payload.text_edit.as_ref() == Some(&edit)
        && payload.insert_text_format == format
        && payload
            .additional_text_edits
            .as_ref()
            .is_none_or(Vec::is_empty)
        && payload.command.is_none()
        && payload.text_edit_text.is_none()
        && payload.insert_text_mode.is_none()
        && apply(source, payload) == f[7]
}

#[tokio::test]
async fn scoped_constant_references_and_structural_imports_preserve_identity() {
    let rows = include_str!("fixtures/constant-scope.tsv")
        .lines()
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 16);
    let mut requests = 0;
    let mut payloads = 0;
    let mut failures = Vec::new();
    let mut rejected = 0;
    for row in rows {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        assert_eq!(f.len(), 16);
        let source = &f[1];
        let cursors = f[14]
            .split(',')
            .map(|v| v.parse::<u32>().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(cursors.len(), 3);
        for minor in [0, 3] {
            for cursor in &cursors {
                let sut = Backend::new_headless();
                sut.set_php_version(PhpVersion::new(8, minor));
                let uri = Uri::parse("file:///constant-scope.php").unwrap();
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
                    let position = Position::new(
                        f[11].parse().unwrap(),
                        f[12].parse::<u32>().unwrap() + cursor,
                    );
                    let response = sut
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
                    requests += 1;
                    let items = match response {
                        Some(CompletionResponse::CompletionItemList(v)) => v,
                        Some(CompletionResponse::CompletionList(v)) => v.items,
                        None => Vec::new(),
                    };
                    let Some(item) = items.iter().find(|i| {
                        i.kind == Some(CompletionItemKind::Constant)
                            && i.data
                                .as_ref()
                                .and_then(|d| d.get("m"))
                                .and_then(|m| m.as_str())
                                == Some(f[3].as_str())
                    }) else {
                        failures.push(format!("{} PHP8.{minor} cursor={cursor} warm={warm} missing FQN {}, items={items:?}",f[0],f[3]));
                        continue;
                    };
                    let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                    for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                        let actual = apply(source, payload);
                        let valid = scoped_contract(source, payload, &f, &uri);
                        eprintln!(
                            "SCOPED_CONSTANT name={} minor={minor} cursor={cursor} warm={warm} stage={stage} source={source:?} applied={actual:?} payload={payload:?}",
                            f[0]
                        );
                        if !valid {
                            failures.push(format!("{} PHP8.{minor} cursor={cursor} warm={warm} {stage}: expectedDoc={:?}, applied={actual:?}, payload={payload:?}",f[0],f[7]));
                        }
                        payloads += 1;
                    }
                    let docs = match &resolved.documentation {
                        Some(Documentation::MarkupContent(m)) => m.value.as_str(),
                        Some(Documentation::String(s)) => s.as_str(),
                        None => "",
                    };
                    if !docs.contains(&f[15]) {
                        failures.push(format!(
                            "{} selected docs missing {}: {resolved:?}",
                            f[0], f[15]
                        ));
                    }
                    if f[0] == "same-namespace"
                        && minor == 0
                        && *cursor == 0
                        && !warm
                        && scoped_contract(source, &resolved, &f, &uri)
                    {
                        for which in ["newText", "range", "additional"] {
                            let mut mutant = resolved.clone();
                            match which {
                                "newText" => {
                                    let Some(CompletionItemTextEdit::TextEdit(e)) =
                                        &mut mutant.text_edit
                                    else {
                                        unreachable!()
                                    };
                                    e.new_text = "WRONG".into();
                                }
                                "range" => {
                                    let Some(CompletionItemTextEdit::TextEdit(e)) =
                                        &mut mutant.text_edit
                                    else {
                                        unreachable!()
                                    };
                                    e.range.end.character += 1;
                                }
                                "additional" => {
                                    mutant.additional_text_edits = Some(vec![TextEdit {
                                        range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                                        new_text: "/* unexpected */".into(),
                                    }])
                                }
                                _ => unreachable!(),
                            };
                            assert_eq!(mutant.data, resolved.data);
                            assert!(
                                !scoped_contract(source, &mutant, &f, &uri),
                                "identity-only oracle accepted {which} mutation"
                            );
                            rejected += 1;
                        }
                    }
                }
            }
        }
    }
    eprintln!(
        "SCOPED_CONSTANT requests={requests} payloads={payloads} failures={} edit_mutants_rejected={rejected}",
        failures.len()
    );
    assert_eq!(requests, 192);
    assert_eq!(payloads, 384, "missing positives: {failures:#?}");
    assert_eq!(rejected, 3);
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn builtin_constant_identity_respects_all_target_boundaries() {
    let mut failures = Vec::new();
    let mut requests = 0;
    let mut payloads = 0;
    // Independent pinned Core_d declarations: E_ERROR is longstanding; both PHP_*
    // constants share @since 8.4. This table is not a production filter.
    for (major, minor) in [
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
    ] {
        for name in ["E_ERROR", "PHP_SBINDIR", "PHP_OUTPUT_HANDLER_PROCESSED"] {
            let present = name == "E_ERROR" || (major, minor) >= (8, 4);
            let source = format!("<?php namespace App {{const {name}=99; echo \\{name};}}");
            let start = source.rfind(&format!("\\{name}")).unwrap() as u32;
            let end = start + name.len() as u32 + 1;
            for step in [0, 3, name.len() as u32 + 1] {
                let sut = Backend::new_headless();
                sut.set_php_version(PhpVersion::new(major, minor));
                let uri = Uri::parse("file:///constant-builtin.php").unwrap();
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
                    let response = sut
                        .completion(CompletionParams {
                            text_document_position_params: TextDocumentPositionParams {
                                text_document: TextDocumentIdentifier { uri: uri.clone() },
                                position: Position::new(0, start + step),
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
                        None => Vec::new(),
                    };
                    let item = items.iter().find(|i| {
                        i.kind == Some(CompletionItemKind::Constant)
                            && i.data
                                .as_ref()
                                .and_then(|d| d.get("m"))
                                .and_then(|m| m.as_str())
                                == Some(name)
                    });
                    if !present {
                        if item.is_some() {
                            failures.push(format!(
                                "PHP{major}.{minor} unavailable {name} step={step} warm={warm}"
                            ));
                        }
                        continue;
                    }
                    let Some(item) = item else {
                        failures.push(format!(
                            "PHP{major}.{minor} missing {name} step={step} warm={warm}"
                        ));
                        continue;
                    };
                    let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                    let mut f = vec![String::new(); 16];
                    f[3] = name.into();
                    f[4] = format!("\\{name}");
                    f[5] = name.into();
                    f[6] = "none".into();
                    f[7] = source.clone();
                    f[11] = "0".into();
                    f[12] = start.to_string();
                    f[13] = end.to_string();
                    for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                        payloads += 1;
                        let valid = scoped_contract(&source, payload, &f, &uri);
                        eprintln!(
                            "BUILTIN_CONSTANT target={major}.{minor} name={name} step={step} warm={warm} stage={stage} source={source:?} applied={:?} payload={payload:?}",
                            apply(&source, payload)
                        );
                        if !valid {
                            failures.push(format!("PHP{major}.{minor} wrong edit {name} step={step} warm={warm} stage={stage}"));
                        }
                    }
                }
            }
        }
    }
    eprintln!(
        "BUILTIN_CONSTANT requests={requests} payloads={payloads} failures={}",
        failures.len()
    );
    assert_eq!(requests, 216);
    assert_eq!(payloads, 192, "missing positives: {failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn exact_current_constant_survives_bounded_cap_and_document_changes() {
    let mut declaration = "<?php namespace Vendor {".to_owned();
    for n in 0..120 {
        declaration.push_str(&format!("const A{n:03}=0;"));
    }
    declaration.push_str("const ZzzTOKEN=7; const ZzzToken=99;}");
    let cases = [
        (
            "absolute",
            "namespace Caller {echo \\Vendor\\ZzzTOKEN;}",
            "\\Vendor\\ZzzTOKEN",
            "\\Vendor\\ZzzTOKEN",
            "Vendor\\ZzzTOKEN",
            "Vendor\\ZzzTOKEN",
            "none",
        ),
        (
            "namespace-alias",
            "namespace Caller {use Vendor as V; echo V\\ZzzTOKEN;}",
            "V\\ZzzTOKEN",
            "V\\ZzzTOKEN",
            "Vendor\\ZzzTOKEN",
            "V\\ZzzTOKEN",
            "none",
        ),
        (
            "const-alias",
            "namespace Caller {use const Vendor\\ZzzTOKEN as PICK; echo PICK;}",
            "PICK",
            "PICK",
            "Vendor\\ZzzTOKEN",
            "PICK",
            "none",
        ),
        (
            "ordinary-import",
            "namespace Caller {use const Vendor\\ZzzTOKEN;}",
            "Vendor\\ZzzTOKEN",
            "Vendor\\ZzzTOKEN",
            "Vendor\\ZzzTOKEN",
            "Vendor\\ZzzTOKEN",
            "1",
        ),
        (
            "mixed-group",
            "namespace Caller {use Vendor\\{function work, const ZzzTOKEN};}",
            "ZzzTOKEN",
            "ZzzTOKEN",
            "Vendor\\ZzzTOKEN",
            "ZzzTOKEN",
            "1",
        ),
        (
            "case-distinct",
            "namespace Caller {echo \\Vendor\\ZzzToken;}",
            "\\Vendor\\ZzzToken",
            "\\Vendor\\ZzzToken",
            "Vendor\\ZzzToken",
            "Vendor\\ZzzToken",
            "none",
        ),
    ];
    let mut failures = Vec::new();
    let mut requests = 0;
    let mut payloads = 0;
    for (name, tail, token, spelling, fqn, filter, format) in cases {
        let source = format!("{declaration}{tail}");
        let start = source.rfind(token).unwrap() as u32;
        let end = start + token.len() as u32;
        for minor in [0, 3] {
            for step in [0, 3, token.len() as u32] {
                let sut = Backend::new_headless();
                sut.set_php_version(PhpVersion::new(8, minor));
                let uri = Uri::parse("file:///constant-cap.php").unwrap();
                sut.did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: uri.clone(),
                        language_id: "php".into(),
                        version: 1,
                        text: "<?php namespace Wrong; const STALE=99;".into(),
                    },
                })
                .await;
                sut.did_change(DidChangeTextDocumentParams {
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
                for warm in [false, true] {
                    requests += 1;
                    let response = sut
                        .completion(CompletionParams {
                            text_document_position_params: TextDocumentPositionParams {
                                text_document: TextDocumentIdentifier { uri: uri.clone() },
                                position: Position::new(0, start + step),
                            },
                            work_done_progress_params: Default::default(),
                            partial_result_params: Default::default(),
                            context: None,
                        })
                        .await
                        .unwrap();
                    let (items, incomplete) = match response {
                        Some(CompletionResponse::CompletionItemList(v)) => (v, false),
                        Some(CompletionResponse::CompletionList(v)) => (v.items, v.is_incomplete),
                        None => (Vec::new(), false),
                    };
                    assert!(
                        !items.iter().any(|i| i
                            .data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|m| m.as_str())
                            == Some("Wrong\\STALE")),
                        "didChange must discard previous symbol"
                    );
                    let count = items
                        .iter()
                        .filter(|i| i.kind == Some(CompletionItemKind::Constant))
                        .count();
                    eprintln!(
                        "CONSTANT_CAP name={name} minor={minor} step={step} warm={warm} constants={count} nonconstants={} incomplete={incomplete}",
                        items.len() - count
                    );
                    if count > 100 {
                        failures.push(format!("{name} cap exceeded {count}"));
                    }
                    if step == 0 && (count != 100 || !incomplete) {
                        failures.push(format!(
                            "{name} discriminating cap must be100/incomplete: {count}/{incomplete}"
                        ));
                    }
                    let selected = items
                        .iter()
                        .filter(|i| {
                            i.kind == Some(CompletionItemKind::Constant)
                                && i.data
                                    .as_ref()
                                    .and_then(|d| d.get("m"))
                                    .and_then(|m| m.as_str())
                                    == Some(fqn)
                        })
                        .collect::<Vec<_>>();
                    if selected.len() != 1 {
                        failures.push(format!(
                            "{name} PHP8.{minor} step={step} warm={warm} exact count {}",
                            selected.len()
                        ));
                        continue;
                    }
                    let item = selected[0];
                    let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                    let mut f = vec![String::new(); 16];
                    f[3] = fqn.into();
                    f[4] = spelling.into();
                    f[5] = filter.into();
                    f[6] = format.into();
                    f[7] = source.clone();
                    f[11] = "0".into();
                    f[12] = start.to_string();
                    f[13] = end.to_string();
                    for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                        payloads += 1;
                        let valid = scoped_contract(&source, payload, &f, &uri);
                        if !valid {
                            failures.push(format!(
                                "{name} step={step} {stage} wrong edit: {payload:?}"
                            ));
                        }
                        eprintln!(
                            "CAP_CONSTANT name={name} minor={minor} step={step} warm={warm} stage={stage} applied={:?} payload={payload:?}",
                            apply(&source, payload)
                        );
                    }
                }
            }
        }
    }
    eprintln!(
        "CONSTANT_CAP requests={requests} payloads={payloads} failures={}",
        failures.len()
    );
    assert_eq!(requests, 72);
    assert_eq!(payloads, 144, "missing positives: {failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn constant_retention_cannot_invent_empty_unknown_or_invalid_current_identity() {
    let mut declaration = "<?php namespace Vendor {".to_owned();
    for n in 0..120 {
        declaration.push_str(&format!("const A{n:03}=0;"));
    }
    declaration.push_str("const ZzzTOKEN=7;}");
    let mut checked = 0;
    for (name, tail, marker, delta) in [
        ("empty", "namespace Caller {echo ;}", ";}", 0),
        (
            "nonmatch",
            "namespace Caller {echo \\Vendor\\Missing;}",
            "\\Vendor\\Missing",
            0,
        ),
        (
            "wrong-case",
            "namespace Caller {echo \\Vendor\\ZZZTOKEN;}",
            "\\Vendor\\ZZZTOKEN",
            0,
        ),
        (
            "surrogate-split",
            "namespace Caller {/* 🌟 */ echo \\Vendor\\ZzzTOKEN;}",
            "🌟",
            1,
        ),
        (
            "out-of-range",
            "namespace Caller {echo \\Vendor\\ZzzTOKEN;}",
            "\\Vendor\\ZzzTOKEN",
            10000,
        ),
    ] {
        let source = format!("{declaration}{tail}");
        let byte = source.rfind(marker).unwrap();
        let character = source[..byte].encode_utf16().count() as u32 + delta;
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///constant-negative.php").unwrap();
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
                let response = sut
                    .completion(CompletionParams {
                        text_document_position_params: TextDocumentPositionParams {
                            text_document: TextDocumentIdentifier { uri: uri.clone() },
                            position: Position::new(0, character),
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
                    None => Vec::new(),
                };
                assert!(
                    !items
                        .iter()
                        .any(|i| i.kind == Some(CompletionItemKind::Constant)
                            && i.data
                                .as_ref()
                                .and_then(|d| d.get("m"))
                                .and_then(|m| m.as_str())
                                == Some("Vendor\\ZzzTOKEN")),
                    "{name} PHP8.{minor} warm={warm} must not retain unrelated target: {items:?}"
                );
                checked += 1;
            }
        }
    }
    assert_eq!(checked, 20);
}

fn residual_contract(source: &str, payload: &CompletionItem, f: &[String], uri: &Uri) -> bool {
    let spelling = &f[9];
    let expected = CompletionItemTextEdit::TextEdit(TextEdit {
        range: Range::new(
            Position::new(f[5].parse().unwrap(), f[6].parse().unwrap()),
            Position::new(f[7].parse().unwrap(), f[8].parse().unwrap()),
        ),
        new_text: spelling.clone(),
    });
    payload.label == f[4]
        && payload.kind == Some(CompletionItemKind::Constant)
        && payload.filter_text.as_deref()
            == Some(f.get(13).map_or_else(
                || {
                    if spelling.starts_with('\\') {
                        f[4].as_str()
                    } else {
                        spelling.as_str()
                    }
                },
                String::as_str,
            ))
        && payload.insert_text.as_deref() == Some(spelling.as_str())
        && payload.insert_text_format
            == if f.get(14).is_some_and(|v| v == "1") {
                Some(InsertTextFormat::PlainText)
            } else {
                None
            }
        && payload.text_edit == Some(expected)
        && payload
            .additional_text_edits
            .as_ref()
            .is_none_or(Vec::is_empty)
        && payload.insert_text_mode.is_none()
        && payload.text_edit_text.is_none()
        && payload.command.is_none()
        && payload
            .data
            .as_ref()
            .and_then(|v| v.as_object())
            .is_some_and(|d| {
                d.len() == 4
                    && d.get("m").and_then(|v| v.as_str()) == Some(f[4].as_str())
                    && d.get("c").and_then(|v| v.as_str()) == Some("")
                    && d.get("k").and_then(|v| v.as_str()) == Some("global_constant")
                    && d.get("u").and_then(|v| v.as_str()) == Some(uri.as_str())
            })
        && apply(source, payload) == f[10]
}
#[tokio::test]
async fn original_multiple_alias_and_global_fallback_public_regressions() {
    let rows = include_str!("fixtures/constant-residual-original.tsv")
        .strip_suffix('\n')
        .unwrap()
        .split('\n')
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 17);
    let mut failures = Vec::new();
    let mut requests = 0;
    let mut payloads = 0;
    let mut missing_alias = 0;
    let mut missing_fallback = 0;
    for row in rows {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        assert_eq!(f.len(), 13);
        let source = &f[1];
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///constant-residual-original.php").unwrap();
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
                let response = sut
                    .completion(CompletionParams {
                        text_document_position_params: TextDocumentPositionParams {
                            text_document: TextDocumentIdentifier { uri: uri.clone() },
                            position: Position::new(f[2].parse().unwrap(), f[3].parse().unwrap()),
                        },
                        work_done_progress_params: Default::default(),
                        partial_result_params: Default::default(),
                        context: None,
                    })
                    .await
                    .unwrap();
                eprintln!(
                    "RESIDUAL_RAW name={} minor={minor} warm={warm} source={source:?} response={response:?}",
                    f[0]
                );
                let (items, incomplete) = match response {
                    Some(CompletionResponse::CompletionItemList(v)) => (v, false),
                    Some(CompletionResponse::CompletionList(v)) => (v.items, v.is_incomplete),
                    None => (Vec::new(), false),
                };
                let constants = items
                    .iter()
                    .filter(|i| i.kind == Some(CompletionItemKind::Constant))
                    .count();
                assert!(constants <= 100, "producer cap");
                if f[12] == "100" && (constants != 100 || !incomplete) {
                    failures.push(format!("{} cap={constants} incomplete={incomplete}", f[0]));
                }
                let selected = items
                    .iter()
                    .filter(|i| {
                        i.kind == Some(CompletionItemKind::Constant)
                            && i.data
                                .as_ref()
                                .and_then(|v| v.get("m"))
                                .and_then(|v| v.as_str())
                                == Some(f[4].as_str())
                    })
                    .collect::<Vec<_>>();
                if selected.len() != 1 {
                    if f[0].starts_with("const-") || f[0].starts_with("namespace-") {
                        missing_alias += 1
                    } else {
                        missing_fallback += 1
                    };
                    failures.push(format!(
                        "{} PHP8.{minor} warm={warm} selected={}",
                        f[0],
                        selected.len()
                    ));
                    continue;
                }
                let item = selected[0];
                let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                    let accepted = apply(source, payload);
                    eprintln!(
                        "RESIDUAL_EDIT name={} minor={minor} warm={warm} stage={stage} source={source:?} accepted={accepted:?} payload={payload:?}",
                        f[0]
                    );
                    if !residual_contract(source, payload, &f, &uri) {
                        failures.push(format!(
                            "{} PHP8.{minor} warm={warm} stage={stage} contract",
                            f[0]
                        ));
                    }
                    payloads += 1;
                }
            }
        }
    }
    eprintln!(
        "RESIDUAL_ORIGINAL requests={requests} payloads={payloads} missing_alias={missing_alias} missing_fallback={missing_fallback} failures={}",
        failures.len()
    );
    assert_eq!(requests, 68);
    assert_eq!(payloads, 136, "{failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn expanded_constant_aliases_and_fallback_keep_full_edit_contracts() {
    let rows = include_str!("fixtures/constant-residual-expanded.tsv")
        .strip_suffix('\n')
        .unwrap()
        .split('\n')
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 85);
    let mut failures = Vec::new();
    let mut requests = 0;
    let mut checked = 0;
    let mut rejected = 0;
    for row in rows {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        assert_eq!(f.len(), 16);
        assert!(matches!(f[15].as_str(), "5.6" | "7.0"));
        let source = &f[1];
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///constant-residual-expanded.php").unwrap();
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
                let response = sut
                    .completion(CompletionParams {
                        text_document_position_params: TextDocumentPositionParams {
                            text_document: TextDocumentIdentifier { uri: uri.clone() },
                            position: Position::new(f[2].parse().unwrap(), f[3].parse().unwrap()),
                        },
                        work_done_progress_params: Default::default(),
                        partial_result_params: Default::default(),
                        context: None,
                    })
                    .await
                    .unwrap();
                let (items, incomplete) = match response {
                    Some(CompletionResponse::CompletionItemList(v)) => (v, false),
                    Some(CompletionResponse::CompletionList(v)) => (v.items, v.is_incomplete),
                    None => (Vec::new(), false),
                };
                let constants = items
                    .iter()
                    .filter(|i| i.kind == Some(CompletionItemKind::Constant))
                    .count();
                assert!(constants <= 100, "producer cap");
                if f[12] == "100" && (constants != 100 || !incomplete) {
                    failures.push(format!("{} cap={constants} incomplete={incomplete}", f[0]));
                }
                let selected = items
                    .iter()
                    .filter(|i| {
                        i.kind == Some(CompletionItemKind::Constant)
                            && i.data
                                .as_ref()
                                .and_then(|v| v.get("m"))
                                .and_then(|v| v.as_str())
                                == Some(f[4].as_str())
                    })
                    .collect::<Vec<_>>();
                if selected.len() != 1 {
                    eprintln!(
                        "RESIDUAL_EXPANDED_MISSING name={} minor={minor} warm={warm} source={source:?} items={items:?}",
                        f[0]
                    );
                    failures.push(format!(
                        "{} PHP8.{minor} warm={warm} selected={}",
                        f[0],
                        selected.len()
                    ));
                    continue;
                }
                let item = selected[0];
                let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                    let accepted = apply(source, payload);
                    eprintln!(
                        "RESIDUAL_EXPANDED_EDIT name={} minor={minor} warm={warm} stage={stage} constants={constants} incomplete={incomplete} source={source:?} accepted={accepted:?} payload={payload:?}",
                        f[0]
                    );
                    if !residual_contract(source, payload, &f, &uri) {
                        failures.push(format!(
                            "{} PHP8.{minor} warm={warm} stage={stage} contract expected={:?}",
                            f[0], f[10]
                        ));
                    }
                    checked += 1;
                    if f[0] == "const-short-first-step0" && minor == 0 && !warm {
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
                            assert!(!residual_contract(source, &wrong, &f, &uri));
                            rejected += 1;
                        }
                    }
                }
            }
        }
    }
    eprintln!(
        "RESIDUAL_EXPANDED requests={requests} payloads={checked} rejected={rejected} failures={}",
        failures.len()
    );
    assert_eq!(requests, 340);
    assert_eq!(checked, 680, "{failures:#?}");
    assert_eq!(rejected, 6);
    assert!(failures.is_empty(), "{failures:#?}");
}

async fn residual_items(
    sut: &Backend,
    uri: &Uri,
    position: Position,
) -> (Vec<CompletionItem>, bool) {
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
        Some(CompletionResponse::CompletionItemList(v)) => (v, false),
        Some(CompletionResponse::CompletionList(v)) => (v.items, v.is_incomplete),
        None => (Vec::new(), false),
    }
}
fn residual_selected<'a>(items: &'a [CompletionItem], fqn: &str) -> Vec<&'a CompletionItem> {
    items
        .iter()
        .filter(|i| {
            i.kind == Some(CompletionItemKind::Constant)
                && i.data
                    .as_ref()
                    .and_then(|v| v.get("m"))
                    .and_then(|v| v.as_str())
                    == Some(fqn)
        })
        .collect()
}
#[tokio::test]
async fn constant_alias_availability_matches_all_targets_after_public_sibling_warm() {
    let rows = include_str!("fixtures/constant-residual-future.tsv")
        .strip_suffix('\n')
        .unwrap()
        .split('\n')
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 2);
    // Independent Core_d.php availability metadata: PHP_SBINDIR since PHP8.4.
    let versions = [
        (5, 6, false),
        (7, 0, false),
        (7, 1, false),
        (7, 2, false),
        (7, 3, false),
        (7, 4, false),
        (8, 0, false),
        (8, 1, false),
        (8, 2, false),
        (8, 3, false),
        (8, 4, true),
        (8, 5, true),
    ];
    assert_eq!(versions.len(), 12);
    let mut requests = 0;
    let mut payloads = 0;
    let mut negatives = 0;
    let mut sibling_requests = 0;
    let mut sibling_payloads = 0;
    let mut failures = Vec::new();
    for row in rows {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        assert_eq!(f.len(), 15);
        for (major, minor, stub_available) in versions {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(major, minor));
            let uri = Uri::parse("file:///constant-residual-future.php").unwrap();
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
                    let sibling_uri = Uri::parse("file:///constant-residual-sibling.php").unwrap();
                    let source = "<?php echo \\PHP_VERSION;";
                    sut.did_open(DidOpenTextDocumentParams {
                        text_document: TextDocumentItem {
                            uri: sibling_uri.clone(),
                            language_id: "php".into(),
                            version: 1,
                            text: source.into(),
                        },
                    })
                    .await;
                    let (items, _) = residual_items(&sut, &sibling_uri, Position::new(0, 23)).await;
                    sibling_requests += 1;
                    let selected = residual_selected(&items, "PHP_VERSION");
                    assert_eq!(selected.len(), 1);
                    let initial = selected[0];
                    let resolved = sut.completion_resolve(initial.clone()).await.unwrap();
                    let sf = [
                        "sibling",
                        source,
                        "0",
                        "23",
                        "PHP_VERSION",
                        "0",
                        "11",
                        "0",
                        "23",
                        "\\PHP_VERSION",
                        source,
                        "not-executed",
                        "bounded",
                        "PHP_VERSION",
                        "none",
                    ]
                    .map(str::to_owned)
                    .to_vec();
                    for p in [initial, &resolved] {
                        assert!(residual_contract(source, p, &sf, &sibling_uri));
                        sibling_payloads += 1;
                    }
                    eprintln!(
                        "RESIDUAL_SIBLING case={} version={major}.{minor} initial={initial:?} resolved={resolved:?}",
                        f[0]
                    );
                }
                let (items, _) = residual_items(
                    &sut,
                    &uri,
                    Position::new(f[2].parse().unwrap(), f[3].parse().unwrap()),
                )
                .await;
                requests += 1;
                let selected = residual_selected(&items, &f[4]);
                let available = f[0] == "user" || stub_available;
                eprintln!(
                    "RESIDUAL_FUTURE_RAW name={} version={major}.{minor} warm={warm} available={available} selected={selected:?}",
                    f[0]
                );
                if !available {
                    assert!(
                        selected.is_empty(),
                        "future stub leaked {major}.{minor} warm={warm}"
                    );
                    negatives += 1;
                    continue;
                }
                if selected.len() != 1 {
                    failures.push(format!("{} {major}.{minor} warm={warm} missing", f[0]));
                    continue;
                }
                let initial = selected[0];
                let resolved = sut.completion_resolve(initial.clone()).await.unwrap();
                for (stage, payload) in [("initial", initial), ("resolved", &resolved)] {
                    let accepted = apply(&f[1], payload);
                    eprintln!(
                        "RESIDUAL_FUTURE_EDIT name={} version={major}.{minor} warm={warm} stage={stage} source={:?} accepted={accepted:?} payload={payload:?}",
                        f[0], f[1]
                    );
                    if !residual_contract(&f[1], payload, &f, &uri) {
                        failures.push(format!(
                            "{} {major}.{minor} warm={warm} {stage} contract",
                            f[0]
                        ));
                    }
                    payloads += 1;
                }
            }
        }
    }
    eprintln!(
        "RESIDUAL_FUTURE requests={requests} payloads={payloads} negative_requests={negatives} sibling_requests={sibling_requests} sibling_payloads={sibling_payloads} failures={}",
        failures.len()
    );
    assert_eq!(
        (
            requests,
            payloads,
            negatives,
            sibling_requests,
            sibling_payloads
        ),
        (48, 56, 20, 24, 48)
    );
    assert!(failures.is_empty(), "{failures:#?}");
}
#[tokio::test]
async fn constant_retention_respects_case_import_priority_and_invalid_positions() {
    let rows = include_str!("fixtures/constant-residual-negative.tsv")
        .strip_suffix('\n')
        .unwrap()
        .split('\n')
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 8);
    let mut requests = 0;
    for row in rows {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        assert_eq!(f.len(), 8);
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///constant-residual-negative.php").unwrap();
            sut.did_open(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: uri.clone(),
                    language_id: "php".into(),
                    version: 1,
                    text: f[1].clone(),
                },
            })
            .await;
            for repeat in [false, true] {
                let (items, incomplete) = residual_items(
                    &sut,
                    &uri,
                    Position::new(f[2].parse().unwrap(), f[3].parse().unwrap()),
                )
                .await;
                requests += 1;
                let constants = items
                    .iter()
                    .filter(|i| i.kind == Some(CompletionItemKind::Constant))
                    .collect::<Vec<_>>();
                let selected = residual_selected(&items, &f[4]);
                eprintln!(
                    "RESIDUAL_NEGATIVE name={} minor={minor} repeat={repeat} constants={} incomplete={incomplete} selected={selected:?} source={:?} position=({}, {})",
                    f[0],
                    constants.len(),
                    f[1],
                    f[2],
                    f[3]
                );
                assert_eq!(constants.len(), f[5].parse::<usize>().unwrap());
                if f[6] == "true" {
                    assert!(incomplete);
                }
                assert!(selected.is_empty(), "{} retained nonbinding identity", f[0]);
            }
        }
    }
    assert_eq!(requests, 32);
}
#[tokio::test]
async fn constant_alias_and_fallback_rebind_after_full_document_changes() {
    let rows = include_str!("fixtures/constant-residual-changes.tsv")
        .strip_suffix('\n')
        .unwrap()
        .split('\n')
        .map(|r| r.split('\t').map(decode).collect::<Vec<_>>())
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 6);
    let mut requests = 0;
    let mut payloads = 0;
    let mut failures = Vec::new();
    let (groups, remainder) = rows.as_chunks::<3>();
    assert!(remainder.is_empty(), "complete document-change triplets");
    for group in groups {
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///constant-residual-change.php").unwrap();
            for (version, f) in group.iter().enumerate() {
                assert_eq!(f.len(), 15);
                if version == 0 {
                    sut.did_open(DidOpenTextDocumentParams {
                        text_document: TextDocumentItem {
                            uri: uri.clone(),
                            language_id: "php".into(),
                            version: 1,
                            text: f[1].clone(),
                        },
                    })
                    .await;
                } else {
                    sut.did_change(DidChangeTextDocumentParams {
                        text_document: VersionedTextDocumentIdentifier {
                            text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                            version: version as i32 + 1,
                        },
                        content_changes: vec![
                            TextDocumentContentChangeEvent::TextDocumentContentChangeWholeDocument(
                                TextDocumentContentChangeWholeDocument { text: f[1].clone() },
                            ),
                        ],
                    })
                    .await;
                }
                for warm in [false, true] {
                    let (items, incomplete) = residual_items(
                        &sut,
                        &uri,
                        Position::new(f[2].parse().unwrap(), f[3].parse().unwrap()),
                    )
                    .await;
                    requests += 1;
                    let constants = items
                        .iter()
                        .filter(|i| i.kind == Some(CompletionItemKind::Constant))
                        .count();
                    assert!(constants <= 100);
                    if f[12] == "100" {
                        assert_eq!(constants, 100);
                        assert!(incomplete);
                    }
                    let selected = residual_selected(&items, &f[4]);
                    if selected.len() != 1 {
                        eprintln!(
                            "RESIDUAL_CHANGE_MISSING name={} minor={minor} warm={warm} items={items:?}",
                            f[0]
                        );
                        failures.push(format!("{} missing", f[0]));
                        continue;
                    }
                    let initial = selected[0];
                    let resolved = sut.completion_resolve(initial.clone()).await.unwrap();
                    for (stage, payload) in [("initial", initial), ("resolved", &resolved)] {
                        let accepted = apply(&f[1], payload);
                        eprintln!(
                            "RESIDUAL_CHANGE_EDIT name={} minor={minor} warm={warm} stage={stage} source={:?} accepted={accepted:?} payload={payload:?}",
                            f[0], f[1]
                        );
                        if !residual_contract(&f[1], payload, f, &uri) {
                            failures.push(format!("{} {minor} warm={warm} {stage}", f[0]));
                        }
                        payloads += 1;
                    }
                }
            }
        }
    }
    eprintln!(
        "RESIDUAL_CHANGE requests={requests} payloads={payloads} failures={}",
        failures.len()
    );
    assert_eq!((requests, payloads), (24, 48));
    assert!(failures.is_empty(), "{failures:#?}");
}
