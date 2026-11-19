use phpantom_lsp::{Backend, types::PhpVersion};
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};
// Compile the actual production module with the real LSP DTOs, not a mirrored algorithm.
#[allow(dead_code)]
#[path = "../../phpantom-source/src/text_position.rs"]
mod positions;

fn unescape(s: &str) -> String {
    let mut chars = s.chars();
    let mut out = String::new();
    while let Some(c) = chars.next() {
        if c == '\\' {
            out.push(match chars.next().unwrap() {
                'n' => '\n',
                'r' => '\r',
                't' => '\t',
                '\\' => '\\',
                other => panic!("unknown fixture escape {other}"),
            });
        } else {
            out.push(c);
        }
    }
    out
}
#[test]
fn original_byte_coordinates_match_direct_cached_inverse_and_scoped_cache() {
    let cases = [
        ("🌟a\nb", 6, Position::new(1, 0), vec![0, 6]),
        ("🌟a\r\nb", 7, Position::new(1, 0), vec![0, 7]),
        ("🌟a\rb", 6, Position::new(1, 0), vec![0, 6]),
        ("é\r\n🌟\rx\n", 9, Position::new(2, 0), vec![0, 4, 9, 11]),
        ("é\r", 3, Position::new(1, 0), vec![0, 3]),
        ("é\n", 3, Position::new(1, 0), vec![0, 3]),
        ("é\r\n", 4, Position::new(1, 0), vec![0, 4]),
    ];
    let mut failures = Vec::new();
    for (source, byte, expected, starts) in cases {
        let direct = positions::offset_to_position(source, byte);
        let index = positions::LineIndex::new(source);
        let cached = index.position(byte);
        let inverse = positions::position_to_byte_offset(source, expected);
        let table = positions::line_starts(source);
        let range = Range::new(expected, expected);
        let plain = positions::byte_range_to_lsp_range(source, byte, byte);
        let guard = positions::PassLineTable::new(source);
        let scoped = positions::byte_range_to_lsp_range(source, byte, byte);
        drop(guard);
        if direct != expected
            || cached != expected
            || inverse != byte
            || table != starts
            || plain != range
            || scoped != range
        {
            failures.push(format!("source={source:?} byte={byte} expected={expected:?} direct={direct:?} cached={cached:?} inverse={inverse} table={table:?} scoped={scoped:?}"));
        }
    }
    eprintln!("COORDINATE_MODULE cases=7 failures={}", failures.len());
    assert!(failures.is_empty(), "{failures:#?}");
}
#[tokio::test]
async fn public_definitions_preserve_original_canonical_coordinates_and_identity() {
    let rows = include_str!("fixtures/coordinates.tsv")
        .lines()
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 36);
    let mut failures = Vec::new();
    let mut requests = 0;
    for row in rows {
        let f = row.split('\t').map(unescape).collect::<Vec<_>>();
        assert_eq!(f.len(), 9);
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            for (path, source) in [
                ("file:///coordinate-definition.php", &f[1]),
                ("file:///coordinate-consumer.php", &f[2]),
            ] {
                sut.did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: Uri::parse(path).unwrap(),
                        language_id: "php".into(),
                        version: 1,
                        text: source.clone(),
                    },
                })
                .await;
            }
            for warm in [false, true] {
                if warm {
                    let kind = if f[0].starts_with("class-") {
                        CompletionItemKind::Class
                    } else if f[0].starts_with("method-") {
                        CompletionItemKind::Method
                    } else {
                        CompletionItemKind::Function
                    };
                    let member = if kind == CompletionItemKind::Method {
                        f[8].clone()
                    } else {
                        format!("Probe\\{}", f[8])
                    };
                    let response = sut
                        .completion(CompletionParams {
                            text_document_position_params: TextDocumentPositionParams {
                                text_document: TextDocumentIdentifier {
                                    uri: Uri::parse("file:///coordinate-consumer.php").unwrap(),
                                },
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
                    let item = items
                        .iter()
                        .find(|i| {
                            i.kind == Some(kind)
                                && i.data
                                    .as_ref()
                                    .and_then(|d| d.get("m"))
                                    .and_then(|m| m.as_str())
                                    == Some(member.as_str())
                        })
                        .unwrap_or_else(|| {
                            panic!(
                                "{} PHP8.{minor}: missing independently selected FQN {member}",
                                f[0]
                            )
                        });
                    let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                    assert_eq!(
                        resolved
                            .data
                            .as_ref()
                            .and_then(|d| d.get("m"))
                            .and_then(|m| m.as_str()),
                        Some(member.as_str())
                    );
                    if kind == CompletionItemKind::Method {
                        assert_eq!(
                            resolved
                                .data
                                .as_ref()
                                .and_then(|d| d.get("c"))
                                .and_then(|c| c.as_str()),
                            Some("Probe\\Owner")
                        );
                    }
                }
                let expected = Position::new(f[5].parse().unwrap(), f[6].parse().unwrap());
                let response = sut
                    .goto_definition(DefinitionParams {
                        text_document_position_params: TextDocumentPositionParams {
                            text_document: TextDocumentIdentifier {
                                uri: Uri::parse("file:///coordinate-consumer.php").unwrap(),
                            },
                            position: Position::new(f[3].parse().unwrap(), f[4].parse().unwrap()),
                        },
                        work_done_progress_params: Default::default(),
                        partial_result_params: Default::default(),
                    })
                    .await
                    .unwrap();
                let items = match &response {
                    Some(DefinitionResponse::Definition(Definition::Location(v))) => {
                        vec![v.clone()]
                    }
                    Some(DefinitionResponse::Definition(Definition::LocationList(v))) => v.clone(),
                    _ => Vec::new(),
                };
                eprintln!(
                    "PUBLIC_COORDINATE case={} PHP8.{minor} warm={warm} expected={expected:?} source={:?} response={response:?}",
                    f[0], f[1]
                );
                if items.len() != 1
                    || items[0].uri.as_str() != "file:///coordinate-definition.php"
                    || items[0].range != Range::new(expected, expected)
                {
                    failures.push(format!(
                        "{} PHP8.{minor} warm={warm} expected={expected:?} actual={response:?}",
                        f[0]
                    ));
                }
                requests += 1;
            }
        }
    }
    eprintln!(
        "PUBLIC_COORDINATE requests={requests} failures={}",
        failures.len()
    );
    assert_eq!(requests, 144);
    assert!(failures.is_empty(), "{failures:#?}");
}

#[test]
fn canonical_boundaries_include_crlf_interior_and_preserve_inclusive_line_ends() {
    let source = "é🌟\r\n猫\rx\n";
    let expected = [
        (0, 0, 0),
        (2, 0, 1),
        (6, 0, 3),
        (8, 1, 0),
        (11, 1, 1),
        (12, 2, 0),
        (13, 2, 1),
        (14, 3, 0),
    ];
    let index = positions::LineIndex::new(source);
    assert_eq!(positions::line_starts(source), vec![0, 8, 12, 14]);
    for (byte, line, col) in expected {
        let want = Position::new(line, col);
        assert_eq!(positions::offset_to_position(source, byte), want);
        assert_eq!(index.position(byte), want);
        assert_eq!(positions::position_in(source, &[0, 8, 12, 14], byte), want);
        assert_eq!(positions::position_to_byte_offset(source, want), byte);
        let chars = source.chars().collect::<Vec<_>>();
        let char_index = positions::position_to_char_offset(&chars, want).unwrap();
        assert_eq!(
            chars[..char_index]
                .iter()
                .map(|c| c.len_utf8())
                .sum::<usize>(),
            byte
        );
    }
    // Byte7 is LF inside CRLF: both terminator bytes denote the old line end,
    // while the next line starts after the complete pair at byte8.
    for byte in [6, 7] {
        assert_eq!(index.position(byte), Position::new(0, 3));
        assert_eq!(
            positions::offset_to_position(source, byte),
            Position::new(0, 3)
        );
        assert_eq!(positions::find_line_start(source, byte), 0);
        assert_eq!(positions::find_line_end(source, byte), 8);
    }
    for (byte, start, end) in [
        (0, 0, 8),
        (8, 8, 12),
        (9, 8, 12),
        (11, 8, 12),
        (12, 12, 14),
        (14, 14, 14),
        (999, 14, 14),
    ] {
        assert_eq!(positions::find_line_start(source, byte), start);
        assert_eq!(positions::find_line_end(source, byte), end);
    }
    assert_eq!(
        positions::lines_with_offsets(source).collect::<Vec<_>>(),
        vec![(0, "é🌟"), (8, "猫"), (12, "x")]
    );
    for (line, byte) in [(0, 0), (1, 8), (2, 12), (3, 14), (4, 14)] {
        assert_eq!(positions::line_start_byte_offset(source, line), byte);
        assert_eq!(index.line_start(line), byte);
    }
}

#[test]
fn empty_trailing_and_invalid_position_policies_are_explicit() {
    for (source, starts, lines, eof) in [
        ("", vec![0], vec![], Position::new(0, 0)),
        ("\r", vec![0, 1], vec![(0, "")], Position::new(1, 0)),
        ("\n", vec![0, 1], vec![(0, "")], Position::new(1, 0)),
        ("\r\n", vec![0, 2], vec![(0, "")], Position::new(1, 0)),
        (
            "\n\r\n\r",
            vec![0, 1, 3, 4],
            vec![(0, ""), (1, ""), (3, "")],
            Position::new(3, 0),
        ),
    ] {
        assert_eq!(positions::line_starts(source), starts);
        assert_eq!(
            positions::lines_with_offsets(source).collect::<Vec<_>>(),
            lines
        );
        assert_eq!(positions::offset_to_position(source, source.len()), eof);
        assert_eq!(
            positions::LineIndex::new(source).position(source.len()),
            eof
        );
        assert_eq!(
            positions::position_to_byte_offset(source, eof),
            source.len()
        );
    }
    let source = "é🌟\r\n猫\rx\n";
    let chars = source.chars().collect::<Vec<_>>();
    assert_eq!(
        positions::offset_to_position(source, 1),
        Position::new(0, 1)
    );
    assert_eq!(
        positions::offset_to_position(source, 3),
        Position::new(0, 3)
    );
    assert_eq!(
        positions::position_to_byte_offset(source, Position::new(0, 2)),
        6
    );
    assert_eq!(
        positions::position_to_char_offset(&chars, Position::new(0, 2)),
        Some(2)
    );
    assert_eq!(positions::utf16_col_to_byte_offset("é🌟", 2), 6);
    assert_eq!(positions::utf16_col_to_char_index("é🌟", 2), 2);
    assert_ne!(
        positions::offset_to_position(source, 6),
        Position::new(0, 2),
        "strict invalid-position callers must still reject a split via roundtrip"
    );
    assert_eq!(
        positions::position_to_byte_offset(source, Position::new(0, 99)),
        6
    );
    assert_eq!(
        positions::position_to_byte_offset(source, Position::new(99, 0)),
        14
    );
    assert_eq!(
        positions::position_to_char_offset(&chars, Position::new(99, 0)),
        None
    );
    let result = positions::apply_text_edits(
        source,
        &[TextEdit {
            range: Range::new(Position::new(0, 1), Position::new(0, 3)),
            new_text: "Z".into(),
        }],
    );
    assert_eq!(
        result, "éZ\r\n猫\rx\n",
        "only the selected scalar is replaced; original EOL bytes remain unchanged"
    );
}

#[tokio::test]
async fn public_inverse_coordinates_follow_original_cr_after_incremental_change() {
    let sut = Backend::new_headless();
    sut.set_php_version(PhpVersion::new(8, 3));
    let definition = Uri::parse("file:///incremental-definition.php").unwrap();
    let consumer = Uri::parse("file:///incremental-consumer.php").unwrap();
    let source = "<?php\rnamespace Probe;\r/* 🌟 */ class Target猫𐐀 {}\r";
    for (uri, text) in [
        (definition.clone(), source),
        (
            consumer.clone(),
            "<?php\nnamespace Probe;\nnew Target猫𐐀();",
        ),
    ] {
        sut.did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri,
                language_id: "php".into(),
                version: 1,
                text: text.into(),
            },
        })
        .await;
    }
    for step in [0, 1, 2] {
        if step == 1 {
            sut.did_change(DidChangeTextDocumentParams {
                text_document: VersionedTextDocumentIdentifier {
                    text_document_identifier: TextDocumentIdentifier {
                        uri: definition.clone(),
                    },
                    version: 2,
                },
                content_changes: vec![
                    TextDocumentContentChangeEvent::TextDocumentContentChangePartial(
                        TextDocumentContentChangePartial::new(
                            Range::new(Position::new(0, 5), Position::new(0, 5)),
                            None,
                            "\r".into(),
                        ),
                    ),
                ],
            })
            .await;
        }
        if step == 2 {
            sut.did_change(DidChangeTextDocumentParams {
                text_document: VersionedTextDocumentIdentifier {
                    text_document_identifier: TextDocumentIdentifier {
                        uri: consumer.clone(),
                    },
                    version: 2,
                },
                content_changes: vec![
                    TextDocumentContentChangeEvent::TextDocumentContentChangeWholeDocument(
                        TextDocumentContentChangeWholeDocument {
                            text: "<?php\rnamespace Probe;\rnew Target猫𐐀();".into(),
                        },
                    ),
                ],
            })
            .await;
        }
        let at = Position::new(if step == 0 { 2 } else { 3 }, 9);
        let expected = Location {
            uri: definition.clone(),
            range: Range::new(at, at),
        };
        for warm in [false, true] {
            let response = sut
                .goto_definition(DefinitionParams {
                    text_document_position_params: TextDocumentPositionParams {
                        text_document: TextDocumentIdentifier {
                            uri: consumer.clone(),
                        },
                        position: Position::new(2, 7),
                    },
                    work_done_progress_params: Default::default(),
                    partial_result_params: Default::default(),
                })
                .await
                .unwrap();
            assert_eq!(
                response,
                Some(DefinitionResponse::Definition(Definition::Location(
                    expected.clone()
                ))),
                "step={step} warm={warm}: original-byte incremental/source request coordinates"
            );
        }
    }
}

#[tokio::test]
async fn original_45_documents_keep_exact_target_definition_coordinates() {
    let rows = include_str!("fixtures/original-coordinate-cases.tsv")
        .lines()
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 45);
    let mut failures = Vec::new();
    let mut checked = 0;
    let mut nulls = 0;
    for row in rows {
        let f = row.split('\t').map(unescape).collect::<Vec<_>>();
        assert_eq!(f.len(), 9);
        let byte = f[8].parse::<usize>().unwrap();
        assert!(
            f[1].get(byte..).unwrap().starts_with(&f[7]),
            "independent original symbol/text guard"
        );
        for minor in [0, 3] {
            let sut = Backend::new_headless();
            sut.set_php_version(PhpVersion::new(8, minor));
            for (path, text) in [
                ("file:///definition.php", &f[1]),
                ("file:///consumer.php", &f[2]),
            ] {
                sut.did_open(DidOpenTextDocumentParams {
                    text_document: TextDocumentItem {
                        uri: Uri::parse(path).unwrap(),
                        language_id: "php".into(),
                        version: 1,
                        text: text.clone(),
                    },
                })
                .await;
            }
            for warm in [false, true] {
                let p = Position::new(f[5].parse().unwrap(), f[6].parse().unwrap());
                let expected = Location {
                    uri: Uri::parse("file:///definition.php").unwrap(),
                    range: Range::new(p, p),
                };
                let got = sut
                    .goto_definition(DefinitionParams {
                        text_document_position_params: TextDocumentPositionParams {
                            text_document: TextDocumentIdentifier {
                                uri: Uri::parse("file:///consumer.php").unwrap(),
                            },
                            position: Position::new(f[3].parse().unwrap(), f[4].parse().unwrap()),
                        },
                        work_done_progress_params: Default::default(),
                        partial_result_params: Default::default(),
                    })
                    .await
                    .unwrap();
                eprintln!(
                    "ORIGINAL_COORDINATE case={} PHP8.{minor} warm={warm} expected={expected:?} actual={got:?}",
                    f[0]
                );
                nulls += usize::from(got.is_none());
                if got
                    != Some(DefinitionResponse::Definition(Definition::Location(
                        expected,
                    )))
                {
                    failures.push(format!("{} PHP8.{minor} warm={warm} actual={got:?}", f[0]));
                }
                checked += 1;
            }
        }
    }
    eprintln!(
        "ORIGINAL_COORDINATE requests={checked} failures={} nulls={nulls}",
        failures.len()
    );
    assert_eq!(checked, 180);
    assert!(failures.is_empty(), "{failures:#?}");
}

#[tokio::test]
async fn definition_after_mixed_eol_literal_uses_original_bytes() {
    let sut = Backend::new_headless();
    sut.set_php_version(PhpVersion::new(8, 3));
    let definition = "<?php\rnamespace Probe;\rclass LiteralHolder { const VALUE='a\r\nb\rc\n🌟'; }\r/* 🌟 */ class TargetLiteral {}\r";
    eprintln!("COORDINATE_LITERAL source={definition:?}");
    for (path, source) in [
        ("file:///literal-definition.php", definition),
        (
            "file:///literal-consumer.php",
            "<?php\nnamespace Probe;\nnew TargetLiteral();",
        ),
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
    let at = Position::new(6, 9);
    let expected = Location {
        uri: Uri::parse("file:///literal-definition.php").unwrap(),
        range: Range::new(at, at),
    };
    let response = sut
        .goto_definition(DefinitionParams {
            text_document_position_params: TextDocumentPositionParams {
                text_document: TextDocumentIdentifier {
                    uri: Uri::parse("file:///literal-consumer.php").unwrap(),
                },
                position: Position::new(2, 7),
            },
            work_done_progress_params: Default::default(),
            partial_result_params: Default::default(),
        })
        .await
        .unwrap();
    assert_eq!(
        response,
        Some(DefinitionResponse::Definition(Definition::Location(
            expected
        )))
    );
}

#[tokio::test]
async fn original_request_positions_work_with_cr_crlf_and_mixed_consumers() {
    let rows = include_str!("fixtures/coordinates.tsv")
        .lines()
        .map(|row| row.split('\t').map(unescape).collect::<Vec<_>>())
        .filter(|f| f[0].ends_with("-CR"))
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 9);
    let mut checked = 0;
    for f in rows {
        for separator in ["\r", "\r\n", "mixed"] {
            for minor in [0, 3] {
                let consumer = if separator == "mixed" {
                    f[2].split('\n')
                        .enumerate()
                        .fold(String::new(), |mut out, (i, line)| {
                            if i > 0 {
                                out.push_str(if i % 2 == 1 { "\r" } else { "\r\n" });
                            }
                            out.push_str(line);
                            out
                        })
                } else {
                    f[2].replace('\n', separator)
                };
                let sut = Backend::new_headless();
                sut.set_php_version(PhpVersion::new(8, minor));
                for (path, text) in [
                    ("file:///input-definition.php", &f[1]),
                    ("file:///input-consumer.php", &consumer),
                ] {
                    sut.did_open(DidOpenTextDocumentParams {
                        text_document: TextDocumentItem {
                            uri: Uri::parse(path).unwrap(),
                            language_id: "php".into(),
                            version: 1,
                            text: text.clone(),
                        },
                    })
                    .await;
                }
                let p = Position::new(f[5].parse().unwrap(), f[6].parse().unwrap());
                let expected = Location {
                    uri: Uri::parse("file:///input-definition.php").unwrap(),
                    range: Range::new(p, p),
                };
                for warm in [false, true] {
                    let got = sut
                        .goto_definition(DefinitionParams {
                            text_document_position_params: TextDocumentPositionParams {
                                text_document: TextDocumentIdentifier {
                                    uri: Uri::parse("file:///input-consumer.php").unwrap(),
                                },
                                position: Position::new(
                                    f[3].parse().unwrap(),
                                    f[4].parse().unwrap(),
                                ),
                            },
                            work_done_progress_params: Default::default(),
                            partial_result_params: Default::default(),
                        })
                        .await
                        .unwrap();
                    assert_eq!(
                        got,
                        Some(DefinitionResponse::Definition(Definition::Location(
                            expected.clone()
                        ))),
                        "{} PHP8.{minor} separator={separator:?} warm={warm} consumer={consumer:?}",
                        f[0]
                    );
                    checked += 1;
                }
            }
        }
    }
    eprintln!("INVERSE_PUBLIC_COORDINATE requests={checked}");
    assert_eq!(checked, 108);
}

#[tokio::test]
async fn canonical_outside_edit_and_old_inside_suppression_have_independent_payload_contracts() {
    let row = include_str!("fixtures/boundary-interpolation.tsv")
        .lines()
        .find(|row| row.ends_with("\tCRonly-after"))
        .unwrap();
    let fields = row.split('\t').map(unescape).collect::<Vec<_>>();
    let source = &fields[0];
    assert_eq!((&fields[5][..], &fields[6][..]), ("5", "3"));
    assert!(source.contains("<<<'TXT'\r] Tar\rTXT)"));
    assert!(source.ends_with("\nTar;"));
    let byte = source.len() - 4;
    let mut expected_document = source[..byte].to_owned();
    expected_document.push_str("Target;");
    let mut checked = 0;
    for minor in [0, 3] {
        let sut = Backend::new_headless();
        sut.set_php_version(PhpVersion::new(8, minor));
        let uri = Uri::parse("file:///canonical-boundary-edit.php").unwrap();
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
            for (position, present) in [(Position::new(3, 3), false), (Position::new(5, 3), true)] {
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
                if !present {
                    assert!(
                        items.is_empty(),
                        "PHP8.{minor} warm={warm}: old coordinate is in nowdoc, not code"
                    );
                    continue;
                }
                let item = items
                    .iter()
                    .find(|i| {
                        i.kind == Some(CompletionItemKind::Class)
                            && i.data
                                .as_ref()
                                .and_then(|d| d.get("m"))
                                .and_then(|m| m.as_str())
                                == Some("Target")
                    })
                    .expect("canonical outside must retain independently selected Target");
                let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                for payload in [item, &resolved] {
                    let expected = TextEdit {
                        range: Range::new(Position::new(5, 0), Position::new(5, 3)),
                        new_text: "Target".into(),
                    };
                    assert_eq!(
                        payload.text_edit,
                        Some(CompletionItemTextEdit::TextEdit(expected.clone()))
                    );
                    assert_eq!(payload.insert_text.as_deref(), Some("Target"));
                    assert_eq!(payload.filter_text.as_deref(), Some("Target"));
                    assert_eq!(payload.label, "Target");
                    assert_eq!(payload.kind, Some(CompletionItemKind::Class));
                    assert_eq!(payload.insert_text_format, None);
                    assert!(
                        payload
                            .additional_text_edits
                            .as_ref()
                            .is_none_or(Vec::is_empty)
                    );
                    assert!(
                        payload.command.is_none()
                            && payload.text_edit_text.is_none()
                            && payload.insert_text_mode.is_none()
                    );
                    let Some(CompletionItemTextEdit::TextEdit(edit)) = &payload.text_edit else {
                        unreachable!()
                    };
                    let mut actual = source.clone();
                    actual.replace_range(byte..byte + 3, &edit.new_text);
                    assert_eq!(
                        actual, expected_document,
                        "all primary/additional edits applied to independently located original bytes"
                    );
                    checked += 1;
                }
            }
        }
    }
    assert_eq!(checked, 8);
}

#[tokio::test]
async fn position_line_consumers_keep_variable_member_and_call_target_identity() {
    let definitions = "class Target { public int $value=7; const VALUE=7; public function work(): int {return 7;} }";
    let cases = [
        (
            "variable",
            "$Widget=7;",
            "/* 🌟 */ echo $Widget;",
            "$Widget",
            CompletionItemKind::Variable,
            "$Widget",
            &[1usize, 4, 7][..],
        ),
        (
            "method",
            "$Widget=new Target;",
            "/* 🌟 */ echo $Widget->work();",
            "work",
            CompletionItemKind::Method,
            "work",
            &[0, 2, 4][..],
        ),
        (
            "property",
            "$Widget=new Target;",
            "/* 🌟 */ echo $Widget->value;",
            "value",
            CompletionItemKind::Property,
            "value",
            &[0, 2, 5][..],
        ),
        (
            "constant",
            "$Widget=new Target;",
            "/* 🌟 */ echo Target::VALUE;",
            "VALUE",
            CompletionItemKind::Constant,
            "VALUE",
            &[0, 2, 5][..],
        ),
        (
            "call-target",
            "$Widget=new Target;",
            "/* 🌟 */ echo $Widget->",
            "",
            CompletionItemKind::Method,
            "work",
            &[0][..],
        ),
    ];
    let mut failures = Vec::new();
    let mut payloads = 0;
    let mut requests = 0;
    for (family, assignment, expression, token, kind, member, cursors) in cases {
        for eol in ["\n", "\r\n", "\r"] {
            for minor in [0, 3] {
                for &cursor in cursors {
                    let source =
                        format!("<?php{eol}{definitions}{eol}{assignment}{eol}{expression}");
                    let byte = if token.is_empty() {
                        source.len()
                    } else {
                        source.rfind(token).unwrap()
                    };
                    let start = expression[..byte - (source.len() - expression.len())]
                        .encode_utf16()
                        .count() as u32;
                    let range = Range::new(
                        Position::new(3, start),
                        Position::new(3, start + token.encode_utf16().count() as u32),
                    );
                    let expected = if family == "call-target" {
                        format!("{source}work()")
                    } else {
                        source.clone()
                    };
                    let sut = Backend::new_headless();
                    sut.set_php_version(PhpVersion::new(8, minor));
                    let uri = Uri::parse("file:///line-consumer.php").unwrap();
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
                                    position: Position::new(3, start + cursor as u32),
                                },
                                work_done_progress_params: Default::default(),
                                partial_result_params: Default::default(),
                                context: None,
                            })
                            .await
                            .unwrap();
                        requests += 1;
                        let items = match &response {
                            Some(CompletionResponse::CompletionItemList(v)) => v.as_slice(),
                            Some(CompletionResponse::CompletionList(v)) => v.items.as_slice(),
                            None => &[],
                        };
                        let item = items.iter().find(|i| {
                            i.kind == Some(kind)
                                && if kind == CompletionItemKind::Variable {
                                    i.filter_text.as_deref() == Some(member)
                                } else {
                                    i.data.as_ref().is_some_and(|d| {
                                        d.get("m").and_then(|m| m.as_str()) == Some(member)
                                            && d.get("c").and_then(|c| c.as_str()) == Some("Target")
                                    })
                                }
                        });
                        let Some(item) = item else {
                            failures.push(format!("{family} PHP8.{minor} eol={eol:?} cursor={cursor} warm={warm} MISSING source={source:?} response={response:?}"));
                            continue;
                        };
                        let resolved = sut.completion_resolve(item.clone()).await.unwrap();
                        for (stage, payload) in [("initial", item), ("resolved", &resolved)] {
                            let (actual_range, text) = match &payload.text_edit {
                                Some(CompletionItemTextEdit::TextEdit(e)) => {
                                    (e.range, e.new_text.clone())
                                }
                                None => (
                                    range,
                                    payload
                                        .insert_text
                                        .clone()
                                        .unwrap_or_else(|| payload.label.clone()),
                                ),
                                _ => panic!("replace-only fixture"),
                            };
                            let expected_text = if family == "call-target" {
                                "work()$0"
                            } else {
                                token
                            };
                            let plain = text.replace("$0", "");
                            let mut actual = source.clone();
                            actual.replace_range(byte..byte + token.len(), &plain);
                            let format_ok = if family == "call-target" {
                                payload.insert_text_format == Some(InsertTextFormat::Snippet)
                            } else {
                                payload.insert_text_format != Some(InsertTextFormat::Snippet)
                            };
                            let identity_ok = if family == "variable" {
                                payload.filter_text.as_deref() == Some("$Widget")
                                    && payload.data.is_none()
                            } else {
                                payload.data.as_ref().is_some_and(|d| {
                                    d.get("m").and_then(|m| m.as_str()) == Some(member)
                                        && d.get("c").and_then(|c| c.as_str()) == Some("Target")
                                        && d.get("k").and_then(|k| k.as_str())
                                            == Some(if kind == CompletionItemKind::Method {
                                                "method"
                                            } else if kind == CompletionItemKind::Property {
                                                "property"
                                            } else {
                                                "constant"
                                            })
                                })
                            };
                            if !identity_ok
                                || actual_range != range
                                || text != expected_text
                                || actual != expected
                                || payload.kind != Some(kind)
                                || !format_ok
                                || payload
                                    .additional_text_edits
                                    .as_ref()
                                    .is_some_and(|v| !v.is_empty())
                                || payload.command.is_some()
                                || payload.text_edit_text.is_some()
                                || payload.insert_text_mode.is_some()
                                || (family == "variable" && payload.text_edit.is_none())
                            {
                                failures.push(format!("{family} PHP8.{minor} eol={eol:?} cursor={cursor} warm={warm} {stage}: expected={expected:?}, actual={actual:?}, payload={payload:?}"));
                            }
                            payloads += 1;
                        }
                    }
                }
            }
        }
    }
    eprintln!(
        "POSITION_LINE_CONSUMERS requests={requests} payloads={payloads} failures={}",
        failures.len()
    );
    assert_eq!(requests, 156);
    assert_eq!(payloads, 312, "missing positives: {failures:#?}");
    assert!(failures.is_empty(), "{failures:#?}");
}
