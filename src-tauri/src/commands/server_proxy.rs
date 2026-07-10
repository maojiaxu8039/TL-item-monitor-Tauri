use std::sync::LazyLock;
use std::time::Duration;

fn parse_server_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("服务器地址无效: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err("只支持 http/https 服务器地址".to_string()),
    }
}

// 全局复用 HTTP 客户端，避免每次请求重建 TCP/TLS 连接（连接池复用）
static SERVER_CLIENT: LazyLock<Result<reqwest::Client, String>> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
});

fn server_client() -> Result<&'static reqwest::Client, String> {
    SERVER_CLIENT.as_ref().map_err(|e| e.clone())
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
    let client = server_client()?;

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
    let client = server_client()?;

    let response = client
        .post(parsed)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("连接服务器失败: {e}"))?;

    parse_json_response(response).await
}
