// 格式化 Unix 时间戳（秒）为本地时间字符串
export const formatTimestamp = (ts: number) => new Date(ts * 1000).toLocaleString("zh-CN");
