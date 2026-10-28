use super::*;

#[test]
fn test_detect_single_quote_empty() {
    // $config['
    let content = "<?php\n$config['";
    let pos = Position {
        line: 1,
        character: 9,
    };
    let ctx = detect_array_key_context(content, pos).unwrap();
    assert_eq!(ctx.var_name, "$config");
    assert_eq!(ctx.partial_key, "");
    assert_eq!(ctx.quote_char, Some('\''));
    assert_eq!(ctx.key_start_col, 9);
    assert!(ctx.prefix_keys.is_empty());
}

#[test]
fn test_detect_single_quote_partial() {
    // $config['na
    let content = "<?php\n$config['na";
    let pos = Position {
        line: 1,
        character: 11,
    };
    let ctx = detect_array_key_context(content, pos).unwrap();
    assert_eq!(ctx.var_name, "$config");
    assert_eq!(ctx.partial_key, "na");
    assert_eq!(ctx.quote_char, Some('\''));
    assert_eq!(ctx.key_start_col, 9);
    assert!(ctx.prefix_keys.is_empty());
}

#[test]
fn test_detect_double_quote_empty() {
    let content = "<?php\n$config[\"";
    let pos = Position {
        line: 1,
        character: 9,
    };
    let ctx = detect_array_key_context(content, pos).unwrap();
    assert_eq!(ctx.var_name, "$config");
    assert_eq!(ctx.partial_key, "");
    assert_eq!(ctx.quote_char, Some('"'));
    assert_eq!(ctx.key_start_col, 9);
    assert!(ctx.prefix_keys.is_empty());
}

#[test]
fn test_detect_bracket_only() {
    // $config[
    let content = "<?php\n$config[";
    let pos = Position {
        line: 1,
        character: 8,
    };
    let ctx = detect_array_key_context(content, pos).unwrap();
    assert_eq!(ctx.var_name, "$config");
    assert_eq!(ctx.partial_key, "");
    assert_eq!(ctx.quote_char, None);
    assert_eq!(ctx.key_start_col, 8);
    assert!(ctx.prefix_keys.is_empty());
}

#[test]
fn test_no_context_without_bracket() {
    let content = "<?php\n$config";
    let pos = Position {
        line: 1,
        character: 7,
    };
    assert!(detect_array_key_context(content, pos).is_none());
}

#[test]
fn test_no_context_without_variable() {
    let content = "<?php\nfoo['";
    let pos = Position {
        line: 1,
        character: 5,
    };
    assert!(detect_array_key_context(content, pos).is_none());
}

#[test]
fn test_detect_chained_single_key() {
    // $response['meta'][
    let content = "<?php\n$response['meta'][";
    let pos = Position {
        line: 1,
        character: 18,
    };
    let ctx = detect_array_key_context(content, pos).unwrap();
    assert_eq!(ctx.var_name, "$response");
    assert_eq!(ctx.partial_key, "");
    assert_eq!(ctx.quote_char, None);
    assert_eq!(ctx.prefix_keys, vec!["meta"]);
}

#[test]
fn test_detect_chained_single_key_with_quote() {
    // $response['meta']['
    let content = "<?php\n$response['meta']['";
    let pos = Position {
        line: 1,
        character: 19,
    };
    let ctx = detect_array_key_context(content, pos).unwrap();
    assert_eq!(ctx.var_name, "$response");
    assert_eq!(ctx.partial_key, "");
    assert_eq!(ctx.quote_char, Some('\''));
    assert_eq!(ctx.prefix_keys, vec!["meta"]);
}

#[test]
fn test_detect_chained_two_keys() {
    // $data['a']['b'][
    let content = "<?php\n$data['a']['b'][";
    let pos = Position {
        line: 1,
        character: 16,
    };
    let ctx = detect_array_key_context(content, pos).unwrap();
    assert_eq!(ctx.var_name, "$data");
    assert_eq!(ctx.prefix_keys, vec!["a", "b"]);
}

#[test]
fn test_detect_autoclosed_bracket() {
    // $config[] — cursor between [ and ]
    let content = "<?php\n$config[]";
    let pos = Position {
        line: 1,
        character: 8,
    };
    let ctx = detect_array_key_context(content, pos).unwrap();
    assert_eq!(ctx.var_name, "$config");
    assert_eq!(ctx.partial_key, "");
    assert_eq!(ctx.quote_char, None);
    assert_eq!(ctx.key_start_col, 8);
}

#[test]
fn test_detect_autoclosed_quote_bracket() {
    // $config[''] — cursor between the two quotes
    let content = "<?php\n$config['']";
    let pos = Position {
        line: 1,
        character: 9,
    };
    let ctx = detect_array_key_context(content, pos).unwrap();
    assert_eq!(ctx.var_name, "$config");
    assert_eq!(ctx.partial_key, "");
    assert_eq!(ctx.quote_char, Some('\''));
    assert_eq!(ctx.key_start_col, 9);
}
