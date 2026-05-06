use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use uuid::Uuid;

#[derive(Debug, Serialize)]
struct ChatRequest {
    #[serde(rename = "type")]
    msg_type: String,
    payload: ChatPayload,
}

#[derive(Debug, Serialize)]
struct ChatPayload {
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    context: Option<Value>,
    options: Value,
}

#[derive(Debug, Serialize)]
pub struct OpenClawResponse {
    pub success: bool,
    pub message: String,
    pub response: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChallengePayload {
    nonce: String,
    #[allow(dead_code)]
    ts: i64,
}

#[derive(Debug, Deserialize)]
struct ChallengeEvent {
    #[allow(dead_code)]
    #[serde(rename = "type")]
    event_type: String,
    event: String,
    payload: ChallengePayload,
}

#[derive(Debug, Default, PartialEq, Eq)]
struct GatewayFrame {
    text: Option<String>,
    error: Option<String>,
    done: bool,
}

fn gateway_url_candidates(gateway_url: &str) -> Vec<String> {
    let mut url = gateway_url.trim().trim_end_matches('/').to_string();

    if let Some(rest) = url.strip_prefix("http://") {
        url = format!("ws://{}", rest);
    } else if let Some(rest) = url.strip_prefix("https://") {
        url = format!("wss://{}", rest);
    }

    let mut candidates = vec![url.clone()];
    let without_scheme = url.split_once("://").map(|(_, rest)| rest).unwrap_or(&url);
    if !without_scheme.contains('/') {
        candidates.push(format!("{}/ws/chat", url));
    }

    candidates
}

fn string_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }

    current.as_str().map(str::trim).filter(|s| !s.is_empty())
}

fn push_text_piece(pieces: &mut Vec<String>, text: &str) {
    if pieces.last().map(|last| last == text).unwrap_or(false) {
        return;
    }

    pieces.push(text.to_string());
}

fn text_from_json(value: &Value) -> Option<String> {
    const RESPONSE_PATHS: &[&[&str]] = &[
        &["payload", "text"],
        &["payload", "content"],
        &["payload", "response"],
        &["payload", "message"],
        &["payload", "delta"],
        &["data", "text"],
        &["data", "content"],
        &["data", "response"],
        &["data", "message"],
        &["data", "delta"],
        &["result", "text"],
        &["result", "content"],
        &["result", "response"],
        &["message", "content"],
        &["delta", "content"],
        &["content"],
        &["text"],
        &["response"],
        &["answer"],
        &["delta"],
    ];

    let mut pieces = Vec::new();
    for path in RESPONSE_PATHS {
        if let Some(text) = string_at_path(value, path) {
            push_text_piece(&mut pieces, text);
        }
    }

    if let Some(choices) = value.get("choices").and_then(Value::as_array) {
        for choice in choices {
            for path in [
                &["delta", "content"][..],
                &["message", "content"][..],
                &["text"][..],
            ] {
                if let Some(text) = string_at_path(choice, path) {
                    push_text_piece(&mut pieces, text);
                }
            }
        }
    }

    if pieces.is_empty() {
        None
    } else {
        Some(pieces.join(""))
    }
}

fn lower_string_at_path(value: &Value, path: &[&str]) -> Option<String> {
    string_at_path(value, path).map(|s| s.to_ascii_lowercase())
}

fn json_is_done(value: &Value) -> bool {
    if value.get("done").and_then(Value::as_bool) == Some(true)
        || value.get("finished").and_then(Value::as_bool) == Some(true)
    {
        return true;
    }

    for path in [&["type"][..], &["event"][..]] {
        if let Some(kind) = lower_string_at_path(value, path) {
            if kind == "response"
                || kind == "error"
                || kind.contains("finish")
                || kind.contains("finished")
                || kind.contains("complete")
                || kind.contains("completed")
                || kind.contains("done")
                || kind.contains("stop")
            {
                return true;
            }
        }
    }

    if let Some(status) = lower_string_at_path(value, &["status"]) {
        if status == "done" || status == "finished" || status == "error" || status == "failed" {
            return true;
        }
    }

    for path in [&["finish_reason"][..], &["reason"][..]] {
        if let Some(reason) = lower_string_at_path(value, path) {
            if reason != "null" {
                return true;
            }
        }
    }

    value
        .get("choices")
        .and_then(Value::as_array)
        .map(|choices| {
            choices.iter().any(|choice| {
                choice
                    .get("finish_reason")
                    .and_then(Value::as_str)
                    .map(|reason| !reason.trim().is_empty())
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn error_from_json(value: &Value) -> Option<String> {
    let is_error = lower_string_at_path(value, &["type"])
        .or_else(|| lower_string_at_path(value, &["event"]))
        .or_else(|| lower_string_at_path(value, &["status"]))
        .map(|kind| kind.contains("error") || kind.contains("failed"))
        .unwrap_or(false)
        || value.get("error").is_some();

    if !is_error {
        return None;
    }

    const ERROR_PATHS: &[&[&str]] = &[
        &["payload", "message"],
        &["payload", "error"],
        &["error", "message"],
        &["error", "code"],
        &["message"],
        &["error"],
    ];

    for path in ERROR_PATHS {
        if let Some(text) = string_at_path(value, path) {
            return Some(text.to_string());
        }
    }

    Some(value.to_string())
}

fn explain_gateway_error(error: &str) -> String {
    if error.contains("operator.write") {
        return format!(
            "OpenClaw Gateway已连接，但当前Token缺少 operator.write 权限，无法发起AI对话。新版Gateway的gateway.auth.token通常只能用于连接/引导授权，需要在OpenClaw Control里为本应用配对设备，或提供带operator.write权限的设备授权。原始错误: {}",
            error
        );
    }

    if error.contains("operator.read") {
        return format!(
            "OpenClaw Gateway已连接，但当前Token缺少 operator.read 权限，无法读取AI会话结果。请使用带operator.read/operator.write权限的设备授权。原始错误: {}",
            error
        );
    }

    if error.contains("device identity required") || error.contains("DEVICE_IDENTITY_REQUIRED") {
        return format!(
            "OpenClaw Gateway需要设备身份授权，单独的Gateway Token不足以调用AI。请先在OpenClaw Control中完成设备配对。原始错误: {}",
            error
        );
    }

    error.to_string()
}

fn is_gateway_response_for(value: &Value, request_id: &str) -> bool {
    value.get("type").and_then(Value::as_str) == Some("res")
        && value.get("id").and_then(Value::as_str) == Some(request_id)
}

fn gateway_response_ok(value: &Value) -> bool {
    value.get("ok").and_then(Value::as_bool) == Some(true)
}

fn gateway_response_payload(value: &Value) -> Option<&Value> {
    value.get("payload")
}

fn session_key_from_hello(payload: &Value) -> String {
    for path in [
        &["snapshot", "sessionDefaults", "mainSessionKey"][..],
        &["snapshot", "sessionDefaults", "mainKey"][..],
        &["snapshot", "sessionDefaults", "sessionKey"][..],
        &["session", "key"][..],
        &["key"][..],
    ] {
        if let Some(session_key) = string_at_path(payload, path) {
            return session_key.to_string();
        }
    }

    "main".to_string()
}

fn text_from_content(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => {
            let text = text.trim();
            if text.is_empty() {
                None
            } else {
                Some(text.to_string())
            }
        }
        Value::Array(items) => {
            let mut pieces = Vec::new();
            for item in items {
                if let Some(text) = text_from_json(item)
                    .or_else(|| item.get("text").and_then(text_from_content))
                    .or_else(|| item.get("content").and_then(text_from_content))
                {
                    push_text_piece(&mut pieces, &text);
                }
            }

            if pieces.is_empty() {
                None
            } else {
                Some(pieces.join("\n"))
            }
        }
        Value::Object(_) => text_from_json(value),
        _ => None,
    }
}

fn assistant_text_from_history(payload: &Value) -> Option<String> {
    let messages = payload.get("messages").and_then(Value::as_array)?;

    for message in messages.iter().rev() {
        let role = message
            .get("role")
            .and_then(Value::as_str)
            .map(|role| role.to_ascii_lowercase());

        if role.as_deref() != Some("assistant") {
            continue;
        }

        if let Some(text) = text_from_json(message)
            .or_else(|| message.get("content").and_then(text_from_content))
            .or_else(|| message.get("text").and_then(text_from_content))
        {
            let text = text.trim();
            if !text.is_empty() && text != "NO_REPLY" {
                return Some(text.to_string());
            }
        }
    }

    None
}

fn parse_gateway_frame(raw: &str) -> GatewayFrame {
    let text = raw.trim();
    if text.is_empty() {
        return GatewayFrame::default();
    }

    if text == "__finish__" || text == "__stop__" {
        return GatewayFrame {
            done: true,
            ..GatewayFrame::default()
        };
    }

    if let Ok(value) = serde_json::from_str::<Value>(text) {
        let error = error_from_json(&value);
        return GatewayFrame {
            text: if error.is_some() {
                None
            } else {
                text_from_json(&value)
            },
            error,
            done: json_is_done(&value),
        };
    }

    if text.starts_with("__auth__") || text.contains("connect.challenge") {
        return GatewayFrame::default();
    }

    GatewayFrame {
        text: Some(text.to_string()),
        ..GatewayFrame::default()
    }
}

#[tauri::command]
pub async fn openclaw_chat(
    gateway_url: String,
    gateway_token: String,
    text: String,
    context: Option<String>,
) -> Result<OpenClawResponse, String> {
    let mut last_connect_error = None;
    let mut connected = None;
    for url in gateway_url_candidates(&gateway_url) {
        println!("[OpenClaw] Connecting to: {}", url);
        match tokio_tungstenite::connect_async(&url).await {
            Ok((ws, _)) => {
                connected = Some((url, ws));
                break;
            }
            Err(e) => {
                println!("[OpenClaw] Connect failed: {}", e);
                last_connect_error = Some(e.to_string());
            }
        }
    }

    let (url, ws) = connected.ok_or_else(|| {
        format!(
            "WebSocket连接失败: {}",
            last_connect_error.unwrap_or_else(|| "Gateway地址为空或不可用".to_string())
        )
    })?;

    println!("[OpenClaw] Connected successfully: {}", url);

    let (mut write, mut read) = ws.split();

    let challenge_timeout = Duration::from_secs(5);
    let start_time = Instant::now();
    let mut auth_sent = false;
    let mut uses_gateway_v3 = false;
    let mut gateway_v3_session_key = "main".to_string();

    println!("[OpenClaw] Waiting for challenge...");
    while start_time.elapsed() < challenge_timeout && !auth_sent {
        match tokio::time::timeout(Duration::from_millis(500), read.next()).await {
            Ok(Some(Ok(msg))) => {
                println!("[OpenClaw] Got message: {:?}", msg);

                if let tokio_tungstenite::tungstenite::Message::Text(text) = msg {
                    println!("[OpenClaw] Text message: {}", text);

                    if let Ok(event) = serde_json::from_str::<ChallengeEvent>(&text) {
                        println!("[OpenClaw] Challenge event: {:?}", event);
                        if event.event == "connect.challenge" {
                            println!("[OpenClaw] Got challenge, nonce: {}", event.payload.nonce);

                            let connect_id = Uuid::new_v4().to_string();
                            let connect_request = json!({
                                "type": "req",
                                "id": connect_id,
                                "method": "connect",
                                "params": {
                                    "minProtocol": 3,
                                    "maxProtocol": 3,
                                    "client": {
                                        "id": "gateway-client",
                                        "version": "tl-monitor-tauri",
                                        "platform": "tauri",
                                        "mode": "backend"
                                    },
                                    "role": "operator",
                                    "scopes": ["operator.read", "operator.write"],
                                    "caps": ["tool-events"],
                                    "auth": {
                                        "token": gateway_token
                                    },
                                    "userAgent": "tl-monitor-tauri",
                                    "locale": "zh-CN"
                                }
                            })
                            .to_string();
                            println!("[OpenClaw] Sending Gateway v3 connect...");

                            write
                                .send(tokio_tungstenite::tungstenite::Message::Text(
                                    connect_request.into(),
                                ))
                                .await
                                .map_err(|e| format!("发送认证失败: {}", e))?;

                            let connect_start = Instant::now();
                            while connect_start.elapsed() < Duration::from_secs(8) {
                                match tokio::time::timeout(Duration::from_millis(500), read.next())
                                    .await
                                {
                                    Ok(Some(Ok(
                                        tokio_tungstenite::tungstenite::Message::Text(text),
                                    ))) => {
                                        println!(
                                            "[OpenClaw] Gateway v3 connect response: {}",
                                            text
                                        );

                                        if let Ok(value) = serde_json::from_str::<Value>(&text) {
                                            if is_gateway_response_for(&value, &connect_id) {
                                                if gateway_response_ok(&value) {
                                                    auth_sent = true;
                                                    uses_gateway_v3 = true;
                                                    gateway_v3_session_key =
                                                        gateway_response_payload(&value)
                                                            .map(session_key_from_hello)
                                                            .unwrap_or_else(|| "main".to_string());
                                                    println!(
                                                        "[OpenClaw] Gateway v3 connected, session: {}",
                                                        gateway_v3_session_key
                                                    );
                                                    break;
                                                }

                                                let error =
                                                    error_from_json(&value).unwrap_or_else(|| {
                                                        "Gateway connect失败".to_string()
                                                    });
                                                return Ok(OpenClawResponse {
                                                    success: false,
                                                    message: explain_gateway_error(&error),
                                                    response: None,
                                                });
                                            }
                                        }
                                    }
                                    Ok(Some(Ok(
                                        tokio_tungstenite::tungstenite::Message::Close(close),
                                    ))) => {
                                        let reason = close
                                            .map(|frame| frame.reason.to_string())
                                            .filter(|reason| !reason.trim().is_empty())
                                            .unwrap_or_else(|| "连接已关闭".to_string());
                                        return Ok(OpenClawResponse {
                                            success: false,
                                            message: explain_gateway_error(&reason),
                                            response: None,
                                        });
                                    }
                                    Ok(Some(Ok(other))) => {
                                        println!(
                                            "[OpenClaw] Gateway v3 connect other message: {:?}",
                                            other
                                        );
                                    }
                                    Ok(Some(Err(e))) => {
                                        return Ok(OpenClawResponse {
                                            success: false,
                                            message: format!("Gateway connect读取失败: {}", e),
                                            response: None,
                                        });
                                    }
                                    Err(_) => {}
                                    _ => {}
                                }
                            }

                            if !auth_sent {
                                return Ok(OpenClawResponse {
                                    success: false,
                                    message: "Gateway v3 connect未收到有效响应".to_string(),
                                    response: None,
                                });
                            }

                            break;
                        }
                    }
                }
            }
            Ok(Some(Err(e))) => {
                println!("[OpenClaw] Read error: {}", e);
            }
            Err(_) => {
                println!("[OpenClaw] Timeout waiting for challenge...");
            }
            _ => {}
        }
    }

    if !auth_sent {
        println!("[OpenClaw] No challenge received, sending auth anyway...");
        let auth_msg = format!("__auth__:{}", gateway_token);
        write
            .send(tokio_tungstenite::tungstenite::Message::Text(
                auth_msg.into(),
            ))
            .await
            .map_err(|e| format!("发送认证失败: {}", e))?;
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    let system_prompt = context.unwrap_or_else(|| {
        "你是TL（火炬之光）游戏的经济分析专家。请基于提供的火价和物品数据，给出专业的交易建议。回答要求简洁专业，使用中文。".to_string()
    });

    let full_content = format!("{}\n\n{}", system_prompt, text);

    if uses_gateway_v3 {
        let send_id = Uuid::new_v4().to_string();
        let run_id = Uuid::new_v4().to_string();
        let send_request = json!({
            "type": "req",
            "id": send_id,
            "method": "chat.send",
            "params": {
                "sessionKey": gateway_v3_session_key,
                "message": full_content,
                "deliver": false,
                "idempotencyKey": run_id
            }
        })
        .to_string();

        println!("[OpenClaw] Sending Gateway v3 chat.send");
        write
            .send(tokio_tungstenite::tungstenite::Message::Text(
                send_request.into(),
            ))
            .await
            .map_err(|e| format!("发送消息失败: {}", e))?;

        let send_start = Instant::now();
        let mut send_ok = false;
        while send_start.elapsed() < Duration::from_secs(15) {
            match tokio::time::timeout(Duration::from_secs(2), read.next()).await {
                Ok(Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text)))) => {
                    println!("[OpenClaw] Gateway v3 received: {}", text);
                    if let Ok(value) = serde_json::from_str::<Value>(&text) {
                        if is_gateway_response_for(&value, &send_id) {
                            if gateway_response_ok(&value) {
                                send_ok = true;
                                break;
                            }

                            let error = error_from_json(&value)
                                .unwrap_or_else(|| "Gateway chat.send失败".to_string());
                            return Ok(OpenClawResponse {
                                success: false,
                                message: explain_gateway_error(&error),
                                response: None,
                            });
                        }

                        if let Some(chunk) = text_from_json(&value) {
                            if !chunk.trim().is_empty() {
                                return Ok(OpenClawResponse {
                                    success: true,
                                    message: "Success".to_string(),
                                    response: Some(chunk),
                                });
                            }
                        }
                    }
                }
                Ok(Some(Ok(tokio_tungstenite::tungstenite::Message::Close(_)))) => {
                    return Ok(OpenClawResponse {
                        success: false,
                        message: "Gateway在发送AI请求后关闭连接".to_string(),
                        response: None,
                    });
                }
                Ok(Some(Ok(other))) => {
                    println!("[OpenClaw] Gateway v3 other message: {:?}", other);
                }
                Ok(Some(Err(e))) => {
                    return Ok(OpenClawResponse {
                        success: false,
                        message: format!("Gateway读取失败: {}", e),
                        response: None,
                    });
                }
                Err(_) => {}
                _ => {}
            }
        }

        if !send_ok {
            return Ok(OpenClawResponse {
                success: false,
                message: "Gateway chat.send未收到有效响应".to_string(),
                response: None,
            });
        }

        let history_timeout = Duration::from_secs(60);
        let history_start = Instant::now();
        while history_start.elapsed() < history_timeout {
            let history_id = Uuid::new_v4().to_string();
            let history_request = json!({
                "type": "req",
                "id": history_id,
                "method": "chat.history",
                "params": {
                    "sessionKey": gateway_v3_session_key,
                    "limit": 20
                }
            })
            .to_string();

            write
                .send(tokio_tungstenite::tungstenite::Message::Text(
                    history_request.into(),
                ))
                .await
                .map_err(|e| format!("读取AI结果失败: {}", e))?;

            let poll_start = Instant::now();
            while poll_start.elapsed() < Duration::from_secs(5) {
                match tokio::time::timeout(Duration::from_secs(2), read.next()).await {
                    Ok(Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text)))) => {
                        println!("[OpenClaw] Gateway v3 history received: {}", text);
                        if let Ok(value) = serde_json::from_str::<Value>(&text) {
                            if is_gateway_response_for(&value, &history_id) {
                                if gateway_response_ok(&value) {
                                    if let Some(response) = gateway_response_payload(&value)
                                        .and_then(assistant_text_from_history)
                                    {
                                        return Ok(OpenClawResponse {
                                            success: true,
                                            message: "Success".to_string(),
                                            response: Some(response),
                                        });
                                    }
                                    break;
                                }

                                let error = error_from_json(&value)
                                    .unwrap_or_else(|| "Gateway chat.history失败".to_string());
                                return Ok(OpenClawResponse {
                                    success: false,
                                    message: explain_gateway_error(&error),
                                    response: None,
                                });
                            }

                            if let Some(chunk) = text_from_json(&value) {
                                if !chunk.trim().is_empty() {
                                    return Ok(OpenClawResponse {
                                        success: true,
                                        message: "Success".to_string(),
                                        response: Some(chunk),
                                    });
                                }
                            }
                        }
                    }
                    Ok(Some(Ok(tokio_tungstenite::tungstenite::Message::Close(_)))) => {
                        return Ok(OpenClawResponse {
                            success: false,
                            message: "Gateway在读取AI结果时关闭连接".to_string(),
                            response: None,
                        });
                    }
                    Ok(Some(Ok(other))) => {
                        println!("[OpenClaw] Gateway v3 history other message: {:?}", other);
                    }
                    Ok(Some(Err(e))) => {
                        return Ok(OpenClawResponse {
                            success: false,
                            message: format!("读取AI结果失败: {}", e),
                            response: None,
                        });
                    }
                    Err(_) => break,
                    _ => break,
                }
            }

            tokio::time::sleep(Duration::from_secs(2)).await;
        }

        return Ok(OpenClawResponse {
            success: false,
            message: "AI请求已发送，但未在60秒内读取到助手回复".to_string(),
            response: None,
        });
    }

    let request = ChatRequest {
        msg_type: "chat".to_string(),
        payload: ChatPayload {
            text: full_content,
            context: Some(json!({
                "source": "tl-monitor",
                "context": system_prompt,
            })),
            options: json!({
                "model": "MiniMax-M2.7",
            }),
        },
    };

    let request_json =
        serde_json::to_string(&request).map_err(|e| format!("序列化消息失败: {}", e))?;

    println!("[OpenClaw] Sending chat: {}", request_json);

    write
        .send(tokio_tungstenite::tungstenite::Message::Text(
            request_json.into(),
        ))
        .await
        .map_err(|e| format!("发送消息失败: {}", e))?;

    println!("[OpenClaw] Waiting for response...");

    let mut response_text = String::new();
    let mut last_error = None;
    let chat_timeout = Duration::from_secs(60);
    let chat_start = Instant::now();

    while chat_start.elapsed() < chat_timeout {
        match tokio::time::timeout(Duration::from_secs(2), read.next()).await {
            Ok(Some(Ok(msg))) => match msg {
                tokio_tungstenite::tungstenite::Message::Text(text) => {
                    println!("[OpenClaw] Received: {}", text);

                    let frame = parse_gateway_frame(&text);
                    if let Some(error) = frame.error {
                        println!("[OpenClaw] Gateway error: {}", error);
                        last_error = Some(error);
                    }

                    if let Some(chunk) = frame.text {
                        response_text.push_str(&chunk);
                    }

                    if frame.done {
                        println!("[OpenClaw] Response complete");
                        break;
                    }
                }
                tokio_tungstenite::tungstenite::Message::Close(_) => {
                    println!("[OpenClaw] Connection closed");
                    break;
                }
                other => {
                    println!("[OpenClaw] Other message: {:?}", other);
                }
            },
            Ok(Some(Err(e))) => {
                println!("[OpenClaw] Error: {}", e);
            }
            Err(_) => {}
            _ => {}
        }
    }

    println!("[OpenClaw] Final response: {} chars", response_text.len());

    if response_text.is_empty() {
        return Ok(OpenClawResponse {
            success: false,
            message: last_error.unwrap_or_else(|| "未收到有效响应".to_string()),
            response: None,
        });
    }

    Ok(OpenClawResponse {
        success: true,
        message: "Success".to_string(),
        response: Some(response_text),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_gateway_base_url_first_and_keeps_legacy_fallback() {
        assert_eq!(
            gateway_url_candidates("http://localhost:18789"),
            vec![
                "ws://localhost:18789".to_string(),
                "ws://localhost:18789/ws/chat".to_string()
            ]
        );
        assert_eq!(
            gateway_url_candidates("ws://localhost:18789/ws/chat"),
            vec!["ws://localhost:18789/ws/chat".to_string()]
        );
    }

    #[test]
    fn parses_openclaw_payload_response() {
        let frame = parse_gateway_frame(
            r#"{"type":"response","id":"1","payload":{"text":"你好","tokens_used":2}}"#,
        );
        assert_eq!(
            frame,
            GatewayFrame {
                text: Some("你好".to_string()),
                error: None,
                done: true,
            }
        );
    }

    #[test]
    fn parses_openai_style_stream_chunk() {
        let frame = parse_gateway_frame(
            r#"{"choices":[{"delta":{"content":"火价上涨"},"finish_reason":null}]}"#,
        );
        assert_eq!(
            frame,
            GatewayFrame {
                text: Some("火价上涨".to_string()),
                error: None,
                done: false,
            }
        );
    }

    #[test]
    fn parses_gateway_error_message() {
        let frame = parse_gateway_frame(
            r#"{"type":"error","payload":{"code":"AUTH","message":"Token无效"}}"#,
        );
        assert_eq!(
            frame,
            GatewayFrame {
                text: None,
                error: Some("Token无效".to_string()),
                done: true,
            }
        );
    }

    #[test]
    fn does_not_finish_on_non_response_completed_status() {
        let frame =
            parse_gateway_frame(r#"{"type":"tool_result","status":"completed","payload":{}}"#);
        assert_eq!(frame, GatewayFrame::default());
    }

    #[test]
    fn treats_plain_text_as_response_chunk() {
        let frame = parse_gateway_frame("普通文本回复");
        assert_eq!(
            frame,
            GatewayFrame {
                text: Some("普通文本回复".to_string()),
                error: None,
                done: false,
            }
        );
    }

    #[test]
    fn explains_missing_gateway_write_scope() {
        let message = explain_gateway_error("missing scope: operator.write");
        assert!(message.contains("operator.write"));
        assert!(message.contains("无法发起AI对话"));
    }

    #[test]
    fn extracts_session_key_from_gateway_hello() {
        let payload = json!({
            "snapshot": {
                "sessionDefaults": {
                    "mainSessionKey": "agent:main:session-1"
                }
            }
        });

        assert_eq!(session_key_from_hello(&payload), "agent:main:session-1");
    }

    #[test]
    fn extracts_latest_assistant_text_from_history() {
        let payload = json!({
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": "ping"}]
                },
                {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "收到"}]
                }
            ]
        });

        assert_eq!(
            assistant_text_from_history(&payload),
            Some("收到".to_string())
        );
    }
}
