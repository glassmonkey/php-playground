use mago_allocator::LocalArena;
use mago_database::file::FileId;
use mago_span::HasSpan;
use mago_syntax::cst::{
    ArrayElement, ClassLikeMember, Expression, Literal, NamespaceBody, Node, Program, Statement,
};
use serde_json::json;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::PathBuf,
};

fn root() -> PathBuf {
    std::env::var_os("PHPANTOM_STUBS_ROOT")
        .map(PathBuf::from)
        .expect("set PHPANTOM_STUBS_ROOT to the verified pinned phpstorm-stubs source")
}
fn text(src: &[u8], span: impl HasSpan) -> String {
    let s = span.span();
    String::from_utf8_lossy(&src[s.start.offset as usize..s.end.offset as usize]).into_owned()
}
fn literal(e: &Expression<'_>) -> Option<String> {
    match e {
        Expression::Literal(Literal::String(v)) => {
            v.value.map(|b| String::from_utf8_lossy(b).into_owned())
        }
        _ => None,
    }
}
fn map_sections(p: &Program<'_>, _src: &[u8]) -> BTreeMap<String, BTreeMap<String, String>> {
    fn parse_class<'a>(
        c: &mago_syntax::cst::Class<'a>,
        sections: &mut BTreeMap<String, BTreeMap<String, String>>,
    ) {
        if c.name.value.eq_ignore_ascii_case(b"PhpStormStubsMap") {
            for member in c.members.iter() {
                if let ClassLikeMember::Constant(k) = member {
                    for item in k.items.iter() {
                        let key = String::from_utf8_lossy(item.name.value).to_string();
                        let elements = match &item.value {
                            Expression::Array(arr) => &arr.elements,
                            Expression::LegacyArray(arr) => &arr.elements,
                            _ => continue,
                        };
                        if !["CLASSES", "FUNCTIONS", "CONSTANTS"].contains(&key.as_str()) {
                            continue;
                        }
                        let mut entries = BTreeMap::new();
                        for e in elements.iter() {
                            if let ArrayElement::KeyValue(pair) = e {
                                if let (Some(sym), Some(path)) =
                                    (literal(pair.key), literal(pair.value))
                                {
                                    entries.insert(sym, path);
                                }
                            }
                        }
                        sections.insert(key, entries);
                    }
                }
            }
        }
    }
    fn statements<'a>(
        items: &mago_syntax::cst::Sequence<'a, Statement<'a>>,
        sections: &mut BTreeMap<String, BTreeMap<String, String>>,
    ) {
        for st in items.iter() {
            match st {
                Statement::Class(c) => parse_class(c, sections),
                Statement::Namespace(ns) => match &ns.body {
                    NamespaceBody::Implicit(b) => statements(&b.statements, sections),
                    NamespaceBody::BraceDelimited(b) => statements(&b.statements, sections),
                },
                _ => {}
            }
        }
    }
    let mut sections = BTreeMap::new();
    statements(&p.statements, &mut sections);
    sections
}
#[derive(Default)]
struct Stats {
    declarations: BTreeMap<String, u64>,
    attributes: BTreeMap<String, u64>,
    version_attribute_forms: BTreeMap<String, u64>,
    php_errors: u64,
    phpdoc_errors: u64,
    docblocks: u64,
    since_core: u64,
    since_noncore: u64,
    removed_core: u64,
    removed_noncore: u64,
    since_tag_forms: BTreeMap<String, u64>,
    removed_tag_forms: BTreeMap<String, u64>,
    unsupported_grouped_imports: u64,
}
fn visit<'a, 'b>(n: Node<'a, 'b>, src: &[u8], s: &mut Stats) {
    let mut inc = |k: &str| *s.declarations.entry(k.to_string()).or_default() += 1;
    match n {
        Node::Function(_) => inc("functions"),
        Node::Method(_) => inc("methods"),
        Node::Class(_) => inc("classes"),
        Node::Interface(_) => inc("interfaces"),
        Node::Trait(_) => inc("traits"),
        Node::Enum(_) => inc("enums"),
        Node::PropertyItem(_) => inc("properties"),
        Node::ClassLikeConstantItem(_) => inc("class_constants"),
        Node::ConstantItem(_) => inc("global_constants"),
        Node::EnumCase(_) => inc("enum_cases"),
        Node::Attribute(a) => {
            let name = String::from_utf8_lossy(a.name.value()).to_string();
            *s.attributes.entry(name.clone()).or_default() += 1;
            let low = name.to_ascii_lowercase();
            if low.contains("available")
                || low.contains("languagelevel")
                || low.contains("phpversion")
            {
                *s.version_attribute_forms.entry(text(src, a)).or_default() += 1;
            }
        }
        Node::Use(u) => {
            if matches!(
                u.items,
                mago_syntax::cst::UseItems::TypedList(_) | mago_syntax::cst::UseItems::MixedList(_)
            ) {
                s.unsupported_grouped_imports += 1;
            }
        }
        _ => {}
    }
    n.visit_children(|ch| visit(ch, src, s));
}
fn main() {
    let root = root();
    let map_path = root.join("PhpStormStubsMap.php");
    let map_src = fs::read(&map_path).expect("map input");
    let arena = LocalArena::new();
    let id = FileId::new(map_path.as_os_str().as_encoded_bytes());
    let map_ast = mago_syntax::parser::parse_file_content(&arena, id, &map_src);
    assert!(
        !map_ast.has_errors(),
        "map parser errors: {}",
        map_ast.errors.len()
    );
    let sections = map_sections(map_ast, &map_src);
    assert_eq!(sections.len(), 3, "map sections");
    let mut unique = BTreeSet::new();
    let mut symbol_map = BTreeMap::new();
    for (section, entries) in &sections {
        for (sym, path) in entries {
            unique.insert(path.clone());
            symbol_map.insert((section.clone(), sym.clone()), path.clone());
        }
    }
    let mut stats = Stats::default();
    let mut missing = Vec::new();
    let mut phpdoc_missing = Vec::new();
    let mut unsupported_files = Vec::new();
    let mut declarations_by_path = BTreeMap::new();
    for rel in &unique {
        let path = root.join(rel);
        if !path.is_file() {
            missing.push(rel.clone());
            continue;
        }
        let src = fs::read(&path).expect("mapped PHP source");
        let arena = LocalArena::new();
        let id = FileId::new(path.as_os_str().as_encoded_bytes());
        let ast = mago_syntax::parser::parse_file_content(&arena, id, &src);
        if ast.has_errors() {
            stats.php_errors += 1;
            unsupported_files.push(json!({"path":rel,"php_parse_errors":ast.errors.len()}));
        }
        let before = stats.declarations.clone();
        visit(Node::Program(ast), &src, &mut stats);
        let mut local = BTreeMap::new();
        for (k, v) in &stats.declarations {
            let prior = before.get(k).copied().unwrap_or(0);
            if *v > prior {
                local.insert(k.clone(), v - prior);
            }
        }
        declarations_by_path.insert(rel.clone(), local);
        let core = rel.starts_with("Core/") || rel.starts_with("core/");
        for t in ast
            .trivia
            .iter()
            .filter(|t| t.kind == mago_syntax::cst::TriviaKind::DocBlockComment)
        {
            stats.docblocks += 1;
            let a = t.span.start.offset as usize;
            let b = t.span.end.offset as usize;
            let doc = &src[a..b];
            let parsed =
                mago_phpdoc_syntax::parser::PHPDocParser::parse_with_span(&arena, doc, t.span);
            if !parsed.errors.is_empty() {
                stats.phpdoc_errors += 1;
                phpdoc_missing.push(json!({"path":rel,"offset":a,"errors":parsed.errors.len()}));
            }
            for tag in parsed.tags() {
                match String::from_utf8_lossy(tag.name.value)
                    .to_ascii_lowercase()
                    .as_str()
                {
                    "since" => {
                        *stats.since_tag_forms.entry(text(&src, tag)).or_default() += 1;
                        if core {
                            stats.since_core += 1
                        } else {
                            stats.since_noncore += 1
                        }
                    }
                    "removed" => {
                        *stats.removed_tag_forms.entry(text(&src, tag)).or_default() += 1;
                        if core {
                            stats.removed_core += 1
                        } else {
                            stats.removed_noncore += 1
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    let mut relevant = BTreeMap::new();
    let mut other_attrs = BTreeMap::new();
    for (name, count) in stats.attributes {
        let low = name.to_ascii_lowercase();
        if low.contains("available")
            || low.contains("languagelevel")
            || low.contains("phpversion")
            || low.contains("deprecated")
        {
            relevant.insert(name, count);
        } else {
            other_attrs.insert(name, count);
        }
    }
    let total_map_entries: u64 = sections.values().map(|m| m.len() as u64).sum();
    let out = json!({"inventory":"pinned-phpstorm-stubs-map-cst-v1","source_commit":"2049ca3cfa1feabf52db074108fe776a5713cf02","map_path":"PhpStormStubsMap.php","map_sections":sections.iter().map(|(k,v)|(k.clone(),v.len())).collect::<BTreeMap<_,_>>(),"map_entry_total":total_map_entries,"unique_mapped_files":unique.len(),"missing_mapped_files":missing,"declarations_by_kind":stats.declarations,"version_related_attribute_occurrences":relevant,"version_related_attribute_raw_forms":stats.version_attribute_forms,"other_attribute_distinct_names":other_attrs.len(),"other_attribute_occurrences":other_attrs.values().sum::<u64>(),"phpdoc":{"docblocks":stats.docblocks,"parse_errors":stats.phpdoc_errors,"since_core":stats.since_core,"since_noncore_unknown_release_domain":stats.since_noncore,"since_tag_raw_forms":stats.since_tag_forms,"removed_core":stats.removed_core,"removed_noncore":stats.removed_noncore,"removed_tag_raw_forms":stats.removed_tag_forms},"unsupported_or_unknown":{"php_files_with_parser_errors":stats.php_errors,"phpdoc_files_or_comments_with_errors":phpdoc_missing.len(),"grouped_or_mixed_import_statements":stats.unsupported_grouped_imports,"noncore_since_tags_require_extension_version_source":stats.since_noncore,"attribute_aliases_and_argument_semantics_not_normalized":true,"source_diagnostics":unsupported_files,"phpdoc_diagnostics":phpdoc_missing},"files_with_declarations":declarations_by_path.len(),"map_logical_path_unique":true,"selected_profile_contract":{"schemaVersion":1,"rule":"Each profile's resolved files list contains at most one entry per logicalPath; a transformed whole-file replacement removes that logical path from shared baseline before adding the replacement."}});
    println!("{}", serde_json::to_string_pretty(&out).unwrap());
}
