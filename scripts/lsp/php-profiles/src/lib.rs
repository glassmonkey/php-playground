use mago_allocator::LocalArena;
use mago_database::file::FileId;
use mago_span::{HasSpan, Span};
use mago_syntax::cst::{
    ArrayElement, AttributeList, Expression, FunctionLikeParameterList, Literal, Node,
    PartialArgument, Program, Statement, TriviaKind, UseItems,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttributeFact {
    pub name: String,
    pub args: BTreeMap<String, String>,
    pub positionals: Vec<String>,
    pub version_types: BTreeMap<String, String>,
    pub default_type: Option<String>,
    pub raw: String,
    pub parse_issues: Vec<String>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParameterFact {
    pub name: String,
    pub hint: Option<String>,
    pub default: Option<String>,
    pub attributes: Vec<AttributeFact>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeclarationFact {
    pub kind: String,
    pub name: String,
    pub doc: Option<String>,
    pub doc_span: Option<Span>,
    pub doc_parse_errors: usize,
    pub attributes: Vec<AttributeFact>,
    pub params: Vec<ParameterFact>,
    pub return_hint: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceFacts {
    pub imports: BTreeMap<String, String>,
    pub declarations: Vec<DeclarationFact>,
    pub parse_errors: usize,
}

fn slice(source: &[u8], span: Span) -> String {
    String::from_utf8_lossy(&source[span.start.offset as usize..span.end.offset as usize])
        .to_string()
}
fn literal_string(expression: &Expression<'_>) -> Option<String> {
    match expression {
        Expression::Literal(Literal::String(value)) => value
            .value
            .map(|bytes| String::from_utf8_lossy(bytes).into_owned()),
        _ => None,
    }
}
fn attrs<'a>(
    lists: impl Iterator<Item = &'a mago_syntax::cst::AttributeList<'a>>,
    source: &[u8],
) -> Vec<AttributeFact> {
    lists
        .flat_map(|list| list.attributes.iter())
        .map(|a| {
            let mut args = BTreeMap::new();
            let mut positionals = Vec::new();
            let mut version_types = BTreeMap::new();
            let mut default_type = None;
            let mut parse_issues = Vec::new();
            if let Some(list) = &a.argument_list {
                for arg in list.arguments.iter() {
                    match arg {
                        PartialArgument::Named(named) => {
                            let name = String::from_utf8_lossy(named.name.value).to_string();
                            args.insert(
                                name.clone(),
                                literal_string(named.value)
                                    .unwrap_or_else(|| slice(source, named.value.span())),
                            );
                            if name == "default" {
                                default_type = literal_string(named.value);
                                if default_type.is_none() {
                                    parse_issues.push("default is not a string literal".to_string());
                                }
                            }
                        }
                        PartialArgument::Positional(positional) => {
                            positionals.push(
                                literal_string(positional.value)
                                    .unwrap_or_else(|| slice(source, positional.value.span())),
                            );
                            if let Expression::Array(array) = positional.value {
                                for element in array.elements.iter() {
                                    if let ArrayElement::KeyValue(pair) = element {
                                        if let (Some(key), Some(value)) =
                                            (literal_string(pair.key), literal_string(pair.value))
                                        {
                                            if version_types.insert(key, value).is_some() {
                                                parse_issues.push("duplicate language-level version key".to_string());
                                            }
                                        } else {
                                            parse_issues.push("language-level map contains a non-string key or value".to_string());
                                        }
                                    } else {
                                        parse_issues.push("language-level map contains a non key/value entry".to_string());
                                    }
                                }
                            } else {
                                parse_issues.push("language-level versions are not an array literal".to_string());
                            }
                        }
                        _ => {}
                    }
                }
            }
            AttributeFact {
                name: String::from_utf8_lossy(a.name.value()).to_string(),
                args,
                positionals,
                version_types,
                default_type,
                raw: slice(source, a.span()),
                parse_issues,
            }
        })
        .collect()
}
fn parameter<'a>(p: &mago_syntax::cst::FunctionLikeParameter<'a>, source: &[u8]) -> ParameterFact {
    ParameterFact {
        name: String::from_utf8_lossy(p.variable.name).to_string(),
        hint: p.hint.as_ref().map(|h| slice(source, h.span())),
        default: p.default_value.as_ref().map(|d| slice(source, d.span())),
        attributes: attrs(p.attribute_lists.iter(), source),
    }
}
fn doc_for(span: Span, program: &Program<'_>, source: &[u8]) -> Option<(String, Span)> {
    let start = span.start.offset as usize;
    program
        .trivia
        .iter()
        .filter(|t| t.kind == TriviaKind::DocBlockComment && (t.span.end.offset as usize) <= start)
        .filter(|t| {
            source[t.span.end.offset as usize..start]
                .iter()
                .all(u8::is_ascii_whitespace)
        })
        .max_by_key(|t| t.span.end.offset)
        .map(|t| (slice(source, t.span), t.span))
}
fn collect_imports(program: &Program<'_>, source: &[u8]) -> BTreeMap<String, String> {
    fn add_one(
        item: &mago_syntax::cst::UseItem<'_>,
        source: &[u8],
        out: &mut BTreeMap<String, String>,
    ) {
        let full = slice(source, item.name.span())
            .trim_start_matches('\\')
            .to_string();
        let alias = item
            .alias
            .as_ref()
            .map(|a| String::from_utf8_lossy(a.identifier.value).to_string())
            .unwrap_or_else(|| full.rsplit('\\').next().unwrap_or(&full).to_string());
        out.insert(alias.to_ascii_lowercase(), full);
    }
    let mut out = BTreeMap::new();
    for statement in program.statements.iter() {
        if let Statement::Use(use_) = statement {
            match &use_.items {
                UseItems::Sequence(items) => {
                    for item in items.items.iter() {
                        add_one(item, source, &mut out);
                    }
                }
                UseItems::TypedSequence(items) => {
                    for item in items.items.iter() {
                        add_one(item, source, &mut out);
                    }
                }
                _ => {} // grouped/mixed imports are deliberately outside this proof.
            }
        }
    }
    out
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileTransform {
    pub bytes: Vec<u8>,
    pub changed_declarations: usize,
    pub return_type_declarations: usize,
    pub availability_filtered_declarations: usize,
    pub diagnostics: Vec<String>,
}

#[derive(Debug)]
struct Edit {
    start: usize,
    end: usize,
    replacement: Vec<u8>,
    kind: &'static str,
    owner: String,
}

fn coalesce_identical_edits(edits: &mut Vec<Edit>) {
    edits.sort_by_key(|edit| (edit.start, edit.end));
    edits.dedup_by(|current, previous| {
        current.start == previous.start
            && current.end == previous.end
            && current.replacement == previous.replacement
    });
}

fn line_span(source: &[u8], start: usize, end: usize) -> Result<(usize, usize), String> {
    let line_start = source[..start]
        .iter()
        .rposition(|byte| *byte == b'\n')
        .map_or(0, |index| index + 1);
    let line_end = source[end..]
        .iter()
        .position(|byte| *byte == b'\n')
        .map_or(source.len(), |index| end + index + 1);
    if !source[line_start..start]
        .iter()
        .all(u8::is_ascii_whitespace)
        || !source[end..line_end]
            .iter()
            .all(|byte| byte.is_ascii_whitespace())
    {
        return Err("metadata edit is not alone on its source line".to_string());
    }
    Ok((line_start, line_end))
}

fn collect_return_edits<'a>(
    lists: impl Iterator<Item = &'a AttributeList<'a>>,
    return_hint: Option<Span>,
    declaration_span: Span,
    declaration_name: &str,
    program: &Program<'_>,
    source: &[u8],
    arena: &LocalArena,
    imports: &BTreeMap<String, String>,
    target: PhpVersion,
    edits: &mut Vec<Edit>,
    diagnostics: &mut Vec<String>,
    changed_declarations: &mut usize,
) {
    let mut seen_type_override = false;
    for list in lists {
        let mut selected_attr = None;
        for attribute in list.attributes.iter() {
            let fact = attrs(std::iter::once(list), source)
                .into_iter()
                .find(|fact| fact.raw == slice(source, attribute.span()))
                .unwrap_or_else(|| AttributeFact {
                    name: String::from_utf8_lossy(attribute.name.value()).into_owned(),
                    args: BTreeMap::new(),
                    positionals: Vec::new(),
                    version_types: BTreeMap::new(),
                    default_type: None,
                    raw: slice(source, attribute.span()),
                    parse_issues: vec!["could not associate parsed attribute facts".to_string()],
                });
            match normalize_attribute(&fact, imports) {
                Ok(Some(NormalizedAttribute::LanguageLevelTypes { .. })) => {
                    if selected_attr.is_some() || seen_type_override {
                        diagnostics.push(format!("{declaration_name}: multiple language-level return overrides"));
                        selected_attr = None;
                        break;
                    }
                    selected_attr = Some(fact);
                }
                Ok(Some(NormalizedAttribute::Availability { .. })) => diagnostics.push(format!(
                    "{declaration_name}: declaration availability is recognized but not transformed in this generator slice"
                )),
                Ok(None) => {}
                Err(error) => diagnostics.push(format!("{declaration_name}: {error}")),
            }
        }
        let Some(fact) = selected_attr else { continue };
        seen_type_override = true;
        if list.attributes.len() != 1 {
            diagnostics.push(format!(
                "{declaration_name}: language-level attribute shares a grouped attribute list"
            ));
            continue;
        }
        let normalized = match normalize_attribute(&fact, imports) {
            Ok(Some(normalized @ NormalizedAttribute::LanguageLevelTypes { .. })) => normalized,
            Ok(_) => continue,
            Err(error) => {
                diagnostics.push(format!("{declaration_name}: {error}"));
                continue;
            }
        };
        let Some(selected_type) = select_language_type(&normalized, target) else {
            diagnostics.push(format!(
                "{declaration_name}: selected return type is absent for PHP {}.{}",
                target.major, target.minor
            ));
            continue;
        };
        let Some((_, doc_span)) = doc_for(declaration_span, program, source) else {
            diagnostics.push(format!(
                "{declaration_name}: language-level return type has no attached PhpDoc"
            ));
            continue;
        };
        let doc_start = doc_span.start.offset as usize;
        let doc_end = doc_span.end.offset as usize;
        let doc_bytes = &source[doc_start..doc_end];
        let parsed_doc =
            mago_phpdoc_syntax::parser::PHPDocParser::parse_with_span(arena, doc_bytes, doc_span);
        if !parsed_doc.errors.is_empty() {
            diagnostics.push(format!(
                "{declaration_name}: attached PhpDoc has {} parse errors",
                parsed_doc.errors.len()
            ));
            continue;
        }
        let return_tags: Vec<_> = parsed_doc
            .tags()
            .filter(|tag| matches!(tag.value, mago_phpdoc_syntax::cst::TagValue::Return(_)))
            .collect();
        if return_tags.len() != 1 {
            diagnostics.push(format!(
                "{declaration_name}: expected exactly one parseable @return tag, found {}",
                return_tags.len()
            ));
            continue;
        }
        let tag_type = match return_tags[0].value {
            mago_phpdoc_syntax::cst::TagValue::Return(value) => value.r#type.span(),
            _ => unreachable!(),
        };
        let mut declaration_edits = vec![Edit {
            start: tag_type.start.offset as usize,
            end: tag_type.end.offset as usize,
            replacement: selected_type.as_bytes().to_vec(),
            kind: "return-doc-type",
            owner: declaration_name.to_string(),
        }];
        if let Some(hint) = return_hint {
            declaration_edits.push(Edit {
                start: hint.start.offset as usize,
                end: hint.end.offset as usize,
                replacement: selected_type.as_bytes().to_vec(),
                kind: "native-return-type",
                owner: declaration_name.to_string(),
            });
        }
        match line_span(
            source,
            list.span().start.offset as usize,
            list.span().end.offset as usize,
        ) {
            Ok((start, end)) => declaration_edits.push(Edit {
                start,
                end,
                replacement: Vec::new(),
                kind: "return-language-attribute",
                owner: declaration_name.to_string(),
            }),
            Err(error) => {
                diagnostics.push(format!("{declaration_name}: {error}"));
                continue;
            }
        }
        *changed_declarations += 1;
        edits.extend(declaration_edits);
    }
}

fn collect_parameter_availability_edits<'a>(
    parameters: &FunctionLikeParameterList<'a>,
    declaration_span: Span,
    declaration_name: &str,
    program: &Program<'_>,
    source: &[u8],
    arena: &LocalArena,
    imports: &BTreeMap<String, String>,
    target: PhpVersion,
    edits: &mut Vec<Edit>,
    diagnostics: &mut Vec<String>,
    changed_declarations: &mut usize,
) {
    #[derive(Clone)]
    struct ParamState {
        available: bool,
        attribute_spans: Vec<(usize, usize)>,
    }
    let mut states = Vec::with_capacity(parameters.parameters.nodes.len());
    let mut unsupported = false;
    for parameter in parameters.parameters.nodes.iter() {
        let mut availability = None;
        let mut spans = Vec::new();
        for list in parameter.attribute_lists.iter() {
            let mut list_has_supported_availability = false;
            for attribute in list.attributes.iter() {
                let raw = slice(source, attribute.span());
                let fact = attrs(std::iter::once(list), source)
                    .into_iter()
                    .find(|fact| fact.raw == raw)
                    .unwrap_or_else(|| AttributeFact {
                        name: String::from_utf8_lossy(attribute.name.value()).into_owned(),
                        args: BTreeMap::new(),
                        positionals: Vec::new(),
                        version_types: BTreeMap::new(),
                        default_type: None,
                        raw: raw.clone(),
                        parse_issues: vec![
                            "could not associate parsed attribute facts".to_string(),
                        ],
                    });
                match normalize_attribute(&fact, imports) {
                    Ok(Some(NormalizedAttribute::Availability { from, to })) => {
                        if availability.is_some() {
                            diagnostics.push(format!(
                                "{declaration_name} {}: multiple availability attributes",
                                String::from_utf8_lossy(parameter.variable.name)
                            ));
                            unsupported = true;
                        }
                        availability = Some((from, to));
                        list_has_supported_availability = true;
                    }
                    Ok(Some(NormalizedAttribute::LanguageLevelTypes { .. })) => {
                        diagnostics.push(format!("{declaration_name} {}: parameter LanguageLevelTypeAware is not transformed by this slice", String::from_utf8_lossy(parameter.variable.name)));
                        unsupported = true;
                    }
                    Ok(None) => {}
                    Err(error) => {
                        diagnostics.push(format!(
                            "{declaration_name} {}: {error}",
                            String::from_utf8_lossy(parameter.variable.name)
                        ));
                        unsupported = true;
                    }
                }
            }
            if list_has_supported_availability {
                if list.attributes.len() == 1 {
                    spans.push((
                        list.span().start.offset as usize,
                        list.span().end.offset as usize,
                    ));
                } else {
                    diagnostics.push(format!("{declaration_name}: availability attribute shares a grouped parameter attribute list"));
                    unsupported = true;
                }
            }
        }
        let available = availability.is_none_or(|(from, to)| {
            from.is_none_or(|version| target >= version)
                && to.is_none_or(|version| target <= version)
        });
        states.push(ParamState {
            available,
            attribute_spans: spans,
        });
    }
    if unsupported {
        return;
    }
    let mut by_name = BTreeMap::<Vec<u8>, Vec<usize>>::new();
    for (index, parameter) in parameters.parameters.nodes.iter().enumerate() {
        by_name
            .entry(parameter.variable.name.to_vec())
            .or_default()
            .push(index);
    }
    for (name, indexes) in &by_name {
        let visible = indexes
            .iter()
            .filter(|index| states[**index].available)
            .count();
        if indexes.len() > 1 && visible > 1 {
            diagnostics.push(format!(
                "{declaration_name} {}: multiple same-name parameter variants apply at PHP {}.{}",
                String::from_utf8_lossy(name),
                target.major,
                target.minor
            ));
            return;
        }
    }
    let removed: Vec<usize> = states
        .iter()
        .enumerate()
        .filter_map(|(index, state)| (!state.available).then_some(index))
        .collect();
    let mut declaration_edits = Vec::new();
    if !removed.is_empty() {
        let Some((_, doc_span)) = doc_for(declaration_span, program, source) else {
            diagnostics.push(format!(
                "{declaration_name}: unavailable parameters have no attached PhpDoc"
            ));
            return;
        };
        let doc_start = doc_span.start.offset as usize;
        let doc_end = doc_span.end.offset as usize;
        let parsed_doc = mago_phpdoc_syntax::parser::PHPDocParser::parse_with_span(
            arena,
            &source[doc_start..doc_end],
            doc_span,
        );
        if !parsed_doc.errors.is_empty() {
            diagnostics.push(format!(
                "{declaration_name}: attached PhpDoc has {} parse errors; parameter filter skipped",
                parsed_doc.errors.len()
            ));
            return;
        }
        let retained_names: BTreeSet<Vec<u8>> = parameters
            .parameters
            .nodes
            .iter()
            .enumerate()
            .filter(|(index, _)| states[*index].available)
            .map(|(_, parameter)| parameter.variable.name.to_vec())
            .collect();
        for index in &removed {
            let parameter = &parameters.parameters.nodes[*index];
            let name = parameter
                .variable
                .name
                .strip_prefix(b"$")
                .unwrap_or(parameter.variable.name);
            if retained_names.contains(parameter.variable.name) {
                continue;
            }
            let tags: Vec<_> = parsed_doc
                .tags()
                .filter(|tag| match tag.value {
                    mago_phpdoc_syntax::cst::TagValue::Param(value) => {
                        value.parameter.is_some_and(|value| {
                            value.value.strip_prefix(b"$").unwrap_or(value.value) == name
                        })
                    }
                    mago_phpdoc_syntax::cst::TagValue::TypelessParam(value) => {
                        value
                            .parameter
                            .value
                            .strip_prefix(b"$")
                            .unwrap_or(value.parameter.value)
                            == name
                    }
                    _ => false,
                })
                .collect();
            if tags.len() != 1 {
                diagnostics.push(format!("{declaration_name} {}: expected exactly one matching @param tag, found {}; parameter filter skipped", String::from_utf8_lossy(parameter.variable.name), tags.len()));
                return;
            }
            let span = tags[0].span();
            declaration_edits.push(Edit {
                start: span.start.offset as usize,
                end: span.end.offset as usize,
                replacement: Vec::new(),
                kind: "parameter-phpdoc",
                owner: declaration_name.to_string(),
            });
        }
        let mut index = 0;
        while index < states.len() {
            if states[index].available {
                index += 1;
                continue;
            }
            let run_start = index;
            while index + 1 < states.len() && !states[index + 1].available {
                index += 1;
            }
            let run_end = index;
            let start = if run_start > 0 {
                parameters.parameters.tokens[run_start - 1].start.offset as usize
            } else {
                parameters.parameters.nodes[run_start].span().start.offset as usize
            };
            let end = if run_end + 1 < states.len() {
                parameters.parameters.tokens[run_end].start.offset as usize
                    + parameters.parameters.tokens[run_end].value.len()
            } else {
                parameters.parameters.nodes[run_end].span().end.offset as usize
            };
            declaration_edits.push(Edit {
                start,
                end,
                replacement: Vec::new(),
                kind: "parameter-signature",
                owner: declaration_name.to_string(),
            });
            index += 1;
        }
    }
    for state in &states {
        if state.available {
            for (start, end) in &state.attribute_spans {
                declaration_edits.push(Edit {
                    start: *start,
                    end: *end,
                    replacement: Vec::new(),
                    kind: "parameter-availability-attribute",
                    owner: declaration_name.to_string(),
                });
            }
        }
    }
    if !declaration_edits.is_empty() {
        *changed_declarations += 1;
        edits.extend(declaration_edits);
    }
}

/// Apply the supported function/method return-type metadata to a whole file.
/// Every edit is CST/PhpDoc-span based; unresolved or unsupported cases are
/// returned as diagnostics and remain byte-for-byte unchanged.
pub fn transform_file_returns(path: &Path, target: PhpVersion) -> Result<FileTransform, String> {
    let source = fs::read(path).map_err(|error| format!("read {}: {error}", path.display()))?;
    let arena = LocalArena::new();
    let file_id = FileId::new(path.as_os_str().as_encoded_bytes());
    let program = mago_syntax::parser::parse_file_content(&arena, file_id, &source);
    if program.has_errors() {
        return Err(format!(
            "{}: {} Mago PHP parse errors",
            path.display(),
            program.errors.len()
        ));
    }
    let imports = collect_imports(program, &source);
    fn visit<'a, 'b>(
        node: Node<'a, 'b>,
        program: &Program<'b>,
        source: &[u8],
        arena: &LocalArena,
        imports: &BTreeMap<String, String>,
        target: PhpVersion,
        edits: &mut Vec<Edit>,
        diagnostics: &mut Vec<String>,
        changed_declarations: &mut usize,
        return_type_declarations: &mut usize,
        availability_filtered_declarations: &mut usize,
    ) {
        match node {
            Node::Function(function) => {
                let name = format!("function {}", String::from_utf8_lossy(function.name.value));
                let mut return_changes = 0;
                let mut availability_changes = 0;
                collect_return_edits(
                    function.attribute_lists.iter(),
                    function
                        .return_type_hint
                        .as_ref()
                        .map(|hint| hint.hint.span()),
                    function.span(),
                    &name,
                    program,
                    source,
                    arena,
                    imports,
                    target,
                    edits,
                    diagnostics,
                    &mut return_changes,
                );
                collect_parameter_availability_edits(
                    &function.parameter_list,
                    function.span(),
                    &name,
                    program,
                    source,
                    arena,
                    imports,
                    target,
                    edits,
                    diagnostics,
                    &mut availability_changes,
                );
                *return_type_declarations += return_changes;
                *availability_filtered_declarations += availability_changes;
                *changed_declarations += usize::from(return_changes + availability_changes > 0);
            }
            Node::Method(method) => {
                let name = format!("method {}", String::from_utf8_lossy(method.name.value));
                let mut return_changes = 0;
                let mut availability_changes = 0;
                collect_return_edits(
                    method.attribute_lists.iter(),
                    method
                        .return_type_hint
                        .as_ref()
                        .map(|hint| hint.hint.span()),
                    method.span(),
                    &name,
                    program,
                    source,
                    arena,
                    imports,
                    target,
                    edits,
                    diagnostics,
                    &mut return_changes,
                );
                collect_parameter_availability_edits(
                    &method.parameter_list,
                    method.span(),
                    &name,
                    program,
                    source,
                    arena,
                    imports,
                    target,
                    edits,
                    diagnostics,
                    &mut availability_changes,
                );
                *return_type_declarations += return_changes;
                *availability_filtered_declarations += availability_changes;
                *changed_declarations += usize::from(return_changes + availability_changes > 0);
            }
            _ => {}
        }
        node.visit_children(|child| {
            visit(
                child,
                program,
                source,
                arena,
                imports,
                target,
                edits,
                diagnostics,
                changed_declarations,
                return_type_declarations,
                availability_filtered_declarations,
            )
        });
    }
    let mut edits = Vec::new();
    let mut diagnostics = Vec::new();
    let mut changed_declarations = 0;
    let mut return_type_declarations = 0;
    let mut availability_filtered_declarations = 0;
    visit(
        Node::Program(program),
        program,
        &source,
        &arena,
        &imports,
        target,
        &mut edits,
        &mut diagnostics,
        &mut changed_declarations,
        &mut return_type_declarations,
        &mut availability_filtered_declarations,
    );
    coalesce_identical_edits(&mut edits);
    for pair in edits.windows(2) {
        if pair[0].end > pair[1].start {
            return Ok(FileTransform {
                bytes: source,
                changed_declarations: 0,
                return_type_declarations: 0,
                availability_filtered_declarations: 0,
                diagnostics: vec![format!(
                    "{}: overlapping edits: {} for {} at bytes {}..{} overlaps {} for {} at bytes {}..{}; whole file left unchanged",
                    path.display(),
                    pair[0].kind,
                    pair[0].owner,
                    pair[0].start,
                    pair[0].end,
                    pair[1].kind,
                    pair[1].owner,
                    pair[1].start,
                    pair[1].end,
                )],
            });
        }
    }
    let mut output = source.clone();
    for edit in edits.into_iter().rev() {
        output.splice(edit.start..edit.end, edit.replacement);
    }
    Ok(FileTransform {
        bytes: output,
        changed_declarations,
        return_type_declarations,
        availability_filtered_declarations,
        diagnostics,
    })
}

#[cfg(test)]
mod edit_tests {
    use super::{Edit, coalesce_identical_edits};

    #[test]
    fn coalesces_only_identical_same_span_edits() {
        let mut edits = vec![
            Edit {
                start: 4,
                end: 9,
                replacement: Vec::new(),
                kind: "parameter-phpdoc",
                owner: "method one".into(),
            },
            Edit {
                start: 4,
                end: 9,
                replacement: Vec::new(),
                kind: "parameter-phpdoc",
                owner: "method one".into(),
            },
            Edit {
                start: 4,
                end: 9,
                replacement: b"new".to_vec(),
                kind: "other",
                owner: "method one".into(),
            },
        ];
        coalesce_identical_edits(&mut edits);
        assert_eq!(edits.len(), 2);
        assert_eq!(edits[0].replacement, Vec::<u8>::new());
        assert_eq!(edits[1].replacement, b"new");
    }
}
fn visit<'ast, 'arena>(
    node: Node<'ast, 'arena>,
    program: &Program<'arena>,
    source: &[u8],
    arena: &LocalArena,
    file_id: FileId,
    out: &mut Vec<DeclarationFact>,
) {
    match node {
        Node::Function(f) => out.push(DeclarationFact {
            kind: "function".into(),
            name: String::from_utf8_lossy(f.name.value).into_owned(),
            doc: doc_for(f.span(), program, source)
                .as_ref()
                .map(|(d, _)| d.clone()),
            doc_span: doc_for(f.span(), program, source).map(|(_, s)| s),
            doc_parse_errors: 0,
            attributes: attrs(f.attribute_lists.iter(), source),
            params: f
                .parameter_list
                .parameters
                .iter()
                .map(|p| parameter(p, source))
                .collect(),
            return_hint: f.return_type_hint.as_ref().map(|h| slice(source, h.span())),
        }),
        Node::Method(m) => out.push(DeclarationFact {
            kind: "method".into(),
            name: String::from_utf8_lossy(m.name.value).into_owned(),
            doc: doc_for(m.span(), program, source)
                .as_ref()
                .map(|(d, _)| d.clone()),
            doc_span: doc_for(m.span(), program, source).map(|(_, s)| s),
            doc_parse_errors: 0,
            attributes: attrs(m.attribute_lists.iter(), source),
            params: m
                .parameter_list
                .parameters
                .iter()
                .map(|p| parameter(p, source))
                .collect(),
            return_hint: m.return_type_hint.as_ref().map(|h| slice(source, h.span())),
        }),
        _ => {}
    }
    node.visit_children(|child| visit(child, program, source, arena, file_id, out));
}
pub fn analyze(path: &Path) -> Result<SourceFacts, String> {
    let source = fs::read(path).map_err(|e| e.to_string())?;
    let arena = LocalArena::new();
    let file_id = FileId::new(path.as_os_str().as_encoded_bytes());
    let program = mago_syntax::parser::parse_file_content(&arena, file_id, &source);
    let mut declarations = Vec::new();
    visit(
        Node::Program(program),
        program,
        &source,
        &arena,
        file_id,
        &mut declarations,
    );
    for decl in &mut declarations {
        if decl.doc.is_some() {
            let span = decl.doc_span.expect("doc span accompanies doc text");
            let parsed =
                mago_phpdoc_syntax::parser::PHPDocParser::parse_with_span(&arena, &source, span);
            decl.doc_parse_errors = parsed.errors.len();
        }
    }
    Ok(SourceFacts {
        imports: collect_imports(program, &source),
        declarations,
        parse_errors: program.errors.len(),
    })
}
pub fn resolve_attribute(name: &str, imports: &BTreeMap<String, String>) -> String {
    let raw = name.trim_start_matches('\\');
    if raw.contains('\\') {
        raw.to_string()
    } else {
        imports
            .get(&raw.to_ascii_lowercase())
            .cloned()
            .unwrap_or_else(|| raw.to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct PhpVersion {
    pub major: u8,
    pub minor: u8,
}

impl PhpVersion {
    pub fn parse(value: &str) -> Result<Self, String> {
        let value = value.trim().trim_matches(['\'', '"']);
        let Some((major, minor)) = value.split_once('.') else {
            return Err(format!(
                "invalid PHP version `{value}`; expected major.minor"
            ));
        };
        if minor.contains('.') || major.is_empty() || minor.is_empty() {
            return Err(format!(
                "invalid PHP version `{value}`; expected major.minor"
            ));
        }
        let major = major
            .parse::<u8>()
            .map_err(|_| format!("invalid PHP major version `{major}`"))?;
        let minor = minor
            .parse::<u8>()
            .map_err(|_| format!("invalid PHP minor version `{minor}`"))?;
        if !(5..=8).contains(&major) || minor > 99 {
            return Err(format!(
                "PHP version `{value}` is outside the supported major/minor range"
            ));
        }
        Ok(Self { major, minor })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NormalizedAttribute {
    Availability {
        from: Option<PhpVersion>,
        to: Option<PhpVersion>,
    },
    LanguageLevelTypes {
        versions: BTreeMap<PhpVersion, String>,
        default: Option<String>,
    },
}

/// Normalize metadata only when its spelling and arguments are understood.
/// Unknown PHP-version-looking attributes fail closed instead of falling back
/// to a guessed default.
pub fn normalize_attribute(
    attr: &AttributeFact,
    imports: &BTreeMap<String, String>,
) -> Result<Option<NormalizedAttribute>, String> {
    let resolved = resolve_attribute(&attr.name, imports);
    let canonical = resolved.rsplit('\\').next().unwrap_or(&resolved);
    if canonical == "PhpStormStubsElementAvailable" {
        let relevant_issues: Vec<_> = attr
            .parse_issues
            .iter()
            .filter(|issue| !issue.contains("language-level versions are not an array literal"))
            .collect();
        if !relevant_issues.is_empty() {
            return Err(format!(
                "{}: {}",
                attr.raw,
                relevant_issues
                    .iter()
                    .map(|issue| issue.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
        let allowed = ["from", "to"];
        if let Some(name) = attr
            .args
            .keys()
            .find(|name| !allowed.contains(&name.as_str()))
        {
            return Err(format!(
                "{}: unknown availability argument `{name}`",
                attr.raw
            ));
        }
        if attr.positionals.len() > 2 {
            return Err(format!(
                "{}: more than two positional availability bounds",
                attr.raw
            ));
        }
        if attr.args.contains_key("from") && !attr.positionals.is_empty()
            || attr.args.contains_key("to") && attr.positionals.len() > 1
        {
            return Err(format!(
                "{}: duplicate positional and named availability bound",
                attr.raw
            ));
        }
        let from = attr
            .args
            .get("from")
            .or_else(|| attr.positionals.first())
            .map(|v| PhpVersion::parse(v))
            .transpose()?;
        let to = attr
            .args
            .get("to")
            .or_else(|| attr.positionals.get(1))
            .map(|v| PhpVersion::parse(v))
            .transpose()?;
        if matches!((from, to), (Some(from), Some(to)) if from > to) {
            return Err(format!(
                "{}: availability lower bound exceeds upper bound",
                attr.raw
            ));
        }
        return Ok(Some(NormalizedAttribute::Availability { from, to }));
    }
    if canonical == "LanguageLevelTypeAware" {
        if !attr.parse_issues.is_empty() {
            return Err(format!("{}: {}", attr.raw, attr.parse_issues.join(", ")));
        }
        if attr.positionals.len() != 1 {
            return Err(format!(
                "{}: expected exactly one positional version map",
                attr.raw
            ));
        }
        if let Some(name) = attr.args.keys().find(|name| name != &"default") {
            return Err(format!(
                "{}: unknown language-level argument `{name}`",
                attr.raw
            ));
        }
        let mut versions = BTreeMap::new();
        for (version, ty) in &attr.version_types {
            let parsed = PhpVersion::parse(version)?;
            if versions.insert(parsed, ty.clone()).is_some() {
                return Err(format!(
                    "{}: duplicate normalized language-level version `{version}`",
                    attr.raw
                ));
            }
        }
        if versions.is_empty() {
            return Err(format!("{}: empty language-level version map", attr.raw));
        }
        return Ok(Some(NormalizedAttribute::LanguageLevelTypes {
            versions,
            default: attr.default_type.clone(),
        }));
    }
    if ["Available", "ElementAvailable", "PhpVersionAware"].contains(&canonical)
        || attr.name.ends_with("Available")
    {
        return Err(format!(
            "{}: version-related attribute is unresolved or unsupported ({resolved})",
            attr.raw
        ));
    }
    Ok(None)
}

pub fn select_language_type(
    normalized: &NormalizedAttribute,
    target: PhpVersion,
) -> Option<String> {
    let NormalizedAttribute::LanguageLevelTypes { versions, default } = normalized else {
        return None;
    };
    versions
        .iter()
        .filter(|(version, _)| **version <= target)
        .max_by_key(|(version, _)| **version)
        .map(|(_, ty)| ty.clone())
        .or_else(|| default.clone())
        .filter(|ty| !ty.is_empty())
}
pub fn version_available(
    attr: &AttributeFact,
    imports: &BTreeMap<String, String>,
    target: (u8, u8),
) -> Option<bool> {
    if !resolve_attribute(&attr.name, imports).ends_with("PhpStormStubsElementAvailable") {
        return None;
    }
    fn ver(s: &str) -> Option<(u8, u8)> {
        let s = s.trim().trim_matches(['\'', '"']);
        let (a, b) = s.split_once('.')?;
        Some((a.parse().ok()?, b.parse().ok()?))
    }
    let from = attr
        .args
        .get("from")
        .or_else(|| attr.positionals.first())
        .and_then(|s| ver(s));
    let to = attr
        .args
        .get("to")
        .or_else(|| attr.positionals.get(1))
        .and_then(|s| ver(s));
    Some(from.is_none_or(|v| target >= v) && to.is_none_or(|v| target <= v))
}
pub fn core_since_filter_applies(logical_path: &str) -> bool {
    logical_path.starts_with("Core/") || logical_path.starts_with("core/")
}
pub fn default_stubs_root() -> PathBuf {
    std::env::var_os("PHPANTOM_STUBS_ROOT")
        .map(PathBuf::from)
        .expect("set PHPANTOM_STUBS_ROOT to the verified pinned phpstorm-stubs source")
}

pub fn visible_parameters<'a>(
    decl: &'a DeclarationFact,
    imports: &BTreeMap<String, String>,
    target: (u8, u8),
) -> Vec<&'a ParameterFact> {
    decl.params
        .iter()
        .filter(|p| {
            p.attributes
                .iter()
                .all(|a| version_available(a, imports, target) != Some(false))
        })
        .collect()
}

pub fn language_level_type(
    attr: &AttributeFact,
    imports: &BTreeMap<String, String>,
    target: (u8, u8),
) -> Option<Option<String>> {
    if !resolve_attribute(&attr.name, imports).ends_with("LanguageLevelTypeAware") {
        return None;
    }
    let selected = attr
        .version_types
        .iter()
        .filter_map(|(v, ty)| {
            let (major, minor) = v.split_once('.')?;
            let version = (major.parse::<u8>().ok()?, minor.parse::<u8>().ok()?);
            (version <= target).then_some((version, ty.clone()))
        })
        .max_by_key(|(version, _)| *version)
        .map(|(_, ty)| ty)
        .or_else(|| attr.default_type.clone());
    Some(selected.filter(|ty| !ty.is_empty()))
}

/// Generate a bounded single-declaration slice for `strrchr` from the shared
/// pinned source. It deliberately omits all unmodified declarations.
pub fn render_strrchr_slice(path: &Path, target: (u8, u8)) -> Result<String, String> {
    use mago_phpdoc_syntax::cst::TagValue;
    use mago_syntax::cst::{Statement, TriviaKind};
    let source = fs::read(path).map_err(|e| e.to_string())?;
    let arena = LocalArena::new();
    let file_id = FileId::new(path.as_os_str().as_encoded_bytes());
    let program = mago_syntax::parser::parse_file_content(&arena, file_id, &source);
    if program.has_errors() {
        return Err(format!("Mago PHP parse errors: {}", program.errors.len()));
    }
    let function = program
        .statements
        .iter()
        .find_map(|statement| match statement {
            Statement::Function(function)
                if function.name.value.eq_ignore_ascii_case(b"strrchr") =>
            {
                Some(function)
            }
            _ => None,
        })
        .ok_or_else(|| "strrchr declaration not found".to_string())?;
    let decl_span = function.span();
    let decl_start = decl_span.start.offset as usize;
    let doc = program
        .trivia
        .iter()
        .filter(|t| {
            t.kind == TriviaKind::DocBlockComment && t.span.end.offset as usize <= decl_start
        })
        .filter(|t| {
            source[t.span.end.offset as usize..decl_start]
                .iter()
                .all(u8::is_ascii_whitespace)
        })
        .max_by_key(|t| t.span.end.offset)
        .ok_or_else(|| "associated docblock not found".to_string())?;
    let doc_start_offset = doc.span.start.offset as usize;
    let doc_end_offset = doc.span.end.offset as usize;
    let doc_bytes = &source[doc_start_offset..doc_end_offset];
    let parsed_doc =
        mago_phpdoc_syntax::parser::PHPDocParser::parse_with_span(&arena, doc_bytes, doc.span);
    if !parsed_doc.errors.is_empty() {
        return Err(format!("PhpDoc parse errors: {}", parsed_doc.errors.len()));
    }
    let mut edits: Vec<(usize, usize)> = Vec::new();
    if target < (8, 3) {
        let index = function
            .parameter_list
            .parameters
            .nodes
            .iter()
            .position(|p| p.variable.name == b"$before_needle")
            .ok_or_else(|| "versioned strrchr parameter not found".to_string())?;
        let parameter = &function.parameter_list.parameters.nodes[index];
        if index == 0 {
            return Err("versioned parameter has no preceding separator".into());
        }
        let comma = function
            .parameter_list
            .parameters
            .tokens
            .get(index - 1)
            .ok_or_else(|| "preceding parameter separator not found".to_string())?;
        let sig_start = comma.start.offset as usize;
        let sig_end = parameter.span().end.offset as usize;
        edits.push((sig_start, sig_end));
        let tag = parsed_doc
            .tags()
            .find(|tag| match tag.value {
                TagValue::Param(value) => value
                    .parameter
                    .is_some_and(|v| v.value == b"$before_needle"),
                TagValue::TypelessParam(value) => {
                    value
                        .parameter
                        .value
                        .strip_prefix(b"$")
                        .unwrap_or(value.parameter.value)
                        == b"before_needle"
                }
                _ => false,
            })
            .ok_or_else(|| {
                format!(
                    "matching @param tag not found in associated PhpDoc CST; parsed tags={:?}",
                    parsed_doc.tags().map(|t| t.value).collect::<Vec<_>>()
                )
            })?;
        let tag_start = tag.span().start.offset as usize;
        let line_start = source[..tag_start]
            .iter()
            .rposition(|b| *b == b'\n')
            .map_or(0, |n| n + 1);
        let line_end = source[tag.span().end.offset as usize..]
            .iter()
            .position(|b| *b == b'\n')
            .map_or(source.len(), |n| tag.span().end.offset as usize + n + 1);
        edits.push((line_start, line_end));
    }
    let mut decl = source[decl_start..decl_span.end.offset as usize].to_vec();
    // Apply signature edit relative to the declaration slice.
    if let Some((start, end)) = edits
        .iter()
        .find(|(start, _)| *start >= decl_start && *start < decl_span.end.offset as usize)
    {
        let a = start - decl_start;
        let b = end - decl_start;
        decl.drain(a..b);
    }
    let mut doc_bytes =
        source[doc.span.start.offset as usize..doc.span.end.offset as usize].to_vec();
    // A docblock edit is expressed with file offsets; rebase any matching line.
    if let Some((start, end)) = edits.iter().find(|(start, _)| *start < decl_start) {
        let a = start - doc.span.start.offset as usize;
        let b = end - doc.span.start.offset as usize;
        if a <= b && b <= doc_bytes.len() {
            doc_bytes.drain(a..b);
        }
    }
    let mut output = String::from("<?php\n");
    for statement in program.statements.iter() {
        if let Statement::Use(import) = statement {
            output.push_str(&slice(&source, import.span()));
            output.push('\n');
        }
    }
    output.push_str(&String::from_utf8_lossy(&doc_bytes));
    output.push('\n');
    output.push_str(&String::from_utf8_lossy(&decl));
    output.push('\n');
    Ok(output)
}
