use bcrypt::{hash, verify, DEFAULT_COST};

/// Check if a password string is already bcrypt-hashed
pub fn is_hashed(password: &str) -> bool {
    password.starts_with("$2")
}

/// Hash a plaintext password using bcrypt
pub fn hash_password(password: &str) -> Result<String, String> {
    hash(password, DEFAULT_COST).map_err(|e| format!("密码哈希失败: {}", e))
}

/// Verify a password against a stored hash (or plaintext for backward compatibility)
pub fn verify_password(input: &str, stored: &str) -> Result<(), String> {
    if stored.is_empty() {
        return Err("管理员密码未设置".to_string());
    }

    if is_hashed(stored) {
        // Stored password is bcrypt-hashed
        if verify(input, stored).map_err(|e| format!("密码验证失败: {}", e))? {
            Ok(())
        } else {
            Err("密码错误".to_string())
        }
    } else {
        // Backward compatibility: plaintext comparison
        // Warn but allow login so user can update password
        if input == stored {
            tracing::warn!("管理员密码以明文存储，建议通过管理面板更新密码以启用哈希保护");
            Ok(())
        } else {
            Err("密码错误".to_string())
        }
    }
}
