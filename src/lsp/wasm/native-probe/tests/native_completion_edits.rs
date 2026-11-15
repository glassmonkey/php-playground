use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};

fn offset(source: &str, position: Position) -> usize {
    let mut starts = vec![0];
    let bytes = source.as_bytes();
    let mut at = 0;
    while at < bytes.len() {
        match bytes[at] {
            b'\r' => {
                if bytes.get(at + 1) == Some(&b'\n') {
                    at += 1;
                }
                starts.push(at + 1);
            }
            b'\n' => starts.push(at + 1),
            _ => {}
        }
        at += 1;
    }
    let start = *starts
        .get(position.line as usize)
        .expect("edit line exists");
    let mut units = 0;
    for (relative, ch) in source[start..].char_indices() {
        if units == position.character {
            return start + relative;
        }
        assert!(!matches!(ch, '\r' | '\n'), "edit exceeds original line");
        units += ch.len_utf16() as u32;
        assert!(units <= position.character, "edit splits surrogate pair");
    }
    assert_eq!(units, position.character);
    source.len()
}

fn apply(source: &str, item: &CompletionItem) -> String {
    let Some(CompletionItemTextEdit::TextEdit(primary)) = &item.text_edit else {
        panic!("function needs explicit replacement range: {item:?}");
    };
    let mut edits = item.additional_text_edits.clone().unwrap_or_default();
    edits.push(primary.clone());
    let mut edits = edits
        .iter()
        .map(|e| {
            (
                offset(source, e.range.start),
                offset(source, e.range.end),
                &e.new_text,
            )
        })
        .collect::<Vec<_>>();
    edits.sort_by_key(|e| std::cmp::Reverse(e.0));
    let mut text = source.to_owned();
    let mut next = text.len();
    for (start, end, insertion) in edits {
        assert!(start <= end && end <= next, "overlapping/inverted edits");
        text.replace_range(start..end, insertion);
        next = start;
    }
    text
}

#[tokio::test]
async fn selected_function_replaces_complete_word_in_initial_and_resolved_payload() {
    let mut failures = Vec::new();
    let mut checked = 0;
    for (name, prefix) in [("target", ""), ("tar猫get", ""), ("tar𐐀get", "/* 🌟 */ ")] {
        let declaration = format!(
            "<?php\nnamespace Probe;\n/** SUFFIX_USER_DOC */ function {name}(): string {{ return 'user'; }}"
        );
        for tail in ["();", " /* keep */ ();", "() . '!';"] {
            let source = format!("<?php\nnamespace Probe;\n{prefix}{name}{tail}");
            let start = prefix.encode_utf16().count() as u32;
            let end = start + name.encode_utf16().count() as u32;
            let expected_range = Range {
                start: Position {
                    line: 2,
                    character: start,
                },
                end: Position {
                    line: 2,
                    character: end,
                },
            };
            let fqn = format!("Probe\\{name}");
            for minor in [0, 3] {
                for character in [start, start + 3, end] {
                    let sut = Backend::new_headless();
                    sut.set_php_version(PhpVersion::new(8, minor));
                    let uri = Uri::parse("file:///suffix-consumer.php").unwrap();
                    for (path, text) in [
                        ("file:///suffix-definition.php", declaration.as_str()),
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
                    let response = sut
                        .completion(CompletionParams {
                            text_document_position_params: TextDocumentPositionParams {
                                text_document: TextDocumentIdentifier { uri },
                                position: Position { line: 2, character },
                            },
                            work_done_progress_params: Default::default(),
                            partial_result_params: Default::default(),
                            context: None,
                        })
                        .await
                        .unwrap();
                    let items = match response {
                        Some(CompletionResponse::CompletionItemList(items)) => items,
                        Some(CompletionResponse::CompletionList(items)) => items.items,
                        None => Vec::new(),
                    };
                    let item = items.iter().find(|i| {
                        i.kind == Some(CompletionItemKind::Function)
                            && i.data
                                .as_ref()
                                .and_then(|d| d.get("m"))
                                .and_then(|m| m.as_str())
                                == Some(fqn.as_str())
                    });
                    let Some(item) = item else {
                        failures.push(format!(
                            "PHP8.{minor} cursor={character}: missing intended FQN; {items:?}"
                        ));
                        continue;
                    };
                    let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                    for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                        let expected_edit = CompletionItemTextEdit::TextEdit(TextEdit {
                            range: expected_range,
                            new_text: name.into(),
                        });
                        let identity = payload
                            .data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|m| m.as_str());
                        let full_document = apply(&source, payload);
                        if payload.text_edit.as_ref() != Some(&expected_edit)
                            || payload.label != format!("{name}()")
                            || payload.kind != Some(CompletionItemKind::Function)
                            || payload.filter_text.as_deref() != Some(name)
                            || payload.insert_text.as_deref() != Some(name)
                            || payload.insert_text_format.is_some()
                            || payload
                                .additional_text_edits
                                .as_ref()
                                .is_some_and(|e| !e.is_empty())
                            || payload.command.is_some()
                            || payload.text_edit_text.is_some()
                            || payload.insert_text_mode.is_some()
                            || identity != Some(fqn.as_str())
                            || full_document != source
                        {
                            failures.push(format!("PHP8.{minor} cursor={character} {stage}: want full word range={expected_range:?}, full document={source:?}; got={full_document:?}; complete payload={payload:?}"));
                        }
                        checked += 1;
                    }
                    let docs = match &resolved.documentation {
                        Some(Documentation::MarkupContent(m)) => m.value.as_str(),
                        Some(Documentation::String(s)) => s.as_str(),
                        None => "",
                    };
                    if !docs.contains("SUFFIX_USER_DOC") {
                        failures.push(format!(
                            "PHP8.{minor} cursor={character}: missing own docs: {resolved:?}"
                        ));
                    }
                }
            }
        }
    }
    assert_eq!(
        checked, 108,
        "all start/middle/end initial/resolved cases must run; {failures:#?}"
    );
    assert!(
        failures.is_empty(),
        "{} failures: {failures:#?}",
        failures.len()
    );
}

fn apply_with_default(source: &str, item: &CompletionItem, default_range: Range) -> String {
    let mut explicit = item.clone();
    if explicit.text_edit.is_none() {
        explicit.text_edit = Some(CompletionItemTextEdit::TextEdit(TextEdit {
            range: default_range,
            new_text: item
                .insert_text
                .clone()
                .unwrap_or_else(|| item.label.clone()),
        }));
    }
    assert!(
        item.insert_text_format != Some(InsertTextFormat::Snippet),
        "unexpected call snippet in already-complete fixture: {item:?}"
    );
    apply(source, &explicit)
}

#[tokio::test]
async fn representative_producers_preserve_complete_existing_tokens_and_binding_spelling() {
    struct Case {
        family: &'static str,
        definition: &'static str,
        source: &'static str,
        token: &'static str,
        cursors: &'static [usize],
        kind: CompletionItemKind,
        identity: Option<&'static str>,
        filter: Option<&'static str>,
    }
    let definitions = "<?php\nclass EditSubject { public int $value=7; public static int $staticValue=7; const VALUE=7; public function work(): int { return 7; } }\nconst GLOBAL_TOKEN=7;\nfunction args(int $alpha): int { return $alpha; }";
    let cases = [
        Case {
            family: "method",
            definition: definitions,
            source: "<?php\n$x=new EditSubject; $x->work();",
            token: "work",
            cursors: &[0, 2, 4],
            kind: CompletionItemKind::Method,
            identity: Some("work"),
            filter: None,
        },
        Case {
            family: "property",
            definition: definitions,
            source: "<?php\n$x=new EditSubject; echo $x->value;",
            token: "value",
            cursors: &[0, 2, 5],
            kind: CompletionItemKind::Property,
            identity: Some("value"),
            filter: None,
        },
        Case {
            family: "static-property",
            definition: definitions,
            source: "<?php\necho EditSubject::$staticValue;",
            token: "$staticValue",
            cursors: &[1, 5, 12],
            kind: CompletionItemKind::Property,
            identity: Some("staticValue"),
            filter: None,
        },
        Case {
            family: "class-constant",
            definition: definitions,
            source: "<?php\necho EditSubject::VALUE;",
            token: "VALUE",
            cursors: &[0, 2, 5],
            kind: CompletionItemKind::Constant,
            identity: Some("VALUE"),
            filter: None,
        },
        Case {
            family: "global-constant",
            definition: definitions,
            source: "<?php\necho GLOBAL_TOKEN;",
            token: "GLOBAL_TOKEN",
            cursors: &[0, 6, 12],
            kind: CompletionItemKind::Constant,
            identity: Some("GLOBAL_TOKEN"),
            filter: None,
        },
        Case {
            family: "qualified-constant",
            definition: "<?php\ndefine('Vendor\\TOKEN',7);",
            source: "<?php\necho Vendor\\TOKEN;",
            token: "Vendor\\TOKEN",
            cursors: &[0, 9, 12],
            kind: CompletionItemKind::Constant,
            identity: Some("Vendor\\TOKEN"),
            filter: None,
        },
        Case {
            family: "variable",
            definition: definitions,
            source: "<?php\n$Widget=7; /* 🌟 */ echo $Widget;",
            token: "$Widget",
            cursors: &[1, 4, 7],
            kind: CompletionItemKind::Variable,
            identity: None,
            filter: Some("$Widget"),
        },
        Case {
            family: "class",
            definition: definitions,
            source: "<?php\nnew EditSubject();",
            token: "EditSubject",
            cursors: &[0, 4, 11],
            kind: CompletionItemKind::Class,
            identity: Some("EditSubject"),
            filter: None,
        },
        Case {
            family: "class-import",
            definition: "<?php namespace Vendor; class Widget {}",
            source: "<?php\nuse Vendor\\Widget;",
            token: "Vendor\\Widget",
            cursors: &[0, 7, 10, 13],
            kind: CompletionItemKind::Class,
            identity: Some("Vendor\\Widget"),
            filter: None,
        },
        Case {
            family: "group-function-import",
            definition: "<?php namespace Vendor; function chosen() {}",
            source: "<?php\nuse Vendor\\{function chosen};",
            token: "chosen",
            cursors: &[0, 3, 6],
            kind: CompletionItemKind::Function,
            identity: Some("Vendor\\chosen"),
            filter: None,
        },
        Case {
            family: "named-argument",
            definition: definitions,
            source: "<?php\nargs(alpha: 7);",
            token: "alpha",
            cursors: &[0, 2, 5],
            kind: CompletionItemKind::Variable,
            identity: None,
            filter: Some("alpha"),
        },
        Case {
            family: "keyword",
            definition: definitions,
            source: "<?php\necho 7;",
            token: "echo",
            cursors: &[0, 2, 4],
            kind: CompletionItemKind::Keyword,
            identity: None,
            filter: Some("echo"),
        },
        Case {
            family: "builtin-function",
            definition: definitions,
            source: "<?php\nabs(-7);",
            token: "abs",
            cursors: &[0, 1, 3],
            kind: CompletionItemKind::Function,
            identity: Some("abs"),
            filter: None,
        },
    ];
    let mut failures = Vec::new();
    let mut requests = 0;
    let mut payloads = 0;
    for case in cases {
        for minor in [0, 3] {
            for &cursor in case.cursors {
                let sut = Backend::new_headless();
                sut.set_php_version(PhpVersion::new(8, minor));
                let uri = Uri::parse("file:///producer-consumer.php").unwrap();
                for (path, source) in [
                    ("file:///producer-definition.php", case.definition),
                    (uri.as_str(), case.source),
                ] {
                    sut.did_open(DidOpenTextDocumentParams {
                        text_document: TextDocumentItem {
                            uri: Uri::parse(path).unwrap(),
                            language_id: "php".into(),
                            version: 1,
                            text: source.into(),
                        },
                    })
                    .await;
                }
                let token_byte = case.source.rfind(case.token).unwrap();
                let prefix = &case.source[..token_byte];
                let line = prefix.bytes().filter(|&b| b == b'\n').count() as u32;
                let line_start = prefix.rfind('\n').map_or(0, |at| at + 1);
                let token_start = case.source[line_start..token_byte].encode_utf16().count() as u32;
                let cursor_units = case.token[..cursor].encode_utf16().count() as u32;
                let position = Position {
                    line,
                    character: token_start + cursor_units,
                };
                let response = sut
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
                let incomplete = matches!(&response,Some(CompletionResponse::CompletionList(list)) if list.is_incomplete);
                let items = match response {
                    Some(CompletionResponse::CompletionItemList(items)) => items,
                    Some(CompletionResponse::CompletionList(list)) => list.items,
                    None => Vec::new(),
                };
                requests += 1;
                let selected = items.iter().find(|item| {
                    item.kind == Some(case.kind)
                        && case.identity.is_none_or(|id| {
                            item.data
                                .as_ref()
                                .and_then(|d| d.get("m"))
                                .and_then(|m| m.as_str())
                                == Some(id)
                        })
                        && case
                            .filter
                            .is_none_or(|filter| item.filter_text.as_deref() == Some(filter))
                });
                let Some(item) = selected else {
                    failures.push(format!("{} PHP8.{minor} cursor={cursor}: missing positive candidate; incomplete={incomplete}; complete items={items:?}",case.family));
                    continue;
                };
                let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                // Fixture client word range excludes namespace separators, matching the
                // documented PHP word boundary. Sigils belong to variable tokens here.
                let left = case.token[..cursor].rfind('\\').map_or(0, |at| at + 1);
                let right = case.token[cursor..]
                    .find('\\')
                    .map_or(case.token.len(), |at| cursor + at);
                let default_range = Range {
                    start: Position {
                        line,
                        character: token_start + case.token[..left].encode_utf16().count() as u32,
                    },
                    end: Position {
                        line,
                        character: token_start + case.token[..right].encode_utf16().count() as u32,
                    },
                };
                for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                    let actual = apply_with_default(case.source, payload, default_range);
                    if payload.kind != Some(case.kind)
                        || case
                            .filter
                            .is_some_and(|filter| payload.filter_text.as_deref() != Some(filter))
                        || actual != case.source
                        || case.identity.is_some_and(|id| {
                            payload
                                .data
                                .as_ref()
                                .and_then(|d| d.get("m"))
                                .and_then(|m| m.as_str())
                                != Some(id)
                        })
                        || payload.command.is_some()
                        || payload.text_edit_text.is_some()
                        || payload.insert_text_mode.is_some()
                    {
                        failures.push(format!("{} PHP8.{minor} cursor={cursor} {stage}: independent want={:?}; got={actual:?}; complete payload={payload:?}",case.family,case.source));
                    }
                    payloads += 1;
                }
            }
        }
    }
    eprintln!(
        "PRODUCER_AUDIT requests={requests} payloads={payloads} failures={}",
        failures.len()
    );
    assert_eq!(requests, 80);
    assert_eq!(payloads, 160, "positive candidates missing: {failures:#?}");
    assert!(
        failures.is_empty(),
        "{} failures: {failures:#?}",
        failures.len()
    );
}

#[tokio::test]
async fn existing_call_parentheses_keep_selected_global_and_function_alias_binding() {
    let cases = [
        (
            "<?php\nnamespace App;\nfunction abs($local): int { return 99; }",
            "<?php\nnamespace App;\n\\abs(-7);",
            "\\abs",
            "abs",
            "\\abs",
            "<?php\nnamespace App;\n\\abs(-7);",
            "abs",
        ),
        (
            "<?php\nnamespace Vendor;\n/** ALIASED_DOC */ function chosen(): string { return 'vendor'; }",
            "<?php\nnamespace Consumer;\nuse function Vendor\\chosen as picked;\n\\Vendor\\chosen();",
            "\\Vendor\\chosen",
            "Vendor\\chosen",
            "picked",
            "<?php\nnamespace Consumer;\nuse function Vendor\\chosen as picked;\npicked();",
            "chosen",
        ),
    ];
    let mut failures = Vec::new();
    let mut checked = 0;
    for (definition, source, token, fqn, spelling, want, filter) in cases {
        for minor in [0, 3] {
            for cursor in [0, 3, token.len()] {
                let sut = Backend::new_headless();
                sut.set_php_version(PhpVersion::new(8, minor));
                let uri = Uri::parse("file:///binding-consumer.php").unwrap();
                for (path, text) in [
                    ("file:///binding-definition.php", definition),
                    (uri.as_str(), source),
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
                let token_byte = source.rfind(token).unwrap();
                let line = source[..token_byte].bytes().filter(|&b| b == b'\n').count() as u32;
                let start = source[..token_byte].rfind('\n').map_or(0, |at| at + 1);
                let col = source[start..token_byte].encode_utf16().count() as u32;
                let expected = Range {
                    start: Position {
                        line,
                        character: col,
                    },
                    end: Position {
                        line,
                        character: col + token.encode_utf16().count() as u32,
                    },
                };
                let response = sut
                    .completion(CompletionParams {
                        text_document_position_params: TextDocumentPositionParams {
                            text_document: TextDocumentIdentifier { uri },
                            position: Position {
                                line,
                                character: col + cursor as u32,
                            },
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
                let Some(item) = items.iter().find(|i| {
                    i.kind == Some(CompletionItemKind::Function)
                        && i.data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|v| v.as_str())
                            == Some(fqn)
                }) else {
                    failures.push(format!(
                        "{fqn} PHP8.{minor} cursor{cursor} missing; {items:?}"
                    ));
                    continue;
                };
                let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                    let got = apply(source, payload);
                    let edit = CompletionItemTextEdit::TextEdit(TextEdit {
                        range: expected,
                        new_text: spelling.into(),
                    });
                    if got != want
                        || payload.text_edit.as_ref() != Some(&edit)
                        || payload.insert_text.as_deref() != Some(spelling)
                        || payload.kind != Some(CompletionItemKind::Function)
                        || payload.filter_text.as_deref() != Some(filter)
                        || payload.label.split('(').next() != Some(filter)
                        || payload.insert_text_format.is_some()
                        || payload
                            .data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|m| m.as_str())
                            != Some(fqn)
                        || payload
                            .additional_text_edits
                            .as_ref()
                            .is_some_and(|e| !e.is_empty())
                        || payload.command.is_some()
                        || payload.text_edit_text.is_some()
                        || payload.insert_text_mode.is_some()
                    {
                        failures.push(format!("{fqn} PHP8.{minor} cursor{cursor} {stage}: want={want:?}, got={got:?}, payload={payload:?}"));
                    }
                    eprintln!(
                        "CORRECTED_CALL_DOCUMENT minor={minor} cursor={cursor} stage={stage} fqn={fqn:?} applied={got:?} payload={payload:?}"
                    );
                    checked += 1;
                }
            }
        }
    }
    assert_eq!(
        checked, 24,
        "all selected initial/resolved binding cases: {failures:#?}"
    );
    assert!(
        failures.is_empty(),
        "{} binding failures: {failures:#?}",
        failures.len()
    );
}

#[tokio::test]
async fn exact_existing_qname_survives_cap_in_import_and_alias_contexts() {
    let mut definition = "<?php\nnamespace Vendor;\n".to_owned();
    for n in 0..120 {
        definition.push_str(&format!("class A{n:03} {{}}\n"));
    }
    definition.push_str("class ZzzTarget { const MARKER='TARGET_CLASS'; }\nabstract class AbstractTarget {}\nfunction ZzzTarget(): string { return 'TARGET_FUNCTION'; }\n");
    let cases = [
        (
            "ordinary-import",
            "<?php\nnamespace Caller;\nuse Vendor\\ZzzTarget;",
            "Vendor\\ZzzTarget",
            "<?php\nnamespace Caller;\nuse Vendor\\ZzzTarget;",
        ),
        (
            "absolute-import",
            "<?php\nnamespace Caller;\nuse \\Vendor\\ZzzTarget;",
            "\\Vendor\\ZzzTarget",
            "<?php\nnamespace Caller;\nuse Vendor\\ZzzTarget;",
        ),
        (
            "group-import",
            "<?php\nnamespace Caller;\nuse Vendor\\{ZzzTarget};",
            "ZzzTarget",
            "<?php\nnamespace Caller;\nuse Vendor\\{ZzzTarget};",
        ),
        (
            "absolute-new",
            "<?php\nnamespace Caller;\nnew \\Vendor\\ZzzTarget();",
            "\\Vendor\\ZzzTarget",
            "<?php\nnamespace Caller;\nnew \\Vendor\\ZzzTarget();",
        ),
        (
            "namespace-alias",
            "<?php\nnamespace Caller;\nuse Vendor as Alias;\nnew Alias\\ZzzTarget();",
            "Alias\\ZzzTarget",
            "<?php\nnamespace Caller;\nuse Vendor as Alias;\nnew Alias\\ZzzTarget();",
        ),
    ];
    let mut failures = Vec::new();
    let mut requests = 0;
    let mut payloads = 0;
    for (name, source, token, want) in cases {
        for minor in [0, 3] {
            let leaf = token.rfind('\\').map_or(0, |at| at + 1);
            let cursors = std::collections::BTreeSet::from([0, leaf, leaf + 3, token.len()]);
            for cursor in cursors {
                let sut = Backend::new_headless();
                sut.set_php_version(PhpVersion::new(8, minor));
                let uri = Uri::parse("file:///cap-consumer.php").unwrap();
                for (path, text) in [
                    ("file:///cap-definition.php", definition.as_str()),
                    (uri.as_str(), source),
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
                let byte = source.rfind(token).unwrap();
                let line = source[..byte].bytes().filter(|&b| b == b'\n').count() as u32;
                let begin = source[..byte].rfind('\n').map_or(0, |at| at + 1);
                let start = source[begin..byte].encode_utf16().count() as u32;
                let response = sut
                    .completion(CompletionParams {
                        text_document_position_params: TextDocumentPositionParams {
                            text_document: TextDocumentIdentifier { uri },
                            position: Position {
                                line,
                                character: start + cursor as u32,
                            },
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
                requests += 1;
                let class_count = items
                    .iter()
                    .filter(|i| i.kind == Some(CompletionItemKind::Class))
                    .count();
                if class_count > 100 {
                    failures.push(format!("{name} returned {class_count} classes beyond cap"));
                }
                if cursor == 0 && name == "ordinary-import" && (!incomplete || class_count != 100) {
                    failures.push(format!("discriminating >100 fixture must report trimmed100/incomplete, got {class_count}/{incomplete}"));
                }
                let Some(item) = items.iter().find(|i| {
                    i.kind == Some(CompletionItemKind::Class)
                        && i.data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|m| m.as_str())
                            == Some("Vendor\\ZzzTarget")
                }) else {
                    failures.push(format!("{name} PHP8.{minor} cursor={cursor} no exact current FQN, incomplete={incomplete}, classes={class_count}"));
                    continue;
                };
                assert_eq!(
                    items
                        .iter()
                        .filter(|i| i
                            .data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|m| m.as_str())
                            == Some("Vendor\\ZzzTarget"))
                        .count(),
                    1,
                    "retention must dedupe"
                );
                let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                    let got = apply(source, payload);
                    let spelling = match name {
                        "ordinary-import" | "absolute-import" => "Vendor\\ZzzTarget",
                        "group-import" => "ZzzTarget",
                        "absolute-new" => "\\Vendor\\ZzzTarget",
                        "namespace-alias" => "Alias\\ZzzTarget",
                        _ => unreachable!("closed fixture table"),
                    };
                    let expected_range = Range {
                        start: Position {
                            line,
                            character: start,
                        },
                        end: Position {
                            line,
                            character: start + token.encode_utf16().count() as u32,
                        },
                    };
                    let expected_label = if name == "namespace-alias" {
                        "Alias\\ZzzTarget"
                    } else {
                        "Vendor\\ZzzTarget"
                    };
                    let expected_format = if name.ends_with("import") {
                        Some(InsertTextFormat::PlainText)
                    } else {
                        None
                    };
                    if got != want
                        || payload.label != expected_label
                        || payload.filter_text.as_deref() != Some(spelling)
                        || payload.insert_text.as_deref() != Some(spelling)
                        || payload.insert_text_format != expected_format
                        || payload.text_edit
                            != Some(CompletionItemTextEdit::TextEdit(TextEdit {
                                range: expected_range,
                                new_text: spelling.into(),
                            }))
                        || payload
                            .additional_text_edits
                            .as_ref()
                            .is_some_and(|edits| !edits.is_empty())
                        || payload.kind != Some(CompletionItemKind::Class)
                        || payload
                            .data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|m| m.as_str())
                            != Some("Vendor\\ZzzTarget")
                        || payload.command.is_some()
                        || payload.text_edit_text.is_some()
                        || payload.insert_text_mode.is_some()
                    {
                        failures.push(format!("{name} PHP8.{minor} cursor={cursor} {stage}: independent want={want:?}, got={got:?}, payload={payload:?}"));
                    }
                    eprintln!(
                        "CORRECTED_QNAME_DOCUMENT case={name} minor={minor} cursor={cursor} stage={stage} applied={got:?} payload={payload:?}"
                    );
                    payloads += 1;
                }
            }
        }
    }
    eprintln!(
        "EXACT_QNAME requests={requests} payloads={payloads} failures={}",
        failures.len()
    );
    assert_eq!(requests, 38);
    assert_eq!(payloads, 76, "missing positives: {failures:#?}");
    assert!(
        failures.is_empty(),
        "{} exact-QName failures: {failures:#?}",
        failures.len()
    );
}

#[tokio::test]
async fn exact_qname_retention_keeps_context_version_and_current_document_filters() {
    let definition = "<?php namespace Vendor; class ZzzTarget {} abstract class AbstractTarget {} function ZzzTarget() {}";
    // Expected absence follows PHP import kinds, instantiability and PHP 8.2's
    // Randomizer boundary, rather than the order of the completion results.
    let cases = [
        (
            "empty",
            "<?php\nnamespace Caller;\n",
            2,
            0,
            "Vendor\\ZzzTarget",
            0,
            false,
        ),
        (
            "no-match",
            "<?php\nuse Vendor\\Missing;",
            1,
            18,
            "Vendor\\ZzzTarget",
            0,
            false,
        ),
        (
            "wrong-kind",
            "<?php\nuse function Vendor\\ZzzTarget;",
            1,
            26,
            "Vendor\\ZzzTarget",
            0,
            false,
        ),
        (
            "abstract-new",
            "<?php\nnew \\Vendor\\AbstractTarget();",
            1,
            4,
            "Vendor\\AbstractTarget",
            0,
            false,
        ),
        (
            "unavailable",
            "<?php\nnew \\Random\\Randomizer();",
            1,
            4,
            "Random\\Randomizer",
            0,
            false,
        ),
        (
            "available",
            "<?php\nnew \\Random\\Randomizer();",
            1,
            4,
            "Random\\Randomizer",
            3,
            true,
        ),
        (
            "invalid-line",
            "<?php\nnew \\Vendor\\ZzzTarget();",
            40,
            0,
            "Vendor\\ZzzTarget",
            0,
            false,
        ),
        (
            "invalid-column",
            "<?php\nnew \\Vendor\\ZzzTarget();",
            1,
            200,
            "Vendor\\ZzzTarget",
            0,
            false,
        ),
        (
            "surrogate-interior",
            "<?php\n/* 🌟 */ new \\Vendor\\ZzzTarget();",
            1,
            4,
            "Vendor\\ZzzTarget",
            0,
            false,
        ),
    ];
    let mut checked = 0;
    for (name, source, line, character, fqn, minor, present) in cases {
        let sut = Backend::new_headless();
        sut.set_php_version(PhpVersion::new(8, minor));
        let uri = Uri::parse("file:///filtered-consumer.php").unwrap();
        for (path, text) in [
            ("file:///filtered-definition.php", definition),
            (uri.as_str(), source),
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
        let response = sut
            .completion(CompletionParams {
                text_document_position_params: TextDocumentPositionParams {
                    text_document: TextDocumentIdentifier { uri },
                    position: Position { line, character },
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
        let found = items
            .iter()
            .filter(|item| {
                item.data.as_ref().is_some_and(|d| {
                    d.get("k").and_then(|v| v.as_str()) == Some("class")
                        && d.get("m").and_then(|v| v.as_str()) == Some(fqn)
                })
            })
            .count();
        assert_eq!(
            found,
            usize::from(present),
            "{name}: context/version/current-document eligibility must precede retention"
        );
        checked += 1;
    }
    assert_eq!(checked, 9);
}

#[tokio::test]
async fn named_argument_full_word_edits_preserve_unicode_trivia_and_existing_colon() {
    let mut checked = 0;
    for name in ["alpha", "alpha猫", "alpha𐐀"] {
        let definition = format!("<?php function args(int ${name}): int {{return ${name};}}");
        for trivia in ["", " ", " /* keep : and :: */ "] {
            let source = format!("<?php\n/* 🌟 */ args({name}{trivia}: 7);");
            let token = source.rfind(name).unwrap();
            let start = source[source.rfind('\n').unwrap() + 1..token]
                .encode_utf16()
                .count() as u32;
            let range = Range {
                start: Position {
                    line: 1,
                    character: start,
                },
                end: Position {
                    line: 1,
                    character: start + name.encode_utf16().count() as u32,
                },
            };
            for minor in [0, 3] {
                for cursor in [0, 2, name.encode_utf16().count() as u32] {
                    let sut = Backend::new_headless();
                    sut.set_php_version(PhpVersion::new(8, minor));
                    let uri = Uri::parse("file:///unicode-arguments.php").unwrap();
                    for (path, text) in [
                        (
                            "file:///unicode-arguments-definition.php",
                            definition.as_str(),
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
                    // The second public request runs after resolving the first item.
                    for stage in ["cold", "warm"] {
                        let response = sut
                            .completion(CompletionParams {
                                text_document_position_params: TextDocumentPositionParams {
                                    text_document: TextDocumentIdentifier { uri: uri.clone() },
                                    position: Position {
                                        line: 1,
                                        character: start + cursor,
                                    },
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
                        let item=items.iter().find(|i|i.kind==Some(CompletionItemKind::Variable)&&i.filter_text.as_deref()==Some(name)).unwrap_or_else(||panic!("{stage} PHP8.{minor} {source:?} cursor={cursor}: missing parameter"));
                        let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                        for payload in [item, &resolved] {
                            assert_eq!(
                                payload.text_edit,
                                Some(CompletionItemTextEdit::TextEdit(TextEdit {
                                    range,
                                    new_text: name.into()
                                })),
                                "{stage} exact name range/newText"
                            );
                            assert_eq!(payload.insert_text.as_deref(), Some(name));
                            assert_eq!(payload.filter_text.as_deref(), Some(name));
                            assert_eq!(payload.kind, Some(CompletionItemKind::Variable));
                            assert!(
                                payload
                                    .additional_text_edits
                                    .as_ref()
                                    .is_none_or(Vec::is_empty)
                            );
                            assert_eq!(
                                apply(&source, payload),
                                source,
                                "{stage} complete document must preserve a single colon and trivia"
                            );
                            checked += 1;
                        }
                    }
                }
            }
        }
    }
    assert_eq!(checked, 216);
}

#[tokio::test]
async fn named_argument_does_not_replace_a_class_constant_subject() {
    let sut = Backend::new_headless();
    sut.set_php_version(PhpVersion::new(8, 3));
    let source = "<?php\nfunction args(int $alpha): int {return $alpha;}\nclass alpha {const VALUE=7;}\nargs(alpha::VALUE);";
    let uri = Uri::parse("file:///argument-constant.php").unwrap();
    sut.did_open(DidOpenTextDocumentParams {
        text_document: TextDocumentItem {
            uri: uri.clone(),
            language_id: "php".into(),
            version: 1,
            text: source.into(),
        },
    })
    .await;
    for character in [5, 7, 10] {
        let response = sut
            .completion(CompletionParams {
                text_document_position_params: TextDocumentPositionParams {
                    text_document: TextDocumentIdentifier { uri: uri.clone() },
                    position: Position { line: 3, character },
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
                .any(|i| i.kind == Some(CompletionItemKind::Variable)
                    && i.filter_text.as_deref() == Some("alpha")),
            "existing :: must stay a class-constant expression, cursor={character}"
        );
    }
}

#[tokio::test]
async fn qname_retention_uses_the_changed_document_after_public_warm_resolve() {
    let mut definition = "<?php namespace Vendor;".to_owned();
    for n in 0..120 {
        definition.push_str(&format!("class A{n:03} {{}}"));
    }
    definition.push_str("class ZzzTarget {}");
    let sut = Backend::new_headless();
    sut.set_php_version(PhpVersion::new(8, 3));
    let uri = Uri::parse("file:///changed-cap.php").unwrap();
    for (path, text) in [
        ("file:///changed-cap-definition.php", definition.as_str()),
        (uri.as_str(), "<?php\nuse Vendor\\ZzzTarget;"),
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
    for changed in [false, true] {
        if changed {
            sut.did_change(DidChangeTextDocumentParams {
                text_document: VersionedTextDocumentIdentifier {
                    text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                    version: 2,
                },
                content_changes: vec![
                    TextDocumentContentChangeEvent::TextDocumentContentChangeWholeDocument(
                        TextDocumentContentChangeWholeDocument {
                            text: "<?php\nuse Vendor\\Missing;".into(),
                        },
                    ),
                ],
            })
            .await;
        }
        let response = sut
            .completion(CompletionParams {
                text_document_position_params: TextDocumentPositionParams {
                    text_document: TextDocumentIdentifier { uri: uri.clone() },
                    position: Position {
                        line: 1,
                        character: 4,
                    },
                },
                work_done_progress_params: Default::default(),
                partial_result_params: Default::default(),
                context: None,
            })
            .await
            .unwrap();
        let Some(CompletionResponse::CompletionList(list)) = response else {
            panic!("bounded list required");
        };
        let class_count = list
            .items
            .iter()
            .filter(|i| {
                i.data
                    .as_ref()
                    .is_some_and(|d| d.get("k").and_then(|k| k.as_str()) == Some("class"))
            })
            .count();
        eprintln!(
            "QNAME_CHANGED_COUNTS changed={changed} total={} class={class_count} nonclass={}",
            list.items.len(),
            list.items.len() - class_count
        );
        assert!(list.is_incomplete);
        assert!(
            list.items
                .iter()
                .filter(|i| i
                    .data
                    .as_ref()
                    .is_some_and(|d| d.get("k").and_then(|k| k.as_str()) == Some("class")))
                .count()
                <= 100
        );
        let item = list.items.iter().find(|i| {
            i.data
                .as_ref()
                .is_some_and(|d| d.get("m").and_then(|m| m.as_str()) == Some("Vendor\\ZzzTarget"))
        });
        assert_eq!(
            item.is_some(),
            !changed,
            "only the current lexical QName receives bounded retention"
        );
        if let Some(item) = item {
            let resolved = sut.completion_resolve(item.clone()).await.unwrap();
            assert_eq!(
                apply("<?php\nuse Vendor\\ZzzTarget;", &resolved),
                "<?php\nuse Vendor\\ZzzTarget;"
            );
        }
    }
}
