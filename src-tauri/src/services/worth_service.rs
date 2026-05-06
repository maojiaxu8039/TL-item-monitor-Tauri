#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum WorthStatus {
    Good,
    Consider,
    Bad,
    Unset,
}

impl std::fmt::Display for WorthStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorthStatus::Good => write!(f, "Good"),
            WorthStatus::Consider => write!(f, "Consider"),
            WorthStatus::Bad => write!(f, "Bad"),
            WorthStatus::Unset => write!(f, "Unset"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorthResult {
    pub status: WorthStatus,
    pub purchase_fire_price: Option<f64>,
    pub fire_per_10_more: Option<f64>,
    pub total_fire: f64,
    pub estimated_rmb: f64,
}

pub fn evaluate_worth(
    item_fire_price: f64,
    count: i32,
    purchase_fire_price: f64,
    consider_ratio: f64,
    fire_per_rmb: f64,
) -> WorthResult {
    let item_fire_price = item_fire_price.max(0.0);
    let purchase_fire_price = purchase_fire_price.max(0.0);

    if item_fire_price <= 0.0 || purchase_fire_price <= 0.0 {
        return WorthResult {
            status: WorthStatus::Unset,
            purchase_fire_price: None,
            fire_per_10_more: None,
            total_fire: 0.0,
            estimated_rmb: 0.0,
        };
    }

    let total_fire = item_fire_price * count as f64;
    let estimated_rmb = if fire_per_rmb > 0.0 {
        total_fire / fire_per_rmb
    } else {
        0.0
    };

    let fire_per_10_more = if item_fire_price > 0.0 {
        Some(10.0 / item_fire_price)
    } else {
        None
    };

    let status = if item_fire_price <= purchase_fire_price {
        WorthStatus::Good
    } else if item_fire_price <= purchase_fire_price * consider_ratio {
        WorthStatus::Consider
    } else {
        WorthStatus::Bad
    };

    WorthResult {
        status,
        purchase_fire_price: Some(purchase_fire_price),
        fire_per_10_more,
        total_fire,
        estimated_rmb,
    }
}

pub fn status_to_label(status: WorthStatus) -> &'static str {
    match status {
        WorthStatus::Good => "可买",
        WorthStatus::Consider => "可考虑",
        WorthStatus::Bad => "不值",
        WorthStatus::Unset => "未设置",
    }
}

pub fn status_to_color(status: WorthStatus) -> &'static str {
    match status {
        WorthStatus::Good => "green",
        WorthStatus::Consider => "orange",
        WorthStatus::Bad => "red",
        WorthStatus::Unset => "gray",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_worth_unset_when_zero_price() {
        let result = evaluate_worth(0.0, 1, 100.0, 1.15, 16.0);
        assert_eq!(result.status, WorthStatus::Unset);
        assert_eq!(result.total_fire, 0.0);
    }

    #[test]
    fn test_evaluate_worth_good_when_below_target() {
        let result = evaluate_worth(80.0, 1, 100.0, 1.15, 16.0);
        assert_eq!(result.status, WorthStatus::Good);
        assert!(result.total_fire > 0.0);
    }

    #[test]
    fn test_evaluate_worth_consider_when_within_ratio() {
        let result = evaluate_worth(110.0, 1, 100.0, 1.15, 16.0);
        assert_eq!(result.status, WorthStatus::Consider);
    }

    #[test]
    fn test_evaluate_worth_bad_when_above_ratio() {
        let result = evaluate_worth(130.0, 1, 100.0, 1.15, 16.0);
        assert_eq!(result.status, WorthStatus::Bad);
    }

    #[test]
    fn test_evaluate_worth_total_fire_calculation() {
        let result = evaluate_worth(50.0, 3, 100.0, 1.15, 16.0);
        assert_eq!(result.total_fire, 150.0);
    }

    #[test]
    fn test_evaluate_worth_estimated_rmb() {
        let result = evaluate_worth(100.0, 1, 100.0, 1.15, 16.0);
        assert_eq!(result.estimated_rmb, 100.0 / 16.0);
    }

    #[test]
    fn test_status_to_label() {
        assert_eq!(status_to_label(WorthStatus::Good), "可买");
        assert_eq!(status_to_label(WorthStatus::Consider), "可考虑");
        assert_eq!(status_to_label(WorthStatus::Bad), "不值");
        assert_eq!(status_to_label(WorthStatus::Unset), "未设置");
    }

    #[test]
    fn test_status_to_color() {
        assert_eq!(status_to_color(WorthStatus::Good), "green");
        assert_eq!(status_to_color(WorthStatus::Consider), "orange");
        assert_eq!(status_to_color(WorthStatus::Bad), "red");
        assert_eq!(status_to_color(WorthStatus::Unset), "gray");
    }
}
