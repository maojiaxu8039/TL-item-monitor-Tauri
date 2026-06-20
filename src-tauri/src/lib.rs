//! TorchScan - 库模块
//!
//! 这个库被 TorchScan 桌面应用使用

pub mod app;
pub mod commands;
pub mod core;
pub mod db;
pub mod scheduler;
pub mod scraper;
pub mod services;
pub mod tray;

#[cfg(test)]
mod tests;
