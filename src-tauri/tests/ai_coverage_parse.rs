//! Integration test: verify AiCoverageResponse parsing works against the
//! real API response, including departments that lack `non_test_ai_rate`
//! (L3 部门) and `_isAuthor` stubs mixed into children arrays.

use serde_json;
use std::fs;
use tools_lib::commands::ai_coverage::{strip_author_objects, AiCoverageResponse};

#[test]
fn parse_real_api_response_with_l3_departments() {
    let raw = fs::read_to_string("tests/fixtures/ai_coverage_real.json")
        .expect("must have ai_coverage_real.json fixture");

    // Pre-process: strip _isAuthor stubs (mirrors what the Tauri command does)
    let mut value: serde_json::Value = serde_json::from_str(&raw)
        .expect("must parse raw JSON");
    strip_author_objects(&mut value);

    let data: AiCoverageResponse = serde_json::from_value(value)
        .expect("must parse real API response without missing-field errors");

    println!("overall: ai_rate={} non_test_ai_rate={}", data.overall.ai_rate, data.overall.non_test_ai_rate);
    println!("departments: {}", data.departments.len());

    // 至少应有 1 个部门
    assert!(!data.departments.is_empty(), "departments must not be empty");
    assert!(data.overall.ai_rate > 0.0, "overall.ai_rate must be > 0");
}

#[test]
fn parse_response_missing_optional_fields_uses_defaults() {
    // 模拟 API 响应缺字段的情况
    let json = r#"{
        "overall": {
            "ai_rate": 50.0,
            "total_lines": 1000,
            "ai_lines": 500,
            "total_commits": 10,
            "commits_with_ai": 5
        },
        "departments": [
            {
                "name": "L1 缺字段",
                "total_lines": 1000,
                "ai_lines": 500,
                "total_commits": 10,
                "commits_with_ai": 5,
                "contributor_count": 2,
                "ai_rate": 50.0,
                "children": [
                    {
                        "name": "L3 完全缺字段",
                        "total_commits": 5,
                        "total_lines": 500,
                        "ai_lines": 250,
                        "commits_with_ai": 2,
                        "ai_rate": 50.0,
                        "contributor_count": 1,
                        "department_l3": "L3"
                    }
                ]
            }
        ]
    }"#;

    let data: AiCoverageResponse = serde_json::from_str(json)
        .expect("should parse even when non_test_ai_rate and other fields missing");

    assert_eq!(data.departments.len(), 1);
    let l1 = &data.departments[0];
    assert_eq!(l1.name, "L1 缺字段");
    // 缺字段应默认为 0
    assert_eq!(l1.test_lines, 0);
    assert_eq!(l1.non_test_ai_rate, 0.0);
    // 子部门
    let children = l1.children.as_ref().expect("children must exist");
    assert_eq!(children.len(), 1);
    let l3 = &children[0];
    assert_eq!(l3.name, "L3 完全缺字段");
    assert_eq!(l3.department_l3.as_deref(), Some("L3"));
    assert_eq!(l3.non_test_ai_rate, 0.0);
    assert_eq!(l3.test_lines, 0);
    assert_eq!(l3.contributor_count, 1);
}

#[test]
fn strip_author_objects_removes_isauthor_stubs() {
    // 验证 _isAuthor stub 被正确过滤
    let mut json: serde_json::Value = serde_json::from_str(
        r#"{
            "departments": [{
                "name": "Test Dept",
                "children": [
                    { "name": "Real Subdept", "ai_rate": 50.0 },
                    { "_isAuthor": true, "name": "Wang Bin", "author_email": "wb" },
                    { "_isAuthor": true, "name": "Lv ZY", "author_email": "lz" }
                ]
            }]
        }"#
    ).unwrap();

    strip_author_objects(&mut json);
    let depts = json.get("departments").unwrap().as_array().unwrap();
    let children = depts[0].get("children").unwrap().as_array().unwrap();
    assert_eq!(children.len(), 1, "_isAuthor stubs must be removed");
    assert_eq!(children[0].get("name").unwrap().as_str().unwrap(), "Real Subdept");
}

#[test]
fn parse_real_data_after_strip_works() {
    // 完整解析真实数据，验证 _isAuthor 被正确剥离后能正常解析
    let raw = fs::read_to_string("tests/fixtures/ai_coverage_real.json")
        .expect("must have ai_coverage_real.json fixture");
    let mut value: serde_json::Value = serde_json::from_str(&raw).unwrap();
    strip_author_objects(&mut value);

    // 解析后没有 _isAuthor 残留
    let raw_after = serde_json::to_string(&value).unwrap();
    assert!(!raw_after.contains("_isAuthor"), "after strip, no _isAuthor should remain");

    let data: AiCoverageResponse = serde_json::from_value(value).unwrap();

    // 验证数据合理性
    assert!(data.departments.len() > 0);
    println!("✓ Parsed {} top-level departments", data.departments.len());
}
