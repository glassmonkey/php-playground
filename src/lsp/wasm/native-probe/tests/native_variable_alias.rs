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
struct Contract<'a> {
    label: &'a str,
    identity: &'a str,
    kind: CompletionItemKind,
    range: Range,
    text: &'a str,
    document: &'a str,
}
impl<'a> Contract<'a> {
    fn from_fields(f: &'a [String]) -> Self {
        let line = f[3].parse().unwrap();
        Self {
            label: &f[5],
            identity: &f[6],
            kind: if f[7] == "6" {
                CompletionItemKind::Variable
            } else {
                CompletionItemKind::Class
            },
            range: Range {
                start: Position {
                    line,
                    character: f[8].parse().unwrap(),
                },
                end: Position {
                    line,
                    character: f[9].parse().unwrap(),
                },
            },
            text: &f[10],
            document: &f[11],
        }
    }
}
fn validate_item(
    source: &str,
    item: &CompletionItem,
    expected: &Contract<'_>,
) -> Result<String, String> {
    let class = expected.kind == CompletionItemKind::Class;
    let snippet = expected.text.contains("$0");
    let format = snippet.then_some(InsertTextFormat::Snippet);
    let filter = if expected.text.starts_with('\\') {
        expected.text
    } else {
        expected.label
    };
    if item.label != expected.label
        || item.kind != Some(expected.kind)
        || item.filter_text.as_deref() != Some(filter)
        || item.insert_text_format != format
        || item.insert_text.as_deref() != class.then_some(expected.text)
        || item.insert_text_mode.is_some()
        || item.text_edit_text.is_some()
        || item.command.is_some()
    {
        return Err(format!(
            "independent label/kind/filter/format/insertion contract: {item:?}"
        ));
    }
    if class {
        for (key, value) in [("c", ""), ("m", expected.identity), ("k", "class")] {
            if item
                .data
                .as_ref()
                .and_then(|data| data.get(key))
                .and_then(|v| v.as_str())
                != Some(value)
            {
                return Err(format!("independent FQN/kind {key}={value}: {item:?}"));
            }
        }
        if item.detail.as_deref() != Some(expected.identity) {
            return Err(format!("canonical detail: {item:?}"));
        }
    } else if item.data.is_some() || item.detail.as_deref() != Some("variable") {
        return Err(format!("variable identity: {item:?}"));
    }
    let Some(CompletionItemTextEdit::TextEdit(edit)) = &item.text_edit else {
        return Err(format!("plain explicit primary required: {item:?}"));
    };
    if edit.range != expected.range || edit.new_text != expected.text {
        return Err(format!("independent primary range/newText: {edit:?}"));
    }
    let additional = item.additional_text_edits.as_deref().unwrap_or(&[]);
    if !additional.is_empty() {
        return Err(format!(
            "independent additional edits must be empty: {additional:?}"
        ));
    }
    let document = apply(source, edit, additional, snippet);
    if document != expected.document {
        return Err(format!("independent complete document: {document:?}"));
    }
    Ok(document)
}
fn validate_pair(
    source: &str,
    initial: &CompletionItem,
    resolved: &CompletionItem,
    expected: &Contract<'_>,
) -> Result<(String, String), String> {
    Ok((
        validate_item(source, initial, expected).map_err(|e| format!("initial: {e}"))?,
        validate_item(source, resolved, expected).map_err(|e| format!("resolved: {e}"))?,
    ))
}
fn fields(row: &str) -> Vec<String> {
    row.split('\t')
        .map(|s| s.replace("\\n", "\n").replace("\\r", "\r"))
        .collect()
}
async fn open(backend: &Backend, uri: &Uri, f: &[String]) {
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
                    TextDocumentContentChangeWholeDocument { text: f[2].clone() },
                ),
            ],
        })
        .await;
}
async fn complete(backend: &Backend, uri: &Uri, position: Position) -> Vec<CompletionItem> {
    match backend
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
        Some(CompletionResponse::CompletionItemList(items)) => items,
        Some(CompletionResponse::CompletionList(list)) => list.items,
        None => vec![],
    }
}
#[tokio::test]
async fn variable_suffix_and_class_alias_edits_preserve_the_independent_full_document() {
    let rows = include_str!("fixtures/variable-alias.tsv")
        .lines()
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 36);
    assert_eq!(
        rows.iter()
            .map(|row| row.split('\t').next().unwrap())
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        36
    );
    let mut failures = Vec::new();
    let mut checked = 0;
    for row in rows {
        let f = fields(row);
        assert_eq!(f.len(), 15);
        let expected = Contract::from_fields(&f);
        let version = f[13]
            .split('.')
            .map(|v| v.parse().unwrap())
            .collect::<Vec<u8>>();
        let backend = Backend::new_headless();
        backend.set_php_version(PhpVersion::new(version[0], version[1]));
        let uri = Uri::parse("inmemory://model/1").unwrap();
        open(&backend, &uri, &f).await;
        let position = Position {
            line: f[3].parse().unwrap(),
            character: f[4].parse().unwrap(),
        };
        for warm in [false, true] {
            let items = complete(&backend, &uri, position).await;
            let item = items
                .iter()
                .find(|item| item.label == expected.label && item.kind == Some(expected.kind));
            checked += 1;
            if f[14] == "0" {
                if item.is_some() {
                    failures.push(format!("{} forbidden item warm={warm}: {item:?}", f[0]));
                }
                continue;
            }
            let Some(item) = item else {
                failures.push(format!(
                    "{} missing selected candidate warm={warm}: {items:?}",
                    f[0]
                ));
                continue;
            };
            let resolved = backend.completion_resolve(item.clone()).await.unwrap();
            if let Err(error) = validate_pair(&f[2], item, &resolved, &expected) {
                failures.push(format!(
                    "{} warm={warm}: {error}; initial={item:?}; resolved={resolved:?}",
                    f[0]
                ));
            }
        }
    }
    assert_eq!(checked, 72);
    assert!(
        failures.is_empty(),
        "{} failures: {failures:#?}",
        failures.len()
    );
    eprintln!(
        "VARIABLE_ALIAS_ORACLE {checked} original/resolved public full-edit contracts passed"
    );
}
#[tokio::test]
async fn resolved_only_edit_mutations_are_rejected_with_unchanged_identity() {
    let row = include_str!("fixtures/variable-alias.tsv")
        .lines()
        .find(|row| row.starts_with("attribute-alias-ASCII-control\t"))
        .unwrap();
    let f = fields(row);
    let expected = Contract::from_fields(&f);
    let backend = Backend::new_headless();
    backend.set_php_version(PhpVersion::new(8, 0));
    let uri = Uri::parse("inmemory://model/1").unwrap();
    open(&backend, &uri, &f).await;
    let items = complete(
        &backend,
        &uri,
        Position {
            line: f[3].parse().unwrap(),
            character: f[4].parse().unwrap(),
        },
    )
    .await;
    let initial = items
        .into_iter()
        .find(|item| item.label == expected.label)
        .unwrap();
    let resolved = backend.completion_resolve(initial.clone()).await.unwrap();
    assert!(validate_pair(&f[2], &initial, &resolved, &expected).is_ok());
    let mut new_text = resolved.clone();
    if let Some(CompletionItemTextEdit::TextEdit(edit)) = &mut new_text.text_edit {
        edit.new_text = "Wrong".into();
    } else {
        panic!("plain primary");
    }
    let mut range = resolved.clone();
    if let Some(CompletionItemTextEdit::TextEdit(edit)) = &mut range.text_edit {
        edit.range.end.character -= 1;
    }
    let mut additional = resolved.clone();
    additional.additional_text_edits = Some(vec![TextEdit {
        range: Range::new(Position::new(0, 0), Position::new(0, 0)),
        new_text: "/* unexpected */".into(),
    }]);
    for (name, mutant) in [
        ("newText", new_text),
        ("range", range),
        ("additional", additional),
    ] {
        assert_eq!(mutant.data, resolved.data);
        assert_eq!(mutant.label, resolved.label);
        assert!(
            validate_pair(&f[2], &initial, &mutant, &expected).is_err(),
            "resolved-only {name} mutation accepted"
        );
    }
    assert!(validate_pair(&f[2], &initial, &resolved, &expected).is_ok());
    eprintln!("RESOLVED_ORACLE_NEGATIVES 3 rejected with unchanged selected identity");
}
