/// Table resolver for season/mode split tables.
/// Maps season_id + market_mode to specific table names.
///
/// Table naming convention:
/// - Real-time tables (no season suffix): items_normal, items_expert, fire_price_normal, fire_price_expert
/// - Snapshot tables (with season suffix): item_snapshots_ss{season}_{mode}, fire_price_snapshots_ss{season}_{mode}
pub struct TableResolver;

impl TableResolver {
    /// Validate SQL identifiers used for generated table names.
    /// SQLite cannot bind table names, so dynamic table identifiers must be
    /// restricted to a small ASCII subset before being interpolated into SQL.
    pub fn is_safe_identifier(identifier: &str) -> bool {
        !identifier.is_empty()
            && identifier
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_')
    }

    fn checked_identifier(identifier: String) -> String {
        assert!(
            Self::is_safe_identifier(&identifier),
            "Unsafe generated SQL identifier '{}'",
            identifier
        );
        identifier
    }

    /// Extract mode suffix from market_mode string
    #[inline]
    fn mode_suffix(market_mode: &str) -> &'static str {
        match market_mode {
            "season_expert" | "expert" => "expert",
            _ => "normal",
        }
    }

    /// Get items table name for given market_mode (real-time, no season suffix)
    pub fn items_table(season_id: &str, market_mode: &str) -> String {
        assert!(
            Self::is_supported(season_id, market_mode),
            "Invalid season_id '{}' or market_mode '{}'",
            season_id,
            market_mode
        );
        Self::checked_identifier(format!("items_{}", Self::mode_suffix(market_mode)))
    }

    /// Get fire price table name for given market_mode (real-time, no season suffix)
    pub fn fire_price_table(season_id: &str, market_mode: &str) -> String {
        assert!(
            Self::is_supported(season_id, market_mode),
            "Invalid season_id '{}' or market_mode '{}'",
            season_id,
            market_mode
        );
        Self::checked_identifier(format!("fire_price_{}", Self::mode_suffix(market_mode)))
    }

    /// Get item snapshots table name for given season and mode (historical, with season suffix)
    pub fn item_snapshots_table(season_id: &str, market_mode: &str) -> String {
        assert!(
            Self::is_supported(season_id, market_mode),
            "Invalid season_id '{}' or market_mode '{}'",
            season_id,
            market_mode
        );
        Self::checked_identifier(format!(
            "item_snapshots_{}_{}",
            season_id,
            Self::mode_suffix(market_mode)
        ))
    }

    /// Get fire price snapshots table name for given season and mode (historical, with season suffix)
    pub fn fire_price_snapshots_table(season_id: &str, market_mode: &str) -> String {
        assert!(
            Self::is_supported(season_id, market_mode),
            "Invalid season_id '{}' or market_mode '{}'",
            season_id,
            market_mode
        );
        Self::checked_identifier(format!(
            "fire_price_snapshots_{}_{}",
            season_id,
            Self::mode_suffix(market_mode)
        ))
    }

    /// List all supported season/mode combinations for snapshot tables.
    /// Returns static combinations for compile-time usage.
    /// For dynamic season discovery at runtime, query the database seasons table.
    pub fn supported_combinations() -> Vec<(&'static str, &'static str)> {
        vec![
            ("ss13", "season_normal"),
            ("ss13", "season_expert"),
            ("ss12", "season_normal"),
            ("ss12", "season_expert"),
            ("ss11", "season_normal"),
            ("ss11", "season_expert"),
        ]
    }

    /// Check if a season/mode combination is supported.
    /// Returns true for any season_id starting with "ss" followed by digits
    /// and a valid market_mode (season_normal, normal, season_expert, expert).
    pub fn is_supported(season_id: &str, market_mode: &str) -> bool {
        // Check market_mode is valid
        let is_valid_mode = matches!(
            market_mode,
            "season_normal" | "normal" | "season_expert" | "expert"
        );
        // Support any season_id matching "ss" + digits pattern (e.g., ss11, ss12, ss13)
        let is_valid_season = season_id
            .strip_prefix("ss")
            .is_some_and(|suffix| !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit()));
        is_valid_season && is_valid_mode
    }

    /// Validate season_id and market_mode, returning an error if invalid.
    /// This should be called before using any table name in SQL queries.
    pub fn validate(
        season_id: &str,
        market_mode: &str,
    ) -> Result<(), crate::core::errors::AppError> {
        if !Self::is_supported(season_id, market_mode) {
            return Err(crate::core::errors::AppError::Validation(format!(
                "Invalid season_id '{}' or market_mode '{}'",
                season_id, market_mode
            )));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_items_table() {
        // Real-time tables: no season suffix
        assert_eq!(
            TableResolver::items_table("ss12", "season_normal"),
            "items_normal"
        );
        assert_eq!(
            TableResolver::items_table("ss12", "season_expert"),
            "items_expert"
        );
        assert_eq!(TableResolver::items_table("ss11", "normal"), "items_normal");
    }

    #[test]
    fn test_fire_price_table() {
        // Real-time tables: no season suffix
        assert_eq!(
            TableResolver::fire_price_table("ss12", "season_normal"),
            "fire_price_normal"
        );
        assert_eq!(
            TableResolver::fire_price_table("ss11", "expert"),
            "fire_price_expert"
        );
    }

    #[test]
    fn test_item_snapshots_table() {
        // Snapshot tables: with season suffix
        assert_eq!(
            TableResolver::item_snapshots_table("ss12", "season_normal"),
            "item_snapshots_ss12_normal"
        );
        assert_eq!(
            TableResolver::item_snapshots_table("ss11", "expert"),
            "item_snapshots_ss11_expert"
        );
    }

    #[test]
    fn test_fire_price_snapshots_table() {
        // Snapshot tables: with season suffix
        assert_eq!(
            TableResolver::fire_price_snapshots_table("ss12", "season_normal"),
            "fire_price_snapshots_ss12_normal"
        );
        assert_eq!(
            TableResolver::fire_price_snapshots_table("ss11", "expert"),
            "fire_price_snapshots_ss11_expert"
        );
    }

    #[test]
    fn test_is_supported() {
        assert!(TableResolver::is_supported("ss12", "season_normal"));
        assert!(TableResolver::is_supported("ss12", "season_expert"));
        assert!(TableResolver::is_supported("ss11", "normal"));
        assert!(TableResolver::is_supported("ss13", "season_normal"));
        assert!(TableResolver::is_supported("ss99", "season_expert"));
        assert!(!TableResolver::is_supported("ss10", "invalid_mode"));
        assert!(!TableResolver::is_supported("invalid", "season_normal"));
        assert!(!TableResolver::is_supported("s1", "season_normal"));
        assert!(!TableResolver::is_supported("赛季12", "season_normal"));
        assert!(!TableResolver::is_supported("ss", "season_normal"));
    }

    #[test]
    fn test_safe_identifier_validation() {
        assert!(TableResolver::is_safe_identifier(
            "item_snapshots_ss12_normal"
        ));
        assert!(TableResolver::is_safe_identifier("fire_price_expert"));
        assert!(!TableResolver::is_safe_identifier(""));
        assert!(!TableResolver::is_safe_identifier("item-snapshots"));
        assert!(!TableResolver::is_safe_identifier(
            "items_normal;DROP_TABLE"
        ));
        assert!(!TableResolver::is_safe_identifier("赛季12"));
    }
}
