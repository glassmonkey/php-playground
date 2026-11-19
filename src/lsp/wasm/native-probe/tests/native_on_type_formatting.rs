use phpantom_lsp::Backend;
use tower_lsp_server::{LanguageServer, gen_lsp_types::*};
#[tokio::test]
async fn natural_monaco_enter_unclosed_docblock_generates_plain_text() {
    let sut = Backend::new_headless();
    let uri = Uri::parse("file:///natural-enter.php").unwrap();
    let source = "<?php\n/**\n\nfunction greet($name): string { return $name; }\n";
    sut.did_open(DidOpenTextDocumentParams {
        text_document: TextDocumentItem {
            uri: uri.clone(),
            language_id: "php".into(),
            version: 5,
            text: source.into(),
        },
    })
    .await;
    let actual = sut
        .on_type_formatting(DocumentOnTypeFormattingParams {
            text_document: TextDocumentIdentifier { uri },
            position: Position::new(2, 0),
            ch: "\n".into(),
            options: FormattingOptions {
                tab_size: 4,
                insert_spaces: true,
                ..Default::default()
            },
        })
        .await
        .unwrap();
    let expected = Some(vec![TextEdit {
        range: Range::new(Position::new(1, 0), Position::new(3, 0)),
        new_text: "/**\n * @param mixed $name\n */\n".into(),
    }]);
    eprintln!("NATURAL_ENTER source={source:?} actual={actual:?} expected={expected:?}");
    assert_eq!(actual, expected);
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

fn apply_edits(source: &str, edits: &[TextEdit]) -> Option<String> {
    let mut spans = edits
        .iter()
        .map(|e| {
            Some((
                offset(source, e.range.start)?,
                offset(source, e.range.end)?,
                e.new_text.clone(),
            ))
        })
        .collect::<Option<Vec<_>>>()?;
    spans.sort_by_key(|e| std::cmp::Reverse(e.0));
    let mut last = source.len();
    let mut document = source.to_owned();
    for (a, b, text) in spans {
        if a > b || b > last {
            return None;
        }
        document.replace_range(a..b, &text);
        last = a;
    }
    Some(document)
}
fn params(uri: &Uri, f: &[String]) -> DocumentOnTypeFormattingParams {
    DocumentOnTypeFormattingParams {
        text_document: TextDocumentIdentifier { uri: uri.clone() },
        position: Position::new(f[2].parse().unwrap(), f[3].parse().unwrap()),
        ch: f[12].clone(),
        options: FormattingOptions {
            tab_size: f[13].parse().unwrap(),
            insert_spaces: f[14].parse().unwrap(),
            ..Default::default()
        },
    }
}
#[tokio::test]
async fn versioned_on_type_full_edits_follow_independent_complete_fixture_table() {
    let rows = fixture_rows(include_str!("fixtures/on-type-positive.tsv"), 60, 18);
    assert_eq!(
        rows.iter()
            .map(|f| &f[0])
            .collect::<std::collections::HashSet<_>>()
            .len(),
        60
    );
    let mut counts = Vec::new();
    let mut responses = 0;
    let mut mutants = 0;
    for (major, minor, wanted_count) in [
        (5, 6, 40),
        (7, 0, 48),
        (7, 1, 48),
        (7, 2, 48),
        (7, 3, 48),
        (7, 4, 48),
        (8, 0, 60),
        (8, 1, 60),
        (8, 2, 60),
        (8, 3, 60),
        (8, 4, 60),
        (8, 5, 60),
    ] {
        let mut count = 0;
        for f in &rows {
            if (major, minor) < (f[4].parse::<u32>().unwrap(), f[5].parse::<u32>().unwrap()) {
                continue;
            }
            let sut = Backend::new_headless();
            sut.set_php_version(phpantom_lsp::types::PhpVersion::new(
                major as u8,
                minor as u8,
            ));
            let uri = Uri::parse("file:///on-type-full.php").unwrap();
            sut.did_open(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: uri.clone(),
                    language_id: "php".into(),
                    version: 5,
                    text: f[1].clone(),
                },
            })
            .await;
            let wanted = vec![TextEdit {
                range: Range::new(
                    Position::new(f[6].parse().unwrap(), f[7].parse().unwrap()),
                    Position::new(f[8].parse().unwrap(), f[9].parse().unwrap()),
                ),
                new_text: f[10].clone(),
            }];
            for warm in [false, true] {
                if warm {
                    warm_runtime(&sut).await;
                }
                let actual = sut.on_type_formatting(params(&uri, f)).await.unwrap();
                assert_eq!(
                    actual.as_ref(),
                    Some(&wanted),
                    "{} {major}.{minor} warm={warm}",
                    f[0]
                );
                let actual = actual.unwrap();
                assert_eq!(
                    apply_edits(&f[1], &actual).as_deref(),
                    Some(f[11].as_str()),
                    "{} document",
                    f[0]
                );
                responses += 1;
                if !warm {
                    for kind in 0..3 {
                        let mut bad = actual.clone();
                        if kind == 0 {
                            bad[0].range.end.character += 1;
                        } else if kind == 1 {
                            bad[0].new_text.push('!');
                        } else {
                            bad.push(TextEdit {
                                range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                                new_text: "unexpected".into(),
                            });
                        }
                        assert!(
                            bad != wanted
                                && apply_edits(&f[1], &bad).as_deref() != Some(f[11].as_str())
                        );
                        mutants += 1;
                    }
                }
            }
            count += 1;
        }
        assert_eq!(
            count, wanted_count,
            "target fixture table must not become vacuous"
        );
        counts.push(count);
    }
    assert_eq!((counts.len(), responses, mutants), (12, 1280, 1920));
    eprintln!("ON_TYPE_FULL targetCounts={counts:?} responses={responses} mutants={mutants}");
}

#[tokio::test]
async fn on_type_opaque_html_documented_and_other_trigger_are_unchanged() {
    let rows = fixture_rows(include_str!("fixtures/on-type-negative.tsv"), 40, 9);
    assert_eq!(
        rows.iter()
            .map(|f| &f[0])
            .collect::<std::collections::HashSet<_>>()
            .len(),
        40
    );
    let mut responses = 0;
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
        for f in &rows {
            if (major, minor) < (f[4].parse::<u32>().unwrap(), f[5].parse::<u32>().unwrap()) {
                continue;
            }
            let sut = Backend::new_headless();
            sut.set_php_version(phpantom_lsp::types::PhpVersion::new(
                major as u8,
                minor as u8,
            ));
            let uri = Uri::parse("file:///on-type-negative.php").unwrap();
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
                    warm_runtime(&sut).await;
                }
                let actual = sut
                    .on_type_formatting(DocumentOnTypeFormattingParams {
                        text_document: TextDocumentIdentifier { uri: uri.clone() },
                        position: Position::new(f[2].parse().unwrap(), f[3].parse().unwrap()),
                        ch: f[6].clone(),
                        options: FormattingOptions {
                            tab_size: f[7].parse().unwrap(),
                            insert_spaces: f[8].parse().unwrap(),
                            ..Default::default()
                        },
                    })
                    .await
                    .unwrap();
                assert_eq!(actual, None, "{} {major}.{minor} warm={warm}", f[0]);
                responses += 1;
            }
        }
    }
    assert_eq!(responses, 876);
    eprintln!("ON_TYPE_NEGATIVE responses={responses}");
}
#[tokio::test]
async fn on_type_latest_did_change_and_closed_document_contract() {
    let source = "<?php\n/**\n\nfunction greet($name) { return $name; }\n";
    let generated = "/**\n * @param mixed $name\n *\n * @return mixed\n */\n";
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
        let sut = Backend::new_headless();
        sut.set_php_version(phpantom_lsp::types::PhpVersion::new(major, minor));
        let uri = Uri::parse("file:///on-type-change.php").unwrap();
        sut.did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri.clone(),
                language_id: "php".into(),
                version: 5,
                text: source.into(),
            },
        })
        .await;
        let params = DocumentOnTypeFormattingParams {
            text_document: TextDocumentIdentifier { uri: uri.clone() },
            position: Position::new(2, 0),
            ch: "\n".into(),
            options: FormattingOptions {
                tab_size: 4,
                insert_spaces: true,
                ..Default::default()
            },
        };
        let wanted = Some(vec![TextEdit {
            range: Range::new(Position::new(1, 0), Position::new(3, 0)),
            new_text: generated.into(),
        }]);
        assert_eq!(
            sut.on_type_formatting(params.clone()).await.unwrap(),
            wanted
        );
        let changed = source.replace("$name", "$changed");
        sut.did_change(DidChangeTextDocumentParams {
            text_document: VersionedTextDocumentIdentifier {
                text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                version: 6,
            },
            content_changes: vec![
                TextDocumentContentChangeEvent::TextDocumentContentChangeWholeDocument(
                    TextDocumentContentChangeWholeDocument {
                        text: changed.clone(),
                    },
                ),
            ],
        })
        .await;
        let wanted = Some(vec![TextEdit {
            range: Range::new(Position::new(1, 0), Position::new(3, 0)),
            new_text: generated.replace("$name", "$changed"),
        }]);
        let actual = sut.on_type_formatting(params.clone()).await.unwrap();
        assert_eq!(actual, wanted);
        assert_eq!(
            apply_edits(&changed, &actual.unwrap()).unwrap(),
            "<?php\n/**\n * @param mixed $changed\n *\n * @return mixed\n */\nfunction greet($changed) { return $changed; }\n"
        );
        sut.did_close(DidCloseTextDocumentParams {
            text_document: TextDocumentIdentifier { uri: uri.clone() },
        })
        .await;
        assert_eq!(sut.on_type_formatting(params).await.unwrap(), None);
    }
}

#[tokio::test]
async fn legacy_preclosed_indented_cursor_inside_closing_delimiter_is_preserved() {
    let sut = Backend::new_headless();
    let uri = Uri::parse("file:///on-type-legacy.php").unwrap();
    let source = "<?php\n    /** */\n    function greet($name): string { return $name; }\n";
    sut.did_open(DidOpenTextDocumentParams {
        text_document: TextDocumentItem {
            uri: uri.clone(),
            language_id: "php".into(),
            version: 1,
            text: source.into(),
        },
    })
    .await;
    let actual = sut
        .on_type_formatting(DocumentOnTypeFormattingParams {
            text_document: TextDocumentIdentifier { uri },
            position: Position::new(1, 9),
            ch: "\n".into(),
            options: FormattingOptions {
                tab_size: 4,
                insert_spaces: true,
                ..Default::default()
            },
        })
        .await
        .unwrap();
    let wanted = Some(vec![TextEdit {
        range: Range::new(Position::new(1, 0), Position::new(2, 0)),
        new_text: "    /**\n     * @param mixed $name\n     */\n".into(),
    }]);
    eprintln!("LEGACY_PRECLOSED actual={actual:?} expected={wanted:?}");
    assert_eq!(actual, wanted);
}
#[tokio::test]
async fn natural_property_retains_existing_constructor_enrichment() {
    let sut = Backend::new_headless();
    let uri = Uri::parse("file:///on-type-property.php").unwrap();
    let source = "<?php\nclass Repository {}\nclass Service {\n    /**\n    \n    private $repository;\n    public function __construct() { $this->repository = new Repository(); }\n}\n";
    sut.did_open(DidOpenTextDocumentParams {
        text_document: TextDocumentItem {
            uri: uri.clone(),
            language_id: "php".into(),
            version: 1,
            text: source.into(),
        },
    })
    .await;
    let actual = sut
        .on_type_formatting(DocumentOnTypeFormattingParams {
            text_document: TextDocumentIdentifier { uri },
            position: Position::new(4, 4),
            ch: "\n".into(),
            options: FormattingOptions {
                tab_size: 4,
                insert_spaces: true,
                ..Default::default()
            },
        })
        .await
        .unwrap();
    let wanted = Some(vec![TextEdit {
        range: Range::new(Position::new(3, 0), Position::new(5, 0)),
        new_text: "    /** @var \\Repository */\n".into(),
    }]);
    eprintln!("NATURAL_PROPERTY actual={actual:?} expected={wanted:?}");
    assert_eq!(actual, wanted);
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

async fn warm_runtime(sut: &Backend) {
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
async fn inferred_property_types_preserve_namespace_and_existing_import_aliases() {
    let rows = fixture_rows(
        include_str!("fixtures/on-type-inferred-identity.tsv"),
        9,
        18,
    );
    let mut responses = 0;
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
        for f in &rows {
            assert_eq!((&f[4], &f[5]), (&"5".to_string(), &"6".to_string()));
            let sut = Backend::new_headless();
            sut.set_php_version(phpantom_lsp::types::PhpVersion::new(major, minor));
            let uri = Uri::parse("file:///inferred-identity.php").unwrap();
            sut.did_open(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: uri.clone(),
                    language_id: "php".into(),
                    version: 1,
                    text: f[1].clone(),
                },
            })
            .await;
            let wanted = vec![TextEdit {
                range: Range::new(
                    Position::new(f[6].parse().unwrap(), f[7].parse().unwrap()),
                    Position::new(f[8].parse().unwrap(), f[9].parse().unwrap()),
                ),
                new_text: f[10].clone(),
            }];
            for warm in [false, true] {
                if warm {
                    warm_runtime(&sut).await;
                }
                let actual = sut.on_type_formatting(params(&uri, f)).await.unwrap();
                assert_eq!(
                    actual.as_ref(),
                    Some(&wanted),
                    "{} {major}.{minor} warm={warm}",
                    f[0]
                );
                assert_eq!(
                    apply_edits(&f[1], &actual.unwrap()).as_deref(),
                    Some(f[11].as_str())
                );
                responses += 1;
            }
        }
    }
    assert_eq!(responses, 216);
    eprintln!("INFERRED_PROPERTY_IDENTITY responses={responses}");
}

#[tokio::test]
async fn closed_nonempty_docblock_examples_are_unchanged() {
    for (source, position) in [
        (
            "<?php\n/**\n\nfunction example($x) {}\n*/\nfunction actual() {}\necho 99;\n",
            Position::new(2, 0),
        ),
        (
            "<?php\nclass C {\n/**\n\npublic $example;\n*/\npublic $actual;\n}\necho 99;\n",
            Position::new(3, 0),
        ),
        (
            "<?php\n/**\n\nThis is retained documentation.\n*/\nfunction actual() {}\necho 99;\n",
            Position::new(2, 0),
        ),
    ] {
        let sut = Backend::new_headless();
        let uri = Uri::parse("file:///closed-doc.php").unwrap();
        sut.did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri.clone(),
                language_id: "php".into(),
                version: 1,
                text: source.into(),
            },
        })
        .await;
        let actual = sut
            .on_type_formatting(DocumentOnTypeFormattingParams {
                text_document: TextDocumentIdentifier { uri },
                position,
                ch: "\n".into(),
                options: FormattingOptions {
                    tab_size: 2,
                    insert_spaces: false,
                    ..Default::default()
                },
            })
            .await
            .unwrap();
        assert_eq!(actual, None, "closed nonempty original={source:?}");
    }
}

#[tokio::test]
async fn namespace_relative_property_annotation_has_native_identity() {
    for spelling in [r"namespace\Repository", "Repository", r"\Demo\Repository"] {
        let source = format!(
            "<?php\nnamespace Demo;\nclass Repository {{}}\nclass Holder {{\n/**\n\npublic {spelling} $repository;\n}}\n"
        );
        let sut = Backend::new_headless();
        let uri = Uri::parse("file:///namespace-doc.php").unwrap();
        sut.did_open(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri.clone(),
                language_id: "php".into(),
                version: 1,
                text: source.clone(),
            },
        })
        .await;
        let actual = sut
            .on_type_formatting(DocumentOnTypeFormattingParams {
                text_document: TextDocumentIdentifier { uri },
                position: Position::new(5, 0),
                ch: "\n".into(),
                options: FormattingOptions {
                    tab_size: 2,
                    insert_spaces: false,
                    ..Default::default()
                },
            })
            .await
            .unwrap();
        let expected = Some(vec![TextEdit {
            range: Range::new(Position::new(4, 0), Position::new(6, 0)),
            new_text: "/** @var \\Demo\\Repository */\n".into(),
        }]);
        assert_eq!(actual, expected, "written={spelling}");
        assert_eq!(
            apply_edits(&source, actual.as_ref().unwrap()).unwrap(),
            format!(
                "<?php\nnamespace Demo;\nclass Repository {{}}\nclass Holder {{\n/** @var \\Demo\\Repository */\npublic {spelling} $repository;\n}}\n"
            )
        );
    }
}

#[tokio::test]
async fn written_namespace_relative_alias_and_eol_full_documents() {
    let cases = fixture_rows(
        include_str!("fixtures/on-type-namespace-regression.tsv"),
        28,
        9,
    );
    let mut responses = 0;
    for (major, minor) in [(7, 4), (8, 0), (8, 1), (8, 2), (8, 3), (8, 4), (8, 5)] {
        for f in &cases {
            if (major, minor) < (f[7].parse().unwrap(), f[8].parse().unwrap()) {
                continue;
            }
            let sut = Backend::new_headless();
            sut.set_php_version(phpantom_lsp::types::PhpVersion::new(major, minor));
            let uri = Uri::parse("file:///namespace-expanded.php").unwrap();
            sut.did_open(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: uri.clone(),
                    language_id: "php".into(),
                    version: 1,
                    text: f[1].clone(),
                },
            })
            .await;
            for step in 0..2 {
                if step == 1 {
                    sut.did_change(DidChangeTextDocumentParams {
                        text_document: VersionedTextDocumentIdentifier {
                            text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                            version: 2,
                        },
                        content_changes: vec![
                            TextDocumentContentChangeEvent::TextDocumentContentChangeWholeDocument(
                                TextDocumentContentChangeWholeDocument { text: f[1].clone() },
                            ),
                        ],
                    })
                    .await;
                }
                let line = f[2].parse::<u32>().unwrap();
                let actual = sut
                    .on_type_formatting(DocumentOnTypeFormattingParams {
                        text_document: TextDocumentIdentifier { uri: uri.clone() },
                        position: Position::new(line, f[3].parse().unwrap()),
                        ch: "\n".into(),
                        options: FormattingOptions {
                            tab_size: 2,
                            insert_spaces: false,
                            ..Default::default()
                        },
                    })
                    .await
                    .unwrap();
                let expected = Some(vec![TextEdit {
                    range: Range::new(
                        Position::new(line - 1, 0),
                        Position::new(f[5].parse().unwrap(), 0),
                    ),
                    new_text: f[4].clone(),
                }]);
                assert_eq!(
                    actual, expected,
                    "case={} target={major}.{minor} step={step}",
                    f[0]
                );
                assert_eq!(
                    apply_edits(&f[1], actual.as_ref().unwrap()).as_deref(),
                    Some(f[6].as_str())
                );
                responses += 1;
            }
        }
    }
    assert_eq!(responses, 384);
}

#[tokio::test]
async fn closed_nonempty_original_docs_preserve_all_canonical_eols_and_latest_text() {
    let cases = fixture_rows(include_str!("fixtures/on-type-closed.tsv"), 16, 7);
    let mut requests = 0;
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
        for f in &cases {
            let sut = Backend::new_headless();
            sut.set_php_version(phpantom_lsp::types::PhpVersion::new(major, minor));
            let uri = Uri::parse("file:///closed-doc-eol.php").unwrap();
            sut.did_open(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: uri.clone(),
                    language_id: "php".into(),
                    version: 1,
                    text: f[1].clone(),
                },
            })
            .await;
            for step in 0..2 {
                if step == 1 {
                    sut.did_change(DidChangeTextDocumentParams {
                        text_document: VersionedTextDocumentIdentifier {
                            text_document_identifier: TextDocumentIdentifier { uri: uri.clone() },
                            version: 2,
                        },
                        content_changes: vec![
                            TextDocumentContentChangeEvent::TextDocumentContentChangeWholeDocument(
                                TextDocumentContentChangeWholeDocument { text: f[1].clone() },
                            ),
                        ],
                    })
                    .await;
                }
                let actual = sut
                    .on_type_formatting(DocumentOnTypeFormattingParams {
                        text_document: TextDocumentIdentifier { uri: uri.clone() },
                        position: Position::new(f[2].parse().unwrap(), f[3].parse().unwrap()),
                        ch: "\n".into(),
                        options: FormattingOptions {
                            tab_size: 4,
                            insert_spaces: true,
                            ..Default::default()
                        },
                    })
                    .await
                    .unwrap();
                assert_eq!(actual, None, "{} target={major}.{minor} step={step}", f[0]);
                assert_eq!(f[1], f[4], "independent original document invariant");
                requests += 1;
            }
        }
    }
    assert_eq!(requests, 384);
}
