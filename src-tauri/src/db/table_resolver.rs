/// Table resolver for season/mode split tables.
/// Maps season_id + market_mode to specific table names.
/// 
/// Table naming convention:
/// - Real-time tables (no season suffix): items_normal, items_expert, fire_price_normal, fire_price_expert
/// - Snapshot tables (with season suffix): item_snapshots_ss{season}_{mode}, fire_price_snapshots_ss{season}_{mode}
pub struct TableResolver;

impl TableResolver {
    /// Get items table name for given market_mode (real-time, no season suffix)
    pub fn items_table(_season_id: &str, market_mode: &str) -> String {
        let mode_suffix = match market_mode {
            "season_expert" | "expert" => "expert",
            _ => "normal",
        };
        format!("items_{}", mode_suffix)
    }

    /// Get fire price table name for given market_mode (real-time, no season suffix)
    pub fn fire_price_table(_season_id: &str, market_mode: &str) -> String {
        let mode_suffix = match market_mode {
            "season_expert" | "expert" => "expert",
            _ => "normal",
        };
        format!("fire_price_{}", mode_suffix)
    }

    /// Get item snapshots table name for given season and mode (historical, with season suffix)
    pub fn item_snapshots_table(season_id: &str, market_mode: &str) -> String {
        let mode_suffix = match market_mode {
            "season_expert" | "expert" => "expert",
            _ => "normal",
        };
        format!("item_snapshots_{}_{}", season_id, mode_suffix)
    }

    /// Get fire price snapshots table name for given season and mode (historical, with season suffix)
    pub fn fire_price_snapshots_table(season_id: &str, market_mode: &str) -> String {
        let mode_suffix = match market_mode {
            "season_expert" | "expert" => "expert",
            _ => "normal",
        };
        format!("fire_price_snapshots_{}_{}", season_id, mode_suffix)
    }

    /// Get item realtime fire prices table name.
    /// This table stores fire price changes for the last 3 hours for quick deal hunting.
    pub fn realtime_fire_prices_table() -> String {
        "item_realtime_fire_prices".to_string()
    }

    /// List all supported season/mode combinations for snapshot tables.
    /// Returns static combinations for compile-time usage.
    /// For dynamic season discovery at runtime, query the database seasons table.
    pub fn supported_combinations() -> Vec<(&'static str, &'static str)> {
        vec![
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
        let is_valid_mode = matches!(market_mode, "season_normal" | "normal" | "season_expert" | "expert");
        // Support any season_id matching "ss" + digits pattern (e.g., ss11, ss12, ss13)
        let is_valid_season = season_id.len() >= 3
            && &season_id[..2] == "ss"
            && season_id[2..].chars().all(|c| c.is_ascii_digit());
        is_valid_season && is_valid_mode
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
        assert_eq!(
            TableResolver::items_table("ss11", "normal"),
            "items_normal"
        );
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
    }
}
