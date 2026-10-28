use php_version_profile_generator::{
    AttributeFact, NormalizedAttribute, PhpVersion, normalize_attribute, select_language_type,
};
use std::collections::BTreeMap;

fn attribute(name: &str, args: &[(&str, &str)], positionals: &[&str]) -> AttributeFact {
    AttributeFact {
        name: name.to_string(),
        args: args
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect(),
        positionals: positionals.iter().map(|value| value.to_string()).collect(),
        version_types: BTreeMap::new(),
        default_type: None,
        raw: format!("{name}(...)"),
        parse_issues: Vec::new(),
    }
}

#[test]
fn normalizes_inclusive_availability_bounds_from_named_or_positional_arguments() {
    let imports = BTreeMap::from([(
        "available".to_string(),
        "JetBrains\\PhpStorm\\Internal\\PhpStormStubsElementAvailable".to_string(),
    )]);
    let named = attribute("Available", &[("from", "'8.1'"), ("to", "'8.3'")], &[]);
    let normalized = normalize_attribute(&named, &imports).unwrap().unwrap();
    let NormalizedAttribute::Availability { from, to } = normalized else {
        panic!("expected availability range")
    };
    assert_eq!(from, Some(PhpVersion { major: 8, minor: 1 }));
    assert_eq!(to, Some(PhpVersion { major: 8, minor: 3 }));

    let positional = attribute(
        "\\JetBrains\\PhpStorm\\Internal\\PhpStormStubsElementAvailable",
        &[],
        &["'8.3'"],
    );
    let normalized = normalize_attribute(&positional, &BTreeMap::new())
        .unwrap()
        .unwrap();
    assert_eq!(
        normalized,
        NormalizedAttribute::Availability {
            from: Some(PhpVersion { major: 8, minor: 3 }),
            to: None,
        }
    );
}

#[test]
fn rejects_malformed_and_conflicting_availability_metadata() {
    let imports = BTreeMap::new();
    for malformed in [
        attribute(
            "\\JetBrains\\PhpStorm\\Internal\\PhpStormStubsElementAvailable",
            &[("from", "'8.1.1'")],
            &[],
        ),
        attribute(
            "\\JetBrains\\PhpStorm\\Internal\\PhpStormStubsElementAvailable",
            &[("from", "'8.4'"), ("to", "'8.1'")],
            &[],
        ),
        attribute(
            "\\JetBrains\\PhpStorm\\Internal\\PhpStormStubsElementAvailable",
            &[("since", "'8.1'")],
            &[],
        ),
    ] {
        assert!(
            normalize_attribute(&malformed, &imports).is_err(),
            "{}",
            malformed.raw
        );
    }
    let unresolved_alias = attribute("Available", &[], &["'8.3'"]);
    assert!(normalize_attribute(&unresolved_alias, &imports).is_err());
}

#[test]
fn normalizes_latest_language_type_boundary_and_fallback() {
    let attr = AttributeFact {
        name: "LanguageLevelTypeAware".to_string(),
        args: BTreeMap::from([("default".to_string(), "'bool'".to_string())]),
        positionals: vec!["['7.1' => 'bool', '8.0' => 'int']".to_string()],
        version_types: BTreeMap::from([
            ("7.1".to_string(), "bool".to_string()),
            ("8.0".to_string(), "int".to_string()),
        ]),
        default_type: Some("bool".to_string()),
        raw: "LanguageLevelTypeAware([...], default: 'bool')".to_string(),
        parse_issues: Vec::new(),
    };
    let normalized = normalize_attribute(&attr, &BTreeMap::new())
        .unwrap()
        .unwrap();
    assert_eq!(
        select_language_type(&normalized, PhpVersion::parse("7.0").unwrap()).as_deref(),
        Some("bool")
    );
    assert_eq!(
        select_language_type(&normalized, PhpVersion::parse("7.4").unwrap()).as_deref(),
        Some("bool")
    );
    assert_eq!(
        select_language_type(&normalized, PhpVersion::parse("8.0").unwrap()).as_deref(),
        Some("int")
    );
    assert!(PhpVersion::parse("8.0.1").is_err());
}

#[test]
fn refuses_unknown_version_aware_families_and_lossy_parse_results() {
    let unknown = attribute("PhpVersionAware", &[], &[]);
    assert!(normalize_attribute(&unknown, &BTreeMap::new()).is_err());

    let malformed = AttributeFact {
        parse_issues: vec!["dynamic type entry".into()],
        ..attribute("LanguageLevelTypeAware", &[], &["dynamic()"])
    };
    assert!(normalize_attribute(&malformed, &BTreeMap::new()).is_err());
}
