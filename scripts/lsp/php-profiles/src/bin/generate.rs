use mago_allocator::LocalArena;
use mago_database::file::FileId;
use mago_syntax::cst::{
    ArrayElement, ClassLikeMember, Expression, Literal, NamespaceBody, Program, Statement,
};
use php_version_profile_generator::{PhpVersion, transform_file_returns};
use serde_json::{Map, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    env, fs,
    io::Write,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
};

const STUBS_COMMIT: &str = "2049ca3cfa1feabf52db074108fe776a5713cf02";
const STUBS_ARCHIVE_SHA256: &str =
    "3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7";
const MAP_SHA256: &str = "7d8a2e1407330aaf308a69633c445de53c29e0a28327111086afe62e61a6e35c";
const TARGETS: [&str; 12] = [
    "5.6", "7.0", "7.1", "7.2", "7.3", "7.4", "8.0", "8.1", "8.2", "8.3", "8.4", "8.5",
];

fn sha256(bytes: &[u8]) -> Result<String, String> {
    for (program, args) in [("shasum", vec!["-a", "256"]), ("sha256sum", vec![])] {
        let mut child = match Command::new(program)
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(child) => child,
            Err(_) => continue,
        };
        child
            .stdin
            .take()
            .ok_or("hash tool stdin unavailable")?
            .write_all(bytes)
            .map_err(|e| e.to_string())?;
        let output = child.wait_with_output().map_err(|e| e.to_string())?;
        if output.status.success() {
            let line = String::from_utf8_lossy(&output.stdout);
            let hash = line.split_whitespace().next().unwrap_or_default();
            if hash.len() == 64 {
                return Ok(hash.to_string());
            }
        }
    }
    Err("SHA-256 requires shasum or sha256sum on PATH".to_string())
}

fn string_literal(expression: &Expression<'_>) -> Option<String> {
    match expression {
        Expression::Literal(Literal::String(value)) => value
            .value
            .map(|bytes| String::from_utf8_lossy(bytes).into_owned()),
        _ => None,
    }
}

fn class_entries(program: &Program<'_>) -> BTreeMap<String, String> {
    fn visit_statements(
        statements: &mago_syntax::cst::Sequence<'_, Statement<'_>>,
        output: &mut BTreeMap<String, String>,
    ) {
        for statement in statements.iter() {
            match statement {
                Statement::Namespace(namespace) => match &namespace.body {
                    NamespaceBody::Implicit(body) => visit_statements(&body.statements, output),
                    NamespaceBody::BraceDelimited(body) => {
                        visit_statements(&body.statements, output)
                    }
                },
                Statement::Class(class)
                    if class.name.value.eq_ignore_ascii_case(b"PhpStormStubsMap") =>
                {
                    for member in class.members.iter() {
                        let ClassLikeMember::Constant(constant) = member else {
                            continue;
                        };
                        for item in constant.items.iter() {
                            let elements = match &item.value {
                                Expression::Array(array) => &array.elements,
                                Expression::LegacyArray(array) => &array.elements,
                                _ => continue,
                            };
                            if !item.name.value.eq_ignore_ascii_case(b"CLASSES")
                                && !item.name.value.eq_ignore_ascii_case(b"FUNCTIONS")
                                && !item.name.value.eq_ignore_ascii_case(b"CONSTANTS")
                            {
                                continue;
                            }
                            for entry in elements.iter() {
                                let ArrayElement::KeyValue(pair) = entry else {
                                    continue;
                                };
                                if let (Some(symbol), Some(path)) =
                                    (string_literal(pair.key), string_literal(pair.value))
                                {
                                    output.insert(
                                        format!(
                                            "{}:{symbol}",
                                            String::from_utf8_lossy(item.name.value)
                                        ),
                                        path,
                                    );
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }
    let mut output = BTreeMap::new();
    visit_statements(&program.statements, &mut output);
    output
}

fn mapped_paths(root: &Path) -> Result<Vec<String>, String> {
    let map_path = root.join("PhpStormStubsMap.php");
    let source = fs::read(&map_path).map_err(|e| format!("read {}: {e}", map_path.display()))?;
    let actual = sha256(&source)?;
    if actual != MAP_SHA256 {
        return Err(format!(
            "pinned map SHA-256 mismatch: expected {MAP_SHA256}, got {actual}"
        ));
    }
    let arena = LocalArena::new();
    let id = FileId::new(map_path.as_os_str().as_encoded_bytes());
    let program = mago_syntax::parser::parse_file_content(&arena, id, &source);
    if program.has_errors() {
        return Err(format!("map has {} CST parse errors", program.errors.len()));
    }
    let symbols = class_entries(program);
    if symbols.is_empty() {
        return Err("pinned map has no recognized declaration sections".into());
    }
    let mut paths = BTreeSet::new();
    for path in symbols.values() {
        let relative = Path::new(path);
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err(format!("unsafe map path `{path}`"));
        }
        if !root.join(relative).is_file() {
            return Err(format!("mapped file missing: {path}"));
        }
        paths.insert(path.clone());
    }
    Ok(paths.into_iter().collect())
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("output path has no parent")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .and_then(|mut file| file.write_all(bytes))
        .map_err(|e| format!("write {}: {e}", path.display()))
}

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let mut source_root = None;
    let mut output_root = None;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--stubs-root" => source_root = args.next().map(PathBuf::from),
            "--output" => output_root = args.next().map(PathBuf::from),
            "--help" | "-h" => {
                println!(
                    "php-profile-generator --stubs-root <verified-phpstorm-stubs> --output <new-directory>"
                );
                return Ok(());
            }
            _ => return Err(format!("unknown argument `{arg}`")),
        }
    }
    let source_root = source_root.ok_or("missing --stubs-root")?;
    let output_root = output_root.ok_or("missing --output")?;
    if output_root.exists()
        && fs::read_dir(&output_root)
            .map_err(|e| e.to_string())?
            .next()
            .is_some()
    {
        return Err(format!(
            "refusing to overwrite non-empty output directory {}",
            output_root.display()
        ));
    }
    let paths = mapped_paths(&source_root)?;
    let mut fingerprint = Vec::new();
    for logical_path in &paths {
        let bytes = fs::read(source_root.join(logical_path))
            .map_err(|e| format!("read {logical_path}: {e}"))?;
        let digest = sha256(&bytes)?;
        fingerprint.extend_from_slice(logical_path.as_bytes());
        fingerprint.push(0);
        fingerprint.extend_from_slice(digest.as_bytes());
        fingerprint.push(b'\n');
    }
    let source_fingerprint = sha256(&fingerprint)?;
    let mut profiles = Map::new();
    let mut target_coverage = Map::new();
    let mut all_blob_hashes = BTreeSet::new();
    for target in TARGETS {
        let version = PhpVersion::parse(target)?;
        let mut blobs = BTreeMap::<String, Vec<u8>>::new();
        let mut manifest_files = Vec::new();
        let mut changed_files = 0;
        let mut changed_declarations = 0;
        let mut return_type_declarations = 0;
        let mut availability_filtered_declarations = 0;
        let mut diagnostics = Vec::new();
        for logical_path in &paths {
            let source_path = source_root.join(logical_path);
            let transformed = transform_file_returns(&source_path, version)
                .map_err(|error| format!("{logical_path} PHP {target}: {error}"))?;
            changed_files += usize::from(
                transformed.bytes != fs::read(&source_path).map_err(|e| e.to_string())?,
            );
            changed_declarations += transformed.changed_declarations;
            return_type_declarations += transformed.return_type_declarations;
            availability_filtered_declarations += transformed.availability_filtered_declarations;
            diagnostics.extend(
                transformed
                    .diagnostics
                    .into_iter()
                    .map(|message| format!("{logical_path}: {message}")),
            );
            let digest = sha256(&transformed.bytes)?;
            all_blob_hashes.insert(digest.clone());
            blobs.entry(digest.clone()).or_insert(transformed.bytes);
            manifest_files.push(json!({"logicalPath":logical_path,"url":format!("./blobs/{digest}"),"sha256":digest}));
        }
        for (digest, bytes) in &blobs {
            let blob_path = output_root.join("blobs").join(digest);
            if !blob_path.exists() {
                write_new(&blob_path, bytes)?;
            } else if fs::read(&blob_path).map_err(|e| e.to_string())? != *bytes {
                return Err(format!(
                    "content-addressed blob collision at {}",
                    blob_path.display()
                ));
            }
        }
        profiles.insert(target.to_string(), json!({"files":manifest_files.clone()}));
        target_coverage.insert(
            target.to_string(),
            json!({
                "status":"partial PHP version transform; not a complete PHP-version profile",
                "mapped_files":paths.len(),
                "transformed_files":changed_files,
                "transformed_declarations":changed_declarations,
                "transformed_by_family":{
                    "function_method_return_language_level_types":return_type_declarations,
                    "function_method_parameter_availability":availability_filtered_declarations,
                },
                "supported_fact_claims":["function/method LanguageLevelTypeAware return type synchronized with one attached @return tag; native return hint updated when present","function/method parameter availability filters signature and removes exactly one matching @param tag"],
                "unresolved_or_unsupported_diagnostic_count":diagnostics.len(),
                "diagnostics":diagnostics,
            }),
        );
    }
    let manifest = json!({"schemaVersion":1,"profiles":profiles});
    let coverage = json!({
        "status":"incomplete-candidate; never load as a selected-version profile",
        "target_coverage":target_coverage,
        "normalization_rules_applied_to_files":[
            "LanguageLevelTypeAware latest version at or below target, then default for function/method returns; matching @return and native return type are updated",
            "PhpStormStubsElementAvailable inclusive parameter bounds; excluded parameters and exactly one matching @param tag are removed, retained attributes are removed",
        ],
        "unresolved_coverage":[
            "LanguageLevelTypeAware parameter type/native hint/PhpDoc transformations",
            "class/member availability and declaration removal/addition",
            "namespace/group imports and unresolved aliases, malformed metadata",
            "PHPDoc diagnostics and @removed/@since semantic applicability",
            "extension-version mapping; non-Core @since is not PHP-version evidence",
        ],
        "unsupported_metadata_is_preserved_and_reported":true,
        "phpdoc_diagnostics":"see inventory.json produced by the pinned inventory binary alongside coverage.json",
    });
    let provenance = json!({
        "source_repository":"JetBrains/phpstorm-stubs",
        "source_commit":STUBS_COMMIT,
        "source_archive_sha256":STUBS_ARCHIVE_SHA256,
        "map_sha256":MAP_SHA256,
        "mapped_source_files":paths.len(),
        "unique_content_blobs":all_blob_hashes.len(),
        "mapped_tree_fingerprint_sha256":source_fingerprint,
        "candidate_only":true,
    });
    write_new(
        &output_root.join("manifest.json"),
        &(serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?),
    )?;
    write_new(
        &output_root.join("coverage.json"),
        &(serde_json::to_vec_pretty(&coverage).map_err(|e| e.to_string())?),
    )?;
    write_new(
        &output_root.join("provenance.json"),
        &(serde_json::to_vec_pretty(&provenance).map_err(|e| e.to_string())?),
    )?;
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "status":"partial; not a production profile",
            "targets":TARGETS,
            "mapped_files":paths.len(),
            "source_fingerprint_sha256":source_fingerprint,
            "output":output_root,
        }))
        .map_err(|e| e.to_string())?
    );
    Ok(())
}
