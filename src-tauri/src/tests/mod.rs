#[cfg(test)]
mod tests {
    #[test]
    fn test_inventory_position_profit_calculation() {
        let buy_price: f64 = 1000.0;
        let quantity: i32 = 5;
        let target_sell_price: f64 = 1200.0;
        let fee_rate: f64 = 0.125;

        let total_buy = buy_price * quantity as f64;
        let total_sell = target_sell_price * quantity as f64 * (1.0 - fee_rate);
        let profit_loss = total_sell - total_buy;
        let profit_loss_percent = (profit_loss / total_buy) * 100.0;

        assert!(total_buy > 0.0);
        assert!(total_sell > 0.0);
        assert!(profit_loss > 0.0);
        assert!(profit_loss_percent > 0.0);
        assert!(profit_loss_percent > 4.0);
    }

    #[test]
    fn test_break_even_price_calculation() {
        let buy_price: f64 = 1000.0;
        let fee_rate: f64 = 0.125;

        let break_even = buy_price / (1.0 - fee_rate);

        assert!((break_even - 1142.857).abs() < 0.01);
    }

    #[test]
    fn test_fee_calculation() {
        let sell_price: f64 = 1200.0;
        let fee_rate: f64 = 0.125;
        let actual_receive = sell_price * (1.0 - fee_rate);

        assert!((actual_receive - 1050.0).abs() < 0.01);
    }

    #[test]
    fn test_profit_loss_percent() {
        let buy_price: f64 = 1000.0;
        let sell_price: f64 = 1200.0;
        let quantity: i32 = 5;
        let fee_rate: f64 = 0.125;

        let total_buy = buy_price * quantity as f64;
        let total_sell = sell_price * quantity as f64 * (1.0 - fee_rate);
        let profit_loss = total_sell - total_buy;
        let profit_loss_percent = (profit_loss / total_buy) * 100.0;

        assert!((profit_loss_percent - 5.0).abs() < 0.1);
    }
}
