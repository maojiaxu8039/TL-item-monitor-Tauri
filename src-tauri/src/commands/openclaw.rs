use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    #[serde(rename = "type")]
    msg_type: String,
    model: String,
    messages: Vec<ChatMessage>,
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

#[tauri::command]
pub async fn openclaw_chat(
    gateway_url: String,
    gateway_token: String,
    text: String,
    context: Option<String>,
) -> Result<OpenClawResponse, String> {
    let base_url = gateway_url.trim_end_matches('/');
    let url = format!("{}/ws/chat", base_url);

    println!("[OpenClaw] Connecting to: {}", url);

    let (ws, _) = tokio_tungstenite::connect_async(&url)
        .await
        .map_err(|e| format!("WebSocket连接失败: {}", e))?;

    println!("[OpenClaw] Connected successfully");

    let (mut write, mut read) = ws.split();

    let challenge_timeout = Duration::from_secs(5);
    let start_time = Instant::now();
    let mut auth_sent = false;

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

                            let auth_response = format!("__auth__:{}", gateway_token);
                            println!("[OpenClaw] Sending auth...");

                            write
                                .send(tokio_tungstenite::tungstenite::Message::Text(
                                    auth_response.into(),
                                ))
                                .await
                                .map_err(|e| format!("发送认证失败: {}", e))?;

                            auth_sent = true;
                            println!("[OpenClaw] Auth sent");
                            tokio::time::sleep(Duration::from_millis(500)).await;
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

    let request = ChatRequest {
        msg_type: "chat".to_string(),
        model: "MiniMax-M2.7".to_string(),
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: full_content,
        }],
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
    let chat_timeout = Duration::from_secs(60);
    let chat_start = Instant::now();

    while chat_start.elapsed() < chat_timeout {
        match tokio::time::timeout(Duration::from_secs(2), read.next()).await {
            Ok(Some(Ok(msg))) => match msg {
                tokio_tungstenite::tungstenite::Message::Text(text) => {
                    println!("[OpenClaw] Received: {}", text);

                    if text.contains("__finish__") || text.contains("__stop__") {
                        println!("[OpenClaw] Response complete");
                        break;
                    }

                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(content) = data
                            .get("content")
                            .or(data.get("text"))
                            .or(data.get("response"))
                        {
                            if let Some(s) = content.as_str() {
                                response_text.push_str(s);
                            }
                        }
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
            message: "未收到有效响应".to_string(),
            response: None,
        });
    }

    Ok(OpenClawResponse {
        success: true,
        message: "Success".to_string(),
        response: Some(response_text),
    })
}
