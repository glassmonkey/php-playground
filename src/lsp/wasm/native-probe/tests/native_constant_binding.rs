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
