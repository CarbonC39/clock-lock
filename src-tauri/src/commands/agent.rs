use futures_util::StreamExt as _;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Emitter as _;

#[derive(Serialize, Clone)]
struct ChatChunkEvent {
    id: String,
    content: String,
}

#[derive(Serialize, Clone)]
struct ChatDoneEvent {
    id: String,
}

#[derive(Serialize, Clone)]
struct ChatErrorEvent {
    id: String,
    error: String,
}

#[derive(Deserialize)]
pub struct ApiMessage {
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub async fn chat_stream(
    app: tauri::AppHandle,
    msg_id: String,
    messages: Vec<ApiMessage>,
    base_url: String,
    api_key: String,
    model: String,
    max_tokens: u32,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let endpoint = format!(
        "{}/chat/completions",
        base_url.trim_end_matches('/')
    );

    let body = serde_json::json!({
        "model": model,
        "messages": messages.iter().map(|m| serde_json::json!({
            "role": m.role,
            "content": m.content,
        })).collect::<Vec<_>>(),
        "stream": true,
        "temperature": 0.7,
        "max_tokens": max_tokens,
    });

    let mut req = client
        .post(&endpoint)
        .header("Content-Type", "application/json");

    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = req
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        let err = format!("API error {status}: {body}");
        app.emit("chat-error", ChatErrorEvent { id: msg_id, error: err.clone() }).ok();
        return Err(err);
    }

    let mut stream = response.bytes_stream();
    let mut buf = String::new();

    'outer: while let Some(item) = stream.next().await {
        let bytes = item.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        // Process complete SSE events (delimited by \n\n)
        while let Some(pos) = buf.find("\n\n") {
            let event = buf[..pos].to_string();
            buf = buf[pos + 2..].to_string();

            for line in event.lines() {
                let Some(data) = line.trim().strip_prefix("data: ") else { continue };
                if data == "[DONE]" {
                    break 'outer;
                }

                let Ok(json) = serde_json::from_str::<Value>(data) else { continue };
                if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                    if !content.is_empty() {
                        app.emit(
                            "chat-chunk",
                            ChatChunkEvent {
                                id: msg_id.clone(),
                                content: content.to_string(),
                            },
                        )
                        .ok();
                    }
                }
            }
        }
    }

    app.emit("chat-done", ChatDoneEvent { id: msg_id }).ok();
    Ok(())
}
