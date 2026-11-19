use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};

#[tokio::test]
async fn original_phpdoc_tag_context_uses_original_canonical_lines() {
    let mut failures = Vec::new();
    let mut requests = 0;
    let mut payloads = 0;
    for (name, eol) in [("LF", "\n"), ("CRLF", "\r\n"), ("CR", "\r")] {
        let source = format!(
            "<?php{eol}/** @pa */{eol}function f(int $alpha): int {{ return $alpha; }}{eol}"
        );
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
            let uri = Uri::parse("file:///position-consumer.php").unwrap();
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
                let position = Position::new(1, 7);
                requests += 1;
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
                let items = match response {
                    Some(CompletionResponse::CompletionItemList(v)) => v,
                    Some(CompletionResponse::CompletionList(v)) => v.items,
                    None => Vec::new(),
                };
                eprintln!(
                    "PHPDOC_ORIGINAL name={name} minor={minor} warm={warm} source={source:?} position={position:?} items={items:?}"
                );
                let Some(item) = items.iter().find(|i| i.label == want.label) else {
                    failures.push(format!("{name} PHP8.{minor} warm={warm} missing positive"));
                    continue;
                };
                let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                    // This tag intentionally has no explicit primary edit. Apply its
                    // insertion to the independently authored current tag-word span.
                    let accepted = source.replacen(
                        "pa */",
                        &format!("{} */", payload.insert_text.as_deref().unwrap_or("")),
                        1,
                    );
                    if payload != &want || accepted != expected {
                        failures.push(format!(
                            "{name} {stage}: {payload:?}; accepted={accepted:?}"
                        ));
                    }
                    eprintln!(
                        "PHPDOC_ORIGINAL_EDIT name={name} minor={minor} warm={warm} stage={stage} accepted={accepted:?} payload={payload:?}"
                    );
                    payloads += 1;
                }
            }
        }
    }
    eprintln!(
        "PHPDOC_ORIGINAL requests={requests} payloads={payloads} failures={}",
        failures.len()
    );
    assert_eq!(requests, 12);
    assert_eq!(payloads, 24, "missing positives: {failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}

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
                _ => panic!("unknown fixture escape"),
            });
        } else {
            out.push(c);
        }
    }
    out
}
#[tokio::test]
async fn required_position_consumer_public_branch_controls() {
    let rows = fixture_lines(include_str!("fixtures/position-consumers.tsv"), 75, 10);
    assert_eq!(rows.len(), 75);
    let mut failures = Vec::new();
    let mut requests = 0;
    let mut payloads = 0;
    for row in rows {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        assert_eq!(f.len(), 10);
        let source = &f[2];
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///position-branches.php").unwrap();
            for (path, text) in [
                (
                    "file:///position-scaffold.php",
                    include_str!("fixtures/position-consumer-scaffold.php"),
                ),
                (uri.as_str(), source.as_str()),
            ] {
                sut.did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: Uri::parse(path).unwrap(),
                        language_id: "php".into(),
                        version: 1,
                        text: text.into(),
                    },
                })
                .await;
            }
            let position = Position::new(f[3].parse().unwrap(), f[4].parse().unwrap());
            for warm in [false, true] {
                requests += 1;
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
                let items = match response {
                    Some(CompletionResponse::CompletionItemList(v)) => v,
                    Some(CompletionResponse::CompletionList(v)) => v.items,
                    None => Vec::new(),
                };
                let selected = items.iter().filter(|i| i.label == f[5]).collect::<Vec<_>>();
                let forbidden = f[9]
                    .split(',')
                    .filter(|s| !s.is_empty())
                    .filter(|name| items.iter().any(|i| i.label == *name))
                    .collect::<Vec<_>>();
                let mut resolved_items = Vec::new();
                for item in &selected {
                    resolved_items.push(sut.completion_resolve((*item).clone()).await.unwrap());
                    payloads += 2;
                }
                eprintln!(
                    "POSITION_BRANCH family={} name={} minor={minor} warm={warm} source={source:?} position={position:?} selected={selected:?} resolved={resolved_items:?} forbidden={forbidden:?} labels={:?}",
                    f[0],
                    f[1],
                    items.iter().map(|i| &i.label).collect::<Vec<_>>()
                );
                if selected.len() != 1 || !forbidden.is_empty() {
                    failures.push(format!(
                        "{} PHP8.{minor} warm={warm}: selected {} forbidden={forbidden:?}",
                        f[1],
                        selected.len()
                    ));
                }
            }
        }
    }
    eprintln!(
        "POSITION_BRANCH requests={requests} payloads={payloads} failures={}",
        failures.len()
    );
    assert_eq!(requests, 300);
    assert_eq!(payloads, 600, "missing positives: {failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn docblock_generation_on_enter_targets_the_original_declaration() {
    let mut failures = Vec::new();
    let mut checked = 0;
    for (name, eol) in [("LF", "\n"), ("CRLF", "\r\n"), ("CR", "\r")] {
        let source = format!(
            "<?php{eol}/**{eol} * {eol} */{eol}function f(array $items): array {{ return $items; }}{eol}"
        );
        let wanted = format!(
            "/**{eol} * @param array<mixed> $items{eol} *{eol} * @return array<mixed>{eol} */{eol}"
        );
        let expected = vec![TextEdit {
            range: Range::new(Position::new(1, 0), Position::new(4, 0)),
            new_text: wanted,
        }];
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///docblock-generation.php").unwrap();
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
                    .on_type_formatting(DocumentOnTypeFormattingParams {
                        text_document: TextDocumentIdentifier { uri: uri.clone() },
                        position: Position::new(2, 3),
                        ch: "\n".into(),
                        options: FormattingOptions::new(4, true, None, None, None),
                    })
                    .await
                    .unwrap();
                eprintln!(
                    "DOCBLOCK_ENTER name={name} minor={minor} warm={warm} source={source:?} edits={response:?}"
                );
                if response.as_ref() != Some(&expected) {
                    failures.push(format!("{name} PHP8.{minor} warm={warm}: expected={expected:?}, actual={response:?}"));
                }
                checked += 1;
            }
        }
    }
    assert_eq!(checked, 12);
    assert!(failures.is_empty(), "{failures:#?}");
}

fn original_offset(source: &str, position: Position) -> Option<usize> {
    let mut starts = vec![0];
    let bytes = source.as_bytes();
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'\r' {
            if bytes.get(at + 1) == Some(&b'\n') {
                at += 1;
            }
            starts.push(at + 1);
        } else if bytes[at] == b'\n' {
            starts.push(at + 1);
        }
        at += 1;
    }
    let start = *starts.get(position.line as usize)?;
    let mut col = 0;
    for (i, ch) in source[start..].char_indices() {
        if col == position.character {
            return Some(start + i);
        }
        if matches!(ch, '\r' | '\n') {
            return None;
        }
        col += ch.len_utf16() as u32;
        if col > position.character {
            return None;
        }
    }
    (col == position.character).then_some(source.len())
}
fn contract_range(f: &[String]) -> Range {
    Range::new(
        Position::new(f[11].parse().unwrap(), f[12].parse().unwrap()),
        Position::new(f[13].parse().unwrap(), f[14].parse().unwrap()),
    )
}
fn apply_consumer_payload(source: &str, item: &CompletionItem, f: &[String]) -> Option<String> {
    let primary = match &item.text_edit {
        Some(CompletionItemTextEdit::TextEdit(e)) => e.clone(),
        None if f[10] == "implicit" => TextEdit {
            range: contract_range(f),
            new_text: item.insert_text.clone()?,
        },
        _ => return None,
    };
    let mut edits = item.additional_text_edits.clone().unwrap_or_default();
    edits.push(primary);
    let mut offsets = Vec::new();
    for edit in edits {
        let text = if item.insert_text_format == Some(InsertTextFormat::Snippet) {
            edit.new_text
                .replace("${1:mixed}", "mixed")
                .replace("${2:mixed}", "mixed")
                .replace("\\$", "$")
        } else {
            edit.new_text
        };
        offsets.push((
            original_offset(source, edit.range.start)?,
            original_offset(source, edit.range.end)?,
            text,
        ));
    }
    offsets.sort_by_key(|e| std::cmp::Reverse(e.0));
    let mut accepted = source.to_owned();
    let mut previous = source.len();
    for (start, end, text) in offsets {
        if start > end || end > previous {
            return None;
        }
        accepted.replace_range(start..end, &text);
        previous = start;
    }
    Some(accepted)
}
fn consumer_contract(source: &str, item: &CompletionItem, f: &[String], uri: &Uri) -> bool {
    let kind = match f[6].as_str() {
        "5" => CompletionItemKind::Field,
        "6" => CompletionItemKind::Variable,
        "7" => CompletionItemKind::Class,
        "10" => CompletionItemKind::Property,
        "15" => CompletionItemKind::Snippet,
        _ => panic!("closed kind table"),
    };
    let identity = if f[21] == "none" {
        item.data.is_none()
    } else {
        item.data
            .as_ref()
            .and_then(|d| d.as_object())
            .is_some_and(|d| {
                d.len() == 4
                    && d.get("m").and_then(|v| v.as_str()) == Some(f[7].as_str())
                    && d.get("c").and_then(|v| v.as_str()) == Some(f[8].as_str())
                    && d.get("k").and_then(|v| v.as_str()) == Some(f[21].as_str())
                    && d.get("u").and_then(|v| v.as_str()) == Some(uri.as_str())
            })
    };
    let expected_edit = if f[10] == "implicit" {
        None
    } else {
        Some(CompletionItemTextEdit::TextEdit(TextEdit {
            range: contract_range(f),
            new_text: f[15].clone(),
        }))
    };
    identity
        && item.label == f[5]
        && item.kind == Some(kind)
        && item.filter_text.as_deref() == Some(f[17].as_str())
        && item.insert_text.as_deref() == (f[16] != "<none>").then_some(f[16].as_str())
        && item.insert_text_format
            == if f[18] == "2" {
                Some(InsertTextFormat::Snippet)
            } else {
                None
            }
        && item.text_edit == expected_edit
        && item
            .additional_text_edits
            .as_ref()
            .is_none_or(Vec::is_empty)
        && item.command.is_none()
        && item.text_edit_text.is_none()
        && item.insert_text_mode.is_none()
        && (f[20] == "<ignore>" || item.detail.as_deref() == Some(f[20].as_str()))
        && apply_consumer_payload(source, item, f).as_deref() == Some(f[19].as_str())
}
#[tokio::test]
async fn independent_full_edit_contracts_for_required_position_consumers() {
    let rows = fixture_lines(
        include_str!("fixtures/position-consumers-contract-v2.tsv"),
        111,
        23,
    );
    assert_eq!(rows.len(), 111);
    let mut failures = Vec::new();
    let mut requests = 0;
    let mut checked = 0;
    let mut mutants = 0;
    for row in rows {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        assert_eq!(f.len(), 23);
        let source = &f[2];
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///consumer-contract.php").unwrap();
            for (path, text) in [
                (
                    "file:///contract-scaffold.php",
                    include_str!("fixtures/position-consumer-contract-scaffold.php"),
                ),
                (uri.as_str(), source.as_str()),
            ] {
                sut.did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: Uri::parse(path).unwrap(),
                        language_id: "php".into(),
                        version: 1,
                        text: text.into(),
                    },
                })
                .await;
            }
            let position = Position::new(f[3].parse().unwrap(), f[4].parse().unwrap());
            for warm in [false, true] {
                requests += 1;
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
                let items = match response {
                    Some(CompletionResponse::CompletionItemList(v)) => v,
                    Some(CompletionResponse::CompletionList(v)) => v.items,
                    None => Vec::new(),
                };
                let selected = items.iter().filter(|i| i.label == f[5]).collect::<Vec<_>>();
                if selected.len() != 1 {
                    failures.push(format!(
                        "{} PHP8.{minor} warm={warm} selected {}",
                        f[1],
                        selected.len()
                    ));
                    continue;
                }
                for name in f[9].split(',').filter(|v| !v.is_empty()) {
                    if items.iter().any(|i| i.label == name) {
                        failures.push(format!("{} forbidden target {name}", f[1]));
                    }
                }
                let initial = selected[0];
                let resolved = sut.completion_resolve(initial.clone()).await.unwrap();
                if !f[22].is_empty() {
                    let docs = match &resolved.documentation {
                        Some(Documentation::MarkupContent(m)) => m.value.as_str(),
                        Some(Documentation::String(t)) => t.as_str(),
                        None => "",
                    };
                    if !docs.contains(&f[22]) {
                        failures.push(format!(
                            "{} selected resolved marker missing {}: {resolved:?}",
                            f[1], f[22]
                        ));
                    }
                }
                for (stage, payload) in [("initial", initial), ("resolved", &resolved)] {
                    if !consumer_contract(source, payload, &f, &uri) {
                        failures.push(format!("{} PHP8.{minor} warm={warm} {stage} contract mismatch: {payload:?}; accepted={:?}; expected={:?}",f[1],apply_consumer_payload(source,payload,&f),f[19]));
                    }
                    eprintln!(
                        "CONSUMER_EDIT family={} name={} minor={minor} warm={warm} stage={stage} source={source:?} accepted={:?} payload={payload:?}",
                        f[0],
                        f[1],
                        apply_consumer_payload(source, payload, &f)
                    );
                    checked += 1;
                    if f[1] == "doc-type-LF"
                        && minor == 0
                        && !warm
                        && consumer_contract(source, payload, &f, &uri)
                    {
                        for change in ["range", "newText", "additional"] {
                            let mut wrong = payload.clone();
                            match change {
                                "range" => {
                                    let Some(CompletionItemTextEdit::TextEdit(e)) =
                                        &mut wrong.text_edit
                                    else {
                                        unreachable!()
                                    };
                                    e.range.end.character -= 1;
                                }
                                "newText" => {
                                    let Some(CompletionItemTextEdit::TextEdit(e)) =
                                        &mut wrong.text_edit
                                    else {
                                        unreachable!()
                                    };
                                    e.new_text = "Wrong".into();
                                }
                                "additional" => {
                                    wrong.additional_text_edits = Some(vec![TextEdit {
                                        range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                                        new_text: "/* wrong */".into(),
                                    }])
                                }
                                _ => unreachable!(),
                            };
                            assert_eq!(wrong.data, payload.data);
                            assert!(
                                !consumer_contract(source, &wrong, &f, &uri),
                                "oracle accepted {stage}/{change}"
                            );
                            mutants += 1;
                        }
                    }
                }
            }
        }
    }
    eprintln!(
        "CONSUMER_EDIT requests={requests} payloads={checked} failures={} mutants_rejected={mutants}",
        failures.len()
    );
    assert_eq!(requests, 444);
    assert_eq!(checked, 888, "missing positives: {failures:#?}");
    assert_eq!(mutants, 6);
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn generated_docblock_return_inference_keeps_original_declaration_visible() {
    let mut failures = Vec::new();
    let mut checked = 0;
    for (name, eol) in [("LF", "\n"), ("CRLF", "\r\n"), ("CR", "\r")] {
        let source = format!("<?php{eol}/**{eol}function f() {{ return new TypeTarget(); }}{eol}");
        let text = format!("/**{eol} * @return TypeTarget{eol} */");
        let expected = CompletionItem {
            label: "/** PHPDoc Block */".into(),
            kind: Some(CompletionItemKind::Snippet),
            detail: Some("Generate PHPDoc block".into()),
            filter_text: Some("/**".into()),
            sort_text: Some("0".into()),
            preselect: Some(true),
            insert_text_format: Some(InsertTextFormat::Snippet),
            text_edit: Some(CompletionItemTextEdit::TextEdit(TextEdit {
                range: Range::new(Position::new(1, 0), Position::new(1, 3)),
                new_text: text.clone(),
            })),
            ..Default::default()
        };
        let document = source.replacen("/**", &text, 1);
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///return-inference.php").unwrap();
            for (path, content) in [
                ("file:///return-type.php", "<?php class TypeTarget {}"),
                (uri.as_str(), source.as_str()),
            ] {
                sut.did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: Uri::parse(path).unwrap(),
                        language_id: "php".into(),
                        version: 1,
                        text: content.into(),
                    },
                })
                .await;
            }
            for warm in [false, true] {
                let response = sut
                    .completion(CompletionParams {
                        text_document_position_params: TextDocumentPositionParams {
                            text_document: TextDocumentIdentifier { uri: uri.clone() },
                            position: Position::new(1, 3),
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
                let Some(item) = items.iter().find(|i| i.label == expected.label) else {
                    failures.push(format!("{name} PHP8.{minor} missing generation"));
                    continue;
                };
                let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                    eprintln!(
                        "GENERATION_RETURN name={name} minor={minor} warm={warm} stage={stage} source={source:?} expectedDocument={document:?} payload={payload:?}"
                    );
                    if payload != &expected {
                        failures.push(format!("{name} PHP8.{minor} warm={warm} {stage}: expected={expected:?}, got={payload:?}"));
                    }
                    checked += 1;
                }
            }
        }
    }
    assert_eq!(checked, 24, "{failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn phpdoc_inline_attachment_respects_original_blank_line_boundaries() {
    let mut failures = Vec::new();
    let mut checked = 0;
    for (name, eol) in [("LF", "\n"), ("CRLF", "\r\n"), ("CR", "\r")] {
        for blank in [false, true] {
            let gap = if blank {
                format!("{eol}{eol}")
            } else {
                eol.to_owned()
            };
            let source = format!("<?php{eol}/** @va */{gap}$value=new TypeTarget();{eol}");
            let label = if blank {
                "@var Type $var"
            } else {
                "@var TypeTarget"
            };
            let insertion = if blank {
                "var ${1:Type} \\$${2:var}"
            } else {
                "var ${1:TypeTarget}"
            };
            for minor in [0, 3] {
                let sut = Backend::new_headless();
                sut.set_php_version(PhpVersion::new(8, minor));
                let uri = Uri::parse("file:///inline-doc.php").unwrap();
                for (path, text) in [
                    ("file:///inline-type.php", "<?php class TypeTarget {}"),
                    (uri.as_str(), source.as_str()),
                ] {
                    sut.did_open(DidOpenTextDocumentParams {
                        text_document: TextDocumentItem {
                            uri: Uri::parse(path).unwrap(),
                            language_id: "php".into(),
                            version: 1,
                            text: text.into(),
                        },
                    })
                    .await;
                }
                for warm in [false, true] {
                    let response = sut
                        .completion(CompletionParams {
                            text_document_position_params: TextDocumentPositionParams {
                                text_document: TextDocumentIdentifier { uri: uri.clone() },
                                position: Position::new(1, 7),
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
                    let selected = items.iter().find(|i| i.label == label);
                    eprintln!(
                        "INLINE_ATTACHMENT name={name} blank={blank} minor={minor} warm={warm} source={source:?} items={items:?}"
                    );
                    if let Some(item) = selected {
                        let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                        for payload in [item, &resolved] {
                            if payload.kind != Some(CompletionItemKind::Keyword)
                                || payload.insert_text.as_deref() != Some(insertion)
                                || payload.filter_text.as_deref() != Some("@var")
                                || payload.text_edit.is_some()
                                || payload
                                    .additional_text_edits
                                    .as_ref()
                                    .is_some_and(|v| !v.is_empty())
                                || payload.insert_text_format != Some(InsertTextFormat::Snippet)
                            {
                                failures
                                    .push(format!("{name} blank={blank} bad payload {payload:?}"));
                            }
                            checked += 1;
                        }
                    } else {
                        failures.push(format!(
                            "{name} blank={blank} PHP8.{minor} warm={warm} missing {label}"
                        ));
                    }
                }
            }
        }
    }
    assert_eq!(checked, 48, "{failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn generation_skips_real_attribute_spans_without_reading_argument_code() {
    let mut failures = Vec::new();
    let mut checked = 0;
    for (name, eol) in [("LF", "\n"), ("CRLF", "\r\n"), ("CR", "\r")] {
        for attribute in [
            "#[GenAttr(\"] function falseTarget() {}\")]",
            "#[GenAttr([']', '/* fake */'])]",
            "#[GenAttr(']')]\n#[GenAttr('[')]",
        ] {
            let source = format!(
                "<?php{eol}/**{eol}{}{eol}function f(array $items): array {{return $items;}}{eol}",
                attribute.replace('\n', eol)
            );
            let text = format!(
                "/**{eol} * @param array<${{1:mixed}}> \\$items{eol} *{eol} * @return array<${{2:mixed}}>{eol} */"
            );
            let expected = CompletionItem {
                label: "/** PHPDoc Block */".into(),
                kind: Some(CompletionItemKind::Snippet),
                detail: Some("Generate PHPDoc block".into()),
                filter_text: Some("/**".into()),
                sort_text: Some("0".into()),
                preselect: Some(true),
                insert_text_format: Some(InsertTextFormat::Snippet),
                text_edit: Some(CompletionItemTextEdit::TextEdit(TextEdit {
                    range: Range::new(Position::new(1, 0), Position::new(1, 3)),
                    new_text: text.clone(),
                })),
                ..Default::default()
            };
            for minor in [0, 3] {
                let sut = Backend::new_headless();
                sut.set_php_version(PhpVersion::new(8, minor));
                let uri = Uri::parse("file:///gen-attribute.php").unwrap();
                for (path, input) in [
                    (
                        "file:///gen-attribute-definition.php",
                        "<?php #[\\Attribute(\\Attribute::TARGET_ALL|\\Attribute::IS_REPEATABLE)] class GenAttr {function __construct(...$args){}}",
                    ),
                    (uri.as_str(), source.as_str()),
                ] {
                    sut.did_open(DidOpenTextDocumentParams {
                        text_document: TextDocumentItem {
                            uri: Uri::parse(path).unwrap(),
                            language_id: "php".into(),
                            version: 1,
                            text: input.into(),
                        },
                    })
                    .await;
                }
                for warm in [false, true] {
                    let response = sut
                        .completion(CompletionParams {
                            text_document_position_params: TextDocumentPositionParams {
                                text_document: TextDocumentIdentifier { uri: uri.clone() },
                                position: Position::new(1, 3),
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
                    let Some(item) = items.iter().find(|i| i.label == expected.label) else {
                        failures.push(format!(
                            "{name} {attribute:?} PHP8.{minor} warm={warm} missing generation"
                        ));
                        continue;
                    };
                    let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                    for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                        eprintln!(
                            "GENERATION_ATTRIBUTE name={name} attribute={attribute:?} minor={minor} warm={warm} stage={stage} source={source:?} payload={payload:?}"
                        );
                        if payload != &expected {
                            failures.push(format!("{name} {attribute:?} {stage}: expected={expected:?}, got={payload:?}"));
                        }
                        checked += 1;
                    }
                }
            }
        }
    }
    assert_eq!(checked, 72, "{failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn generation_attribute_lexical_controls_preserve_actual_declaration_and_all_edits() {
    let rows = fixture_lines(include_str!("fixtures/generation-attributes.tsv"), 44, 7);
    assert_eq!(rows.len(), 44);
    let mut checked = 0;
    let mut requests = 0;
    let mut failures = Vec::new();
    for row in rows {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        assert_eq!(f.len(), 7);
        assert!(!f[6].is_empty(), "independent declaration FQN");
        let source = &f[1];
        let position = Position::new(f[2].parse().unwrap(), f[3].parse().unwrap());
        let expected = CompletionItem {
            label: "/** PHPDoc Block */".into(),
            kind: Some(CompletionItemKind::Snippet),
            detail: Some("Generate PHPDoc block".into()),
            filter_text: Some("/**".into()),
            sort_text: Some("0".into()),
            preselect: Some(true),
            insert_text_format: Some(InsertTextFormat::Snippet),
            text_edit: Some(CompletionItemTextEdit::TextEdit(TextEdit {
                range: Range::new(Position::new(position.line, 0), position),
                new_text: f[4].clone(),
            })),
            ..Default::default()
        };
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///opaque-generation.php").unwrap();
            for (path, text) in [
                (
                    "file:///gen-definition.php",
                    "<?php #[\\Attribute(\\Attribute::TARGET_ALL|\\Attribute::IS_REPEATABLE)] class GenAttr {function __construct(...$args){}}",
                ),
                (uri.as_str(), source.as_str()),
            ] {
                sut.did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: Uri::parse(path).unwrap(),
                        language_id: "php".into(),
                        version: 1,
                        text: text.into(),
                    },
                })
                .await;
            }
            for warm in [false, true] {
                requests += 1;
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
                let items = match response {
                    Some(CompletionResponse::CompletionItemList(v)) => v,
                    Some(CompletionResponse::CompletionList(v)) => v.items,
                    None => Vec::new(),
                };
                let Some(item) = items.iter().find(|i| i.label == expected.label) else {
                    failures.push(format!(
                        "{} PHP8.{minor} warm={warm} missing generation",
                        f[0]
                    ));
                    continue;
                };
                let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                    let accepted =
                        if let Some(CompletionItemTextEdit::TextEdit(edit)) = &payload.text_edit {
                            let a = original_offset(source, edit.range.start).unwrap();
                            let b = original_offset(source, edit.range.end).unwrap();
                            let mut s = source.to_owned();
                            s.replace_range(
                                a..b,
                                &edit
                                    .new_text
                                    .replace("${1:mixed}", "mixed")
                                    .replace("${2:mixed}", "mixed")
                                    .replace("\\$", "$"),
                            );
                            Some(s)
                        } else {
                            None
                        };
                    eprintln!(
                        "GENERATION_OPAQUE name={} minor={minor} warm={warm} stage={stage} source={source:?} accepted={accepted:?} payload={payload:?}",
                        f[0]
                    );
                    if payload != &expected || accepted.as_deref() != Some(f[5].as_str()) {
                        failures.push(format!("{} PHP8.{minor} warm={warm} {stage}: expected={expected:?}, actual={payload:?}, accepted={accepted:?}",f[0]));
                    }
                    checked += 1;
                }
            }
        }
    }
    eprintln!(
        "GENERATION_OPAQUE requests={requests} payloads={checked} failures={}",
        failures.len()
    );
    assert_eq!(requests, 176);
    assert_eq!(checked, 352, "missing positives: {failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn valid_interpolation_keeps_members_while_noncode_contexts_stay_empty() {
    let rows = fixture_lines(
        include_str!("fixtures/position-lexical-contexts.tsv"),
        36,
        7,
    );
    assert_eq!(rows.len(), 36);
    let mut failures = Vec::new();
    let mut requests = 0;
    let mut payloads = 0;
    for row in rows {
        let f = row.split('\t').map(decode).collect::<Vec<_>>();
        assert_eq!(f.len(), 7);
        let source = &f[1];
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///lexical-consumer.php").unwrap();
            for (path, text) in [
                (
                    "file:///lexical-scaffold.php",
                    include_str!("fixtures/position-consumer-contract-scaffold.php"),
                ),
                (uri.as_str(), source.as_str()),
            ] {
                sut.did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: Uri::parse(path).unwrap(),
                        language_id: "php".into(),
                        version: 1,
                        text: text.into(),
                    },
                })
                .await;
            }
            let position = Position::new(f[2].parse().unwrap(), f[3].parse().unwrap());
            for warm in [false, true] {
                requests += 1;
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
                let items = match response {
                    Some(CompletionResponse::CompletionItemList(v)) => v,
                    Some(CompletionResponse::CompletionList(v)) => v.items,
                    None => Vec::new(),
                };
                if f[4] == "empty" {
                    if !items.is_empty() {
                        failures.push(format!(
                            "{} PHP8.{minor} warm={warm} noncode leaked: {items:?}",
                            f[0]
                        ));
                    }
                    eprintln!(
                        "LEXICAL_NEGATIVE name={} minor={minor} warm={warm} source={source:?} position={position:?} items={items:?}",
                        f[0]
                    );
                    continue;
                }
                let selected = items
                    .iter()
                    .filter(|i| {
                        i.label == "property" && i.kind == Some(CompletionItemKind::Property)
                    })
                    .collect::<Vec<_>>();
                if selected.len() != 1 {
                    failures.push(format!(
                        "{} PHP8.{minor} warm={warm} missing property",
                        f[0]
                    ));
                    continue;
                }
                let item = selected[0];
                let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                let mut contract = vec![String::new(); 23];
                contract[5] = "property".into();
                contract[6] = "10".into();
                contract[7] = "property".into();
                contract[8] = "Box".into();
                contract[10] = "implicit".into();
                contract[11] = f[2].clone();
                contract[12] = f[5].clone();
                contract[13] = f[2].clone();
                contract[14] = f[6].clone();
                contract[15] = "property".into();
                contract[16] = "property".into();
                contract[17] = "property".into();
                contract[18] = "none".into();
                contract[19] = source.clone();
                contract[20] = "string".into();
                contract[21] = "property".into();
                for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                    let accepted = apply_consumer_payload(source, payload, &contract);
                    if !consumer_contract(source, payload, &contract, &uri) {
                        failures.push(format!("{} PHP8.{minor} warm={warm} {stage}: {payload:?}, accepted={accepted:?}",f[0]));
                    }
                    eprintln!(
                        "LEXICAL_POSITIVE name={} minor={minor} warm={warm} stage={stage} source={source:?} accepted={accepted:?} payload={payload:?}",
                        f[0]
                    );
                    payloads += 1;
                }
            }
        }
    }
    eprintln!(
        "LEXICAL_CONTEXT requests={requests} positive_payloads={payloads} failures={}",
        failures.len()
    );
    assert_eq!(requests, 144);
    assert_eq!(payloads, 64, "missing positives: {failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn did_change_reselects_each_required_context_from_current_original_bytes() {
    let all = fixture_lines(
        include_str!("fixtures/position-consumers-contract-v2.tsv"),
        111,
        23,
    )
    .into_iter()
    .map(|row| row.split('\t').map(decode).collect::<Vec<_>>())
    .collect::<Vec<_>>();
    let mut failures = Vec::new();
    let mut requests = 0;
    let mut payloads = 0;
    for family in [
        "doc-variable",
        "shape-closed",
        "attribute-property",
        "member-after-cursor",
    ] {
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///changed-consumer.php").unwrap();
            sut.did_open(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: Uri::parse("file:///changed-scaffold.php").unwrap(),
                    language_id: "php".into(),
                    version: 1,
                    text: include_str!("fixtures/position-consumer-contract-scaffold.php").into(),
                },
            })
            .await;
            for (version, eol) in [(1, "LF"), (2, "CR"), (3, "CRLF")] {
                let name = format!("{family}-{eol}");
                let selected = all.iter().filter(|row| row[1] == name).collect::<Vec<_>>();
                assert_eq!(selected.len(), 1);
                let f = selected[0];
                let source = &f[2];
                if version == 1 {
                    sut.did_open(DidOpenTextDocumentParams {
                        text_document: TextDocumentItem {
                            uri: uri.clone(),
                            language_id: "php".into(),
                            version,
                            text: source.clone(),
                        },
                    })
                    .await;
                } else {
                    sut.did_change(DidChangeTextDocumentParams {
                        text_document: VersionedTextDocumentIdentifier {
                            text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                            version,
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
                for warm in [false, true] {
                    requests += 1;
                    let response = sut
                        .completion(CompletionParams {
                            text_document_position_params: TextDocumentPositionParams {
                                text_document: TextDocumentIdentifier { uri: uri.clone() },
                                position: Position::new(
                                    f[3].parse().unwrap(),
                                    f[4].parse().unwrap(),
                                ),
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
                    let candidates = items
                        .iter()
                        .filter(|item| item.label == f[5])
                        .collect::<Vec<_>>();
                    if candidates.len() != 1 {
                        failures.push(format!(
                            "{name} version{version} PHP8.{minor} warm={warm} missing candidate"
                        ));
                        continue;
                    }
                    let item = candidates[0];
                    let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                    for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                        if !consumer_contract(source, payload, f, &uri) {
                            failures.push(format!(
                                "{name} version{version} {stage} mismatch: {payload:?}"
                            ));
                        }
                        eprintln!(
                            "CHANGED_CONSUMER name={name} minor={minor} version={version} warm={warm} stage={stage} source={source:?} accepted={:?} payload={payload:?}",
                            apply_consumer_payload(source, payload, f)
                        );
                        payloads += 1;
                    }
                }
            }
        }
    }
    eprintln!(
        "CHANGED_CONSUMER requests={requests} payloads={payloads} failures={}",
        failures.len()
    );
    assert_eq!(requests, 48);
    assert_eq!(payloads, 96, "missing positives: {failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn fresh_single_line_docblock_generation_and_no_declaration_eof_controls() {
    let mut checked = 0;
    let mut failures = Vec::new();
    for eol in ["\n", "\r\n", "\r"] {
        let source =
            format!("<?php{eol}/** */{eol}function f(array $items): array {{return $items;}}{eol}");
        let expected = vec![TextEdit {
            range: Range::new(Position::new(1, 0), Position::new(2, 0)),
            new_text: format!(
                "/**{eol} * @param array<mixed> $items{eol} *{eol} * @return array<mixed>{eol} */{eol}"
            ),
        }];
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            let uri = Uri::parse("file:///single-doc.php").unwrap();
            sut.did_open(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: uri.clone(),
                    language_id: "php".into(),
                    version: 1,
                    text: source.clone(),
                },
            })
            .await;
            let result = sut
                .on_type_formatting(DocumentOnTypeFormattingParams {
                    text_document: TextDocumentIdentifier { uri },
                    position: Position::new(1, 3),
                    ch: "\n".into(),
                    options: FormattingOptions::new(4, true, None, None, None),
                })
                .await
                .unwrap();
            if result.as_ref() != Some(&expected) {
                failures.push(format!(
                    "PHP8.{minor} eol={eol:?} single-line expected={expected:?} actual={result:?}"
                ));
            }
            checked += 1;
        }
    }
    for (name, source, position) in [
        ("empty", "", Position::new(0, 0)),
        ("no-comment", "<?php", Position::new(0, 5)),
        ("trailing-empty", "<?php\r", Position::new(1, 0)),
        ("closed-eof", "<?php\r/**\r * \r */", Position::new(2, 3)),
        (
            "unrelated-declaration",
            "<?php\nfunction unrelated(array $wrong) {}\n/**\n * \n */",
            Position::new(3, 3),
        ),
    ] {
        let sut = Backend::new_headless();
        let uri = Uri::parse("file:///eof-doc.php").unwrap();
        sut.did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri.clone(),
                language_id: "php".into(),
                version: 1,
                text: source.into(),
            },
        })
        .await;
        let result = sut
            .on_type_formatting(DocumentOnTypeFormattingParams {
                text_document: TextDocumentIdentifier { uri },
                position,
                ch: "\n".into(),
                options: FormattingOptions::new(4, true, None, None, None),
            })
            .await
            .unwrap();
        assert_eq!(
            result, None,
            "{name} must not generate from a missing or unrelated next declaration"
        );
        checked += 1;
    }
    assert_eq!(checked, 11);
    assert!(failures.is_empty(), "{failures:#?}");
}

fn fixture_lines(text: &str, row_count: usize, field_count: usize) -> Vec<&str> {
    let body = text.strip_suffix('\n').expect("fixture terminal LF");
    let rows = body.split('\n').collect::<Vec<_>>();
    assert_eq!(rows.len(), row_count, "complete ordered fixture rows");
    for row in &rows {
        assert!(!row.is_empty(), "empty fixture row");
        assert_eq!(
            row.split('\t').count(),
            field_count,
            "complete fixture fields"
        );
    }
    rows
}

#[test]
fn position_fixture_decoders_preserve_original_ordered_cells_and_reject_malformed_input() {
    let expected: [(&str, &[&[&str]]); 4] = include!("fixtures/position-fixture-semantics.rs");
    for (name, text, count, fields) in [
        (
            "generation-attributes.tsv",
            include_str!("fixtures/generation-attributes.tsv"),
            44,
            7,
        ),
        (
            "position-consumers.tsv",
            include_str!("fixtures/position-consumers.tsv"),
            75,
            10,
        ),
        (
            "position-consumers-contract.tsv",
            include_str!("fixtures/position-consumers-contract.tsv"),
            96,
            22,
        ),
        (
            "position-consumers-contract-v2.tsv",
            include_str!("fixtures/position-consumers-contract-v2.tsv"),
            111,
            23,
        ),
    ] {
        let actual = fixture_lines(text, count, fields)
            .into_iter()
            .map(|row| row.split('\t').map(decode).collect::<Vec<_>>())
            .collect::<Vec<_>>();
        let want = expected
            .iter()
            .find(|(key, _)| *key == name)
            .unwrap()
            .1
            .iter()
            .map(|row| {
                row.iter()
                    .map(|cell| (*cell).to_owned())
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>();
        assert_eq!(actual, want, "{name} full ordered rows/all empty fields");
    }
    assert_eq!(decode("A\\r\\n\\t\\\\"), "A\r\n\t\\");
    assert_eq!(decode("\\e"), "");
    for bad in ["\\q", "\\", "x\\e"] {
        assert!(std::panic::catch_unwind(|| decode(bad)).is_err());
    }
    for (text, rows, fields) in [
        ("x\n", 1, 2),
        ("n\ts\t0\t0\tsnippet\tdoc\n", 1, 7),
        ("x\t\\e\n\n", 2, 2),
        ("x", 1, 1),
        ("x\n", 2, 1),
    ] {
        assert!(std::panic::catch_unwind(|| fixture_lines(text, rows, fields)).is_err());
    }
}
