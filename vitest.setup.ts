import "@testing-library/jest-dom";

// 本番の既定は停止。既存テストは有料APIの有効経路を見るので、明示的に再開する。
process.env.PAID_APIS_DISABLED = "false";
