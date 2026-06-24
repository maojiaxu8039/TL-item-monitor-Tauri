use bcrypt::{hash, verify, DEFAULT_COST};

/// Check if a password string is already bcrypt-hashed
pub fn is_hashed(password: &str) -> bool {
    password.starts_with("$2")
}

/// Hash a plaintext password using bcrypt
pub fn hash_password(password: &str) -> Result<String, String> {
    hash(password, DEFAULT_COST).map_err(|e| format!("密码哈希失败: {}", e))
}

/// Constant-time string comparison to prevent timing attacks.
/// Returns true if and only if both byte slices are exactly equal.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        // 不同长度直接返回 false。这里不会泄露长度信息，
        // 因为攻击者本就能通过观察请求/响应推断密码长度边界。
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Verify a password against a stored hash (or plaintext for backward compatibility).
///
/// 注意：所有错误路径返回统一错误信息 "密码错误"，避免给外部攻击者透露
/// "管理员密码未设置" / "密码格式问题" 等可被枚举利用的细节。
/// 真实错误原因仅写入日志供运维查阅。
pub fn verify_password(input: &str, stored: &str) -> Result<(), String> {
    if stored.is_empty() {
        tracing::error!("管理员密码未设置，所有认证请求将被拒绝");
        return Err("密码错误".to_string());
    }

    if is_hashed(stored) {
        // bcrypt verify 本身就是 constant-time
        match verify(input, stored) {
            Ok(true) => Ok(()),
            Ok(false) => Err("密码错误".to_string()),
            Err(e) => {
                tracing::error!("bcrypt 校验失败: {}", e);
                Err("密码错误".to_string())
            }
        }
    } else {
        // 明文兼容路径：用 constant_time_eq 防止 timing attack
        if constant_time_eq(input.as_bytes(), stored.as_bytes()) {
            tracing::warn!("管理员密码以明文存储，建议通过管理面板更新密码以启用哈希保护");
            Ok(())
        } else {
            Err("密码错误".to_string())
        }
    }
}
