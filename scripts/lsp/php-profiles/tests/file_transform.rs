use php_version_profile_generator::{PhpVersion, analyze, transform_file_returns};
use std::{fs, path::PathBuf};

fn pinned(rel: &str) -> PathBuf {
    std::env::var_os("PHPANTOM_STUBS_ROOT")
        .map(PathBuf::from)
        .expect("set PHPANTOM_STUBS_ROOT to the verified phpstorm-stubs source")
        .join(rel)
}

#[test]
fn return_language_type_transform_rewrites_full_method_file_and_matching_doc() {
    let input = pinned("session/SessionHandler.php");
    let transformed = transform_file_returns(&input, PhpVersion::parse("7.0").unwrap()).unwrap();
    assert_eq!(transformed.changed_declarations, 1);
    assert_eq!(transformed.return_type_declarations, 1);
    assert!(
        transformed
            .diagnostics
            .iter()
            .any(|message| message.contains("parameter LanguageLevelTypeAware")),
        "untransformed parameter type metadata must be diagnosed: {:?}",
        transformed.diagnostics
    );
    let output_path =
        std::env::temp_dir().join(format!("php-profile-method-{}-7.0.php", std::process::id()));
    fs::write(&output_path, &transformed.bytes).unwrap();
    let facts = analyze(&output_path).unwrap();
    let interface_gc = facts
        .declarations
        .iter()
        .find(|decl| {
            decl.kind == "method"
                && decl.name == "gc"
                && decl
                    .doc
                    .as_deref()
                    .is_some_and(|doc| doc.contains("Prior to PHP version 7.1"))
        })
        .unwrap();
    assert_eq!(interface_gc.doc_parse_errors, 0);
    assert!(
        interface_gc
            .doc
            .as_deref()
            .unwrap()
            .contains("@return bool")
    );
    assert!(!interface_gc.attributes.iter().any(|attribute| {
        attribute.name.ends_with("LanguageLevelTypeAware")
            && attribute.raw.contains("'7.1' => 'int|false'")
    }));
    assert_eq!(
        facts.declarations.len(),
        16,
        "whole-file output retains every original declaration"
    );
    fs::remove_file(output_path).unwrap();
}

#[test]
fn return_language_type_transform_selects_latest_boundary_type_and_preserves_other_docs() {
    let input = pinned("session/SessionHandler.php");
    let transformed = transform_file_returns(&input, PhpVersion::parse("7.1").unwrap()).unwrap();
    assert_eq!(transformed.changed_declarations, 1);
    assert_eq!(transformed.return_type_declarations, 1);
    assert!(
        transformed
            .diagnostics
            .iter()
            .any(|message| message.contains("parameter LanguageLevelTypeAware")),
        "untransformed parameter type metadata must be diagnosed: {:?}",
        transformed.diagnostics
    );
    let text = String::from_utf8(transformed.bytes).unwrap();
    assert!(text.contains("@return int|false"));
    assert!(text.contains("Prior to PHP version 7.1"));
    assert!(!text.contains("#[LanguageLevelTypeAware(['7.1' => 'int|false'], default: 'bool')]"));
}

#[test]
fn availability_filter_removes_function_parameter_and_its_doc_before_introduction() {
    let input = pinned("standard/standard_1.php");
    let transformed = transform_file_returns(&input, PhpVersion::parse("7.4").unwrap()).unwrap();
    assert!(transformed.availability_filtered_declarations > 0);
    assert!(
        !transformed
            .diagnostics
            .iter()
            .any(|message| message.contains("function strrchr")),
        "{:?}",
        transformed.diagnostics
    );
    let output_path = std::env::temp_dir().join(format!(
        "php-profile-strrchr-{}-7.4.php",
        std::process::id()
    ));
    fs::write(&output_path, &transformed.bytes).unwrap();
    let facts = analyze(&output_path).unwrap();
    let strrchr = facts
        .declarations
        .iter()
        .find(|decl| decl.kind == "function" && decl.name == "strrchr")
        .unwrap();
    assert_eq!(
        strrchr
            .params
            .iter()
            .map(|param| param.name.as_str())
            .collect::<Vec<_>>(),
        ["$haystack", "$needle"]
    );
    let doc = strrchr.doc.as_deref().unwrap();
    assert!(!doc.contains("@param bool $before_needle"));
    assert!(doc.contains("@param string $haystack"));
    assert!(doc.contains("@return string|false"));
    fs::remove_file(output_path).unwrap();
}

#[test]
fn availability_filter_keeps_parameter_and_doc_at_inclusive_introduction_boundary() {
    let input = pinned("standard/standard_1.php");
    let transformed = transform_file_returns(&input, PhpVersion::parse("8.3").unwrap()).unwrap();
    let output_path = std::env::temp_dir().join(format!(
        "php-profile-strrchr-{}-8.3.php",
        std::process::id()
    ));
    fs::write(&output_path, &transformed.bytes).unwrap();
    let facts = analyze(&output_path).unwrap();
    let strrchr = facts
        .declarations
        .iter()
        .find(|decl| decl.kind == "function" && decl.name == "strrchr")
        .unwrap();
    assert_eq!(
        strrchr
            .params
            .iter()
            .map(|param| param.name.as_str())
            .collect::<Vec<_>>(),
        ["$haystack", "$needle", "$before_needle"]
    );
    let last = strrchr.params.last().unwrap();
    assert_eq!(last.hint.as_deref(), Some("bool"));
    assert_eq!(last.default.as_deref(), Some("= false"));
    assert!(
        last.attributes.is_empty(),
        "consumed availability attribute was removed from the selected profile"
    );
    assert!(
        strrchr
            .doc
            .as_deref()
            .unwrap()
            .contains("@param bool $before_needle")
    );
    fs::remove_file(output_path).unwrap();
}
