# Rust 依賴風險審計

> 審計日期：2026-02-25
> 對象：`src-tauri/Cargo.toml` 所有直接依賴

## 風險總覽

| Crate | 當前版本 | 最新版本 | Stars | 貢獻者 | 最後活動 | 風險等級 |
|-------|---------|---------|------:|:------:|:--------:|:--------:|
| dirs | 5.x | 6.x | 735 | 14 | 2025-01 (GH archived) | 危急 |
| keyring | 3.x | 4.0-alpha | 703 | 27 | 2026-02-03 | 中高 |
| rusqlite | 0.31 | 0.38 | 4,065 | 100+ | 2026-02-24 | 中 (CVE) |
| serde | 1.x | 1.x | 10,473 | 185 | 2026-02-16 | 中 (bus factor) |
| thiserror | 1.x | 2.x | 5,359 | 28 | 2026-02-16 | 中 (bus factor) |
| reqwest | 0.12 | 0.13 | 11,442 | 390 | 2026-02-15 | 低中 |
| chrono | 0.4 | 0.4 | 3,810 | 237 | 2026-02-23 | 低中 |
| uuid | 1.x | 1.x | 1,182 | 152 | 2026-02-13 | 低 |
| tokio | 1.x | 1.x | 31,254 | 936+ | 2026-02-24 | 低 |
| tauri | 2.x | 2.x | 103,198 | 517 | 2026-02-24 | 低 |

---

## 危急：dirs — GitHub 已封存

- **Repo**: `github.com/dirs-dev/dirs-rs` 於 2025-02-18 被 archived
- **遷移**: 開發遷移至 Codeberg (`codeberg.org/dirs/dirs-rs`)，但 Codeberg 最後 commit 為 2025-08 的 README 更新
- **影響範圍**: vedrr 僅使用 `dirs::home_dir()`（`db.rs:7`、`file_ops.rs:5`），API 穩定不太會壞
- **替代方案**:
  - `home` crate（rustup 團隊維護，專門提供 home directory）
  - 直接用環境變數 `$HOME`
  - 繼續用 — crates.io 上的版本不會消失，且 `home_dir()` 極穩定

## 中高：keyring — 單人維護 + 架構大改中

- **Repo**: 從 `hwchen/keyring-rs` 轉移至 `open-source-cooperative/keyring-rs`
- **Bus factor**: Daniel Brotsky 一人維護，近 5 次 commit 中 4 次為其所作
- **v4.0 alpha**: 架構大改，拆出 `keyring-core`，API 完全不同，尚未穩定
- **需求評估**: vedrr 是本地 SQLite 桌面應用，是否真的需要 keyring？若非必要建議移除以減少風險點
- **當前策略**: 留在 3.x，version specifier `"3"` 正確鎖定

## 中：rusqlite — CVE-2025-6965（CVSS 9.8）

- **問題**: `rusqlite = "0.31"` 綁定 SQLite 3.45.1，受 CVE-2025-6965 影響（記憶體損壞漏洞）
- **修復版**: SQLite 3.50.2+，對應 rusqlite 0.36+
- **升級路徑**: 0.31 → 0.38，中間有 7 個 breaking release，但 vedrr 的基本 CRUD + WAL 用法影響應不大
- **維護者**: gwenn 為主要維護者，幾乎每日 commit，發佈節奏 1-3 月一版
- **行動**: 盡快升級至 0.38

## 中：serde / thiserror — dtolnay bus factor

- **共同風險**: David Tolnay 獨自維護 serde、thiserror、anyhow、syn、quote 等數十個核心 crate
- **現狀**: 目前非常活躍（2026-02 仍有 commit），但屬於整個 Rust 生態的系統性風險
- **thiserror 2.0**: 已發佈，新增 `no_std` 支持，改了 raw identifier 規則，遷移簡單但非必要
- **行動**: 無法避免，僅需保持關注。thiserror 可擇期升級至 2.x

## 低中：reqwest — feature 更名

- **變化**: 0.13 將 `rustls-tls` feature 更名為 `rustls`，預設 TLS 改為 rustls
- **升級方式**:
  ```toml
  # Before:
  reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
  # After:
  reqwest = { version = "0.13", features = ["json", "rustls"] }
  ```
- **注意**: `query` 和 `form` 在 0.13 變成 opt-in，若有使用需手動加 feature
- **維護**: Sean McArthur 持續活躍，390 貢獻者，健康

## 低中：chrono — 曾有維護斷層，已復活

- **歷史**: 原始維護者曾退出，導致一段停滯期
- **現狀**: 新團隊（Jonas Platte / pitdicker）接手，237 貢獻者，2026-02-23 剛發佈 v0.4.44
- **行動**: 無需操作，0.4.x 持續維護中

## 低風險（無需操作）

| Crate | 備註 |
|-------|------|
| **tauri** | 103k stars，CrabNebula 商業支持，517 貢獻者，極活躍 |
| **tokio** | 31k stars，936+ 貢獻者，Rust async 基礎設施，LTS 至 2026-09 |
| **uuid** | 152 貢獻者，僅 11 open issues，維護乾淨，3-6 週一版 |

---

## 行動計畫

| 優先級 | 行動 | 狀態 |
|--------|------|------|
| P0 | 升級 rusqlite 0.31 → 0.38（修 CVE） | TODO |
| P1 | 評估 keyring 是否可移除 | TODO |
| P1 | 評估 dirs 替代方案（`home` crate 或直接 `$HOME`） | TODO |
| P2 | 升級 reqwest 0.12 → 0.13 + 改 feature 名 | TODO |
| P2 | 升級 thiserror 1 → 2 | TODO |
| P3 | 定期 `cargo update` 保持 patch 版本最新 | 持續 |
