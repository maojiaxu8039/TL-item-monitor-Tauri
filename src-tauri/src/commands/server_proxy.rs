use std::time::Duration;

fn parse_server_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("服务器地址无效: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err("只支持 http/https 服务器地址".to_string()),
    }
}

fn build_server_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}

async fn parse_json_response(response: reqwest::Response) -> Result<serde_json::Value, String> {
    let status = response.status();
    if !status.is_success() {
        return Err(format!("服务器返回 HTTP {status}"));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("解析服务器响应失败: {e}"))
}

#[tauri::command]
pub async fn fetch_server_json_cmd(url: String) -> Result<serde_json::Value, String> {
    let parsed = parse_server_url(&url)?;
    let client = build_server_client()?;

    let response = client
        .get(parsed)
        .send()
        .await
        .map_err(|e| format!("连接服务器失败: {e}"))?;

    parse_json_response(response).await
}

#[tauri::command]
pub async fn post_server_json_cmd(
    url: String,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let parsed = parse_server_url(&url)?;
    let client = build_server_client()?;

    let response = client
        .post(parsed)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("连接服务器失败: {e}"))?;

    parse_json_response(response).await
}
