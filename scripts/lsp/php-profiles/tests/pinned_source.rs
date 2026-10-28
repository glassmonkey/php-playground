use php_version_profile_generator::{
    analyze, core_since_filter_applies, default_stubs_root, language_level_type, resolve_attribute,
    version_available, visible_parameters,
};
use std::path::PathBuf;

fn file(rel: &str) -> PathBuf {
    default_stubs_root().join(rel)
}
fn function<'a>(
    facts: &'a php_version_profile_generator::SourceFacts,
    name: &str,
) -> &'a php_version_profile_generator::DeclarationFact {
    facts
        .declarations
        .iter()
        .find(|d| d.kind == "function" && d.name == name)
        .unwrap_or_else(|| panic!("missing function {name}"))
}
fn method<'a>(
    facts: &'a php_version_profile_generator::SourceFacts,
    name: &str,
) -> &'a php_version_profile_generator::DeclarationFact {
    facts
        .declarations
        .iter()
        .find(|d| d.kind == "method" && d.name == name)
        .unwrap_or_else(|| panic!("missing method {name}"))
}
fn arg<'a>(attr: &'a php_version_profile_generator::AttributeFact, key: &str) -> &'a str {
    attr.args.get(key).map(String::as_str).unwrap_or("")
}

#[test]
fn parses_real_strrchr_parameter_and_matching_phpdoc_without_losing_defaults_or_types() {
    let facts = analyze(&file("standard/standard_1.php")).unwrap();
    assert_eq!(facts.parse_errors, 0);
    let decl = function(&facts, "strrchr");
    assert_eq!(decl.doc_parse_errors, 0);
    let doc = decl.doc.as_deref().unwrap();
    assert!(doc.contains("@param string $haystack"));
    assert!(doc.contains("@param string $needle"));
    assert!(doc.contains("@param bool $before_needle"));
    assert!(doc.contains("@return string|false"));
    assert_eq!(
        decl.params
            .iter()
            .map(|p| p.name.as_str())
            .collect::<Vec<_>>(),
        ["$haystack", "$needle", "$before_needle"]
    );
    let last = decl.params.last().unwrap();
    assert_eq!(last.hint.as_deref(), Some("bool"));
    assert_eq!(last.default.as_deref(), Some("= false"));
    let availability = last
        .attributes
        .iter()
        .find(|a| {
            resolve_attribute(&a.name, &facts.imports).ends_with("PhpStormStubsElementAvailable")
        })
        .unwrap();
    assert_eq!(arg(availability, "from"), "8.3");
    assert_eq!(
        version_available(availability, &facts.imports, (8, 2)),
        Some(false)
    );
    assert_eq!(
        version_available(availability, &facts.imports, (8, 3)),
        Some(true)
    );
    assert_eq!(visible_parameters(decl, &facts.imports, (8, 2)).len(), 2);
    assert_eq!(visible_parameters(decl, &facts.imports, (8, 3)).len(), 3);
}

#[test]
fn resolves_aliased_version_attribute_and_inclusive_version_bounds() {
    let facts = analyze(&file("ldap/ldap.php")).unwrap();
    assert_eq!(facts.parse_errors, 0);
    assert_eq!(
        facts.imports.get("available").map(String::as_str),
        Some("JetBrains\\PhpStorm\\Internal\\PhpStormStubsElementAvailable")
    );
    let decl = function(&facts, "ldap_exop_passwd");
    assert_eq!(decl.doc_parse_errors, 0);
    let users = decl
        .params
        .iter()
        .filter(|p| p.name == "$user")
        .collect::<Vec<_>>();
    assert_eq!(
        users.len(),
        3,
        "repeated historical variants are retained as distinct AST parameters"
    );
    let availability = users
        .iter()
        .map(|p| {
            p.attributes
                .iter()
                .find(|a| {
                    resolve_attribute(&a.name, &facts.imports)
                        .ends_with("PhpStormStubsElementAvailable")
                })
                .unwrap()
        })
        .collect::<Vec<_>>();
    assert_eq!(
        availability
            .iter()
            .map(|a| version_available(a, &facts.imports, (7, 1)))
            .collect::<Vec<_>>(),
        [Some(true), Some(false), Some(false)]
    );
    assert_eq!(
        availability
            .iter()
            .map(|a| version_available(a, &facts.imports, (7, 2)))
            .collect::<Vec<_>>(),
        [Some(false), Some(true), Some(false)]
    );
    assert_eq!(
        availability
            .iter()
            .map(|a| version_available(a, &facts.imports, (7, 3)))
            .collect::<Vec<_>>(),
        [Some(false), Some(false), Some(true)]
    );
    assert!(decl.doc.as_deref().unwrap().contains("@param string $user"));
}

#[test]
fn parses_real_method_docblock_and_language_level_types_without_changing_source_metadata() {
    let facts = analyze(&file("session/SessionHandler.php")).unwrap();
    assert_eq!(facts.parse_errors, 0);
    let gc = method(&facts, "gc");
    assert_eq!(gc.doc_parse_errors, 0);
    let doc = gc.doc.as_deref().unwrap();
    assert!(doc.contains("@param int $max_lifetime"));
    assert!(doc.contains("@return int|false"));
    assert!(doc.contains("Prior to PHP version 7.1"));
    let return_language_type = gc
        .attributes
        .iter()
        .find(|a| resolve_attribute(&a.name, &facts.imports).ends_with("LanguageLevelTypeAware"))
        .unwrap();
    assert!(return_language_type.raw.contains("'7.1' => 'int|false'"));
    assert_eq!(
        language_level_type(return_language_type, &facts.imports, (7, 0)),
        Some(Some("bool".into()))
    );
    assert_eq!(
        language_level_type(return_language_type, &facts.imports, (7, 1)),
        Some(Some("int|false".into()))
    );
    let param = gc
        .params
        .iter()
        .find(|p| p.name == "$max_lifetime")
        .unwrap();
    let language_type = param
        .attributes
        .iter()
        .find(|a| resolve_attribute(&a.name, &facts.imports).ends_with("LanguageLevelTypeAware"))
        .unwrap();
    assert!(language_type.raw.contains("'8.0' => 'int'"));
    assert!(language_type.raw.contains("default: ''"));
    assert_eq!(
        language_level_type(language_type, &facts.imports, (7, 4)),
        Some(None)
    );
    assert_eq!(
        language_level_type(language_type, &facts.imports, (8, 0)),
        Some(Some("int".into()))
    );
    assert_eq!(param.default, None);
}

#[test]
fn extension_release_since_is_not_mistaken_for_php_release_since() {
    let core = analyze(&file("Core/Core.php")).unwrap();
    let contains = function(&core, "str_contains");
    assert!(contains.doc.as_deref().unwrap().contains("@since 8.0"));
    assert!(core_since_filter_applies("Core/Core.php"));
    assert!(!core_since_filter_applies("mbstring/mbstring.php"));
    // Extension @since values denote extension releases and cannot filter a PHP
    // version profile without separate extension-version evidence.
    let mb = analyze(&file("mbstring/mbstring.php")).unwrap();
    assert_eq!(mb.parse_errors, 0);
    let mb_chr = function(&mb, "mb_chr");
    assert!(mb_chr.doc.as_deref().unwrap().contains("@since 7.2"));
}

#[test]
fn parses_positional_method_availability_bounds_and_docblock() {
    let facts = analyze(&file("SPL/SPL_c1.php")).unwrap();
    assert_eq!(facts.parse_errors, 0);
    let fputcsv = method(&facts, "fputcsv");
    assert_eq!(fputcsv.doc_parse_errors, 0);
    let eol = fputcsv.params.iter().find(|p| p.name == "$eol").unwrap();
    assert!(
        fputcsv
            .doc
            .as_deref()
            .unwrap()
            .contains("@param string $eol")
    );
    let availability = eol
        .attributes
        .iter()
        .find(|a| {
            resolve_attribute(&a.name, &facts.imports).ends_with("PhpStormStubsElementAvailable")
        })
        .unwrap();
    assert_eq!(availability.positionals, ["8.1"]);
    assert_eq!(
        version_available(availability, &facts.imports, (8, 0)),
        Some(false)
    );
    assert_eq!(
        version_available(availability, &facts.imports, (8, 1)),
        Some(true)
    );
}

#[test]
fn generated_slice_rewrites_only_versioned_declaration_and_matching_doc_tag() {
    let input = file("standard/standard_1.php");
    let old = php_version_profile_generator::render_strrchr_slice(&input, (8, 2)).unwrap();
    let new = php_version_profile_generator::render_strrchr_slice(&input, (8, 3)).unwrap();
    assert!(old.contains("use JetBrains\\PhpStorm\\Pure;"));
    assert!(old.contains("use JetBrains\\PhpStorm\\Internal\\PhpStormStubsElementAvailable;"));
    assert!(old.contains("function strrchr(string $haystack, string $needle): string|false"));
    assert!(!old.contains("@param bool $before_needle"));
    assert!(old.contains("@param string $haystack"));
    assert!(old.contains("@param string $needle"));
    assert!(old.contains("@return string|false"));
    assert!(
        !old.contains("function str_contains"),
        "generated output is transformed-only, untouched definitions come from the shared input"
    );
    assert!(new.contains("@param bool $before_needle"));
    assert!(new.contains("function strrchr(string $haystack, string $needle, #[PhpStormStubsElementAvailable(from: '8.3')] bool $before_needle = false): string|false"));
}
