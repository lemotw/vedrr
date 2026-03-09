# macOS DMG 签名与公证 — 准备事项

> 目标：让 CI 产出的 `.dmg` 通过 Apple Gatekeeper，用户双击即可安装，无「无法验证开发者」弹窗。

---

## 1. 必须申请的 Apple 账号与证书

### 1.1 Apple Developer Program（年费 US$99）

- 注册地址：https://developer.apple.com/programs/
- 使用公司或个人 Apple ID 注册
- 审核通过后才能创建签名证书
- **注意**：免费 Apple ID 无法用于分发签名

### 1.2 创建签名证书

在 https://developer.apple.com/account/resources/certificates 创建以下证书：

| 证书类型 | 用途 | 必须？ |
|---------|------|--------|
| **Developer ID Application** | 签名 `.app` bundle 内所有二进制 | 是 |
| **Developer ID Installer** | 签名 `.pkg` 安装包（DMG 不需要，但建议一并创建） | 可选 |

#### 步骤 A：生成 CSR（Certificate Signing Request）

1. 打开 **Keychain Access**（钥匙串访问）
2. 菜单栏 → **Keychain Access** → **Certificate Assistant** → **Request a Certificate From a Certificate Authority...**
3. 填写表单：
   - **User Email Address**: Apple Developer 账号邮箱
   - **Common Name**: 任意，如 `vedrr-dev`
   - **CA Email Address**: 留空
   - **Request is**: 选择 **Saved to disk**
4. 点 **Continue** → 保存 `.certSigningRequest` 文件到桌面

#### 步骤 B：在 Developer Portal 创建证书

1. 前往 https://developer.apple.com/account/resources/certificates/add
2. 选择 **Developer ID Application**
3. 会看到 G2 Sub-CA 提示 — **直接继续，选择 G2（默认）**
   > G2 是当前标准，只要求 Xcode 11.4.1+，CI runner 满足此条件。
   > 不要选旧 Sub-CA（旧证书 2027-02-01 过期且即将淘汰）。
4. 上传步骤 A 保存的 `.certSigningRequest` 文件
5. 下载生成的 `.cer` 证书文件
6. 双击 `.cer` → 自动导入 Keychain

### 1.3 导出 `.p12` 文件（CI 用）

> **注意**：新版 macOS Keychain Access GUI 已移除 `.p12` 导出选项，需使用命令行。

#### 步骤 1：确认证书已导入

```bash
security find-identity -v -p codesigning
```

输出中找到类似这行（记下引号内的名称，即 signing identity）：

```
1) ABCDEF123456... "Developer ID Application: Your Name (XXXXXXXXXX)"
```

#### 步骤 2：命令行导出 `.p12`

```bash
# 导出指定证书（推荐，替换引号内为你的证书名称）
security export -k login.keychain-db \
  -t identities -f pkcs12 \
  -o ~/Desktop/certificate.p12
```

系统会提示设置导出密码 — **记住这个密码**，即 `APPLE_CERTIFICATE_PASSWORD`。

> 如果 Keychain 中有多个签名证书，上述命令会全部导出。
> 可先用 Keychain Access 删除不需要的证书，或只保留目标证书后再导出。

---

## 2. 创建 App-Specific Password（公证用）

Apple 公证服务需要 App-Specific Password（不是 Apple ID 密码）：

1. 前往 https://appleid.apple.com/account/manage → 登录
2. 「App 专用密码」→ 生成
3. 记录密码（格式如 `xxxx-xxxx-xxxx-xxxx`）

---

## 3. 收集所有凭据信息

签名和公证需要以下信息，全部存入 GitHub Secrets：

| GitHub Secret 名称             | 值                                                    | 来源                                    |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------- |
| `APPLE_CERTIFICATE`          | `.p12` 文件的 **Base64** 编码                             | `base64 -i certificate.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | 导出 `.p12` 时设置的密码                                     | 步骤 1.3                                |
| `APPLE_SIGNING_IDENTITY`     | 证书名称，如 `Developer ID Application: Lemo (XXXXXXXXXX)` | Keychain 中查看                          |
| `APPLE_ID`                   | Apple Developer 账号邮箱                                 | developer.apple.com                   |
| `APPLE_PASSWORD`             | App-Specific Password                                | 步骤 2                                  |
| `APPLE_TEAM_ID`              | 10 位 Team ID                                         | developer.apple.com → Membership      |

---

## 4. 修改 CI Workflow

`tauri-apps/tauri-action` 原生支持签名与公证，只需传入环境变量。

在 `release.yml` 的 macOS job 中添加：

```yaml
- uses: tauri-apps/tauri-action@v0
  id: tauri
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    VITE_APP_VERSION: ${{ github.ref_name }}
    # ---- macOS 签名与公证 ----
    APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
    APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  with:
    tagName: ${{ github.ref_name }}
    releaseName: 'vedrr ${{ github.ref_name }}'
    releaseBody: 'See commits for changelog.'
    releaseDraft: true
    prerelease: false
    args: ${{ matrix.args }}
```

> `tauri-action` 检测到这些环境变量后会自动：
> 1. 导入证书到 CI runner 的临时 Keychain
> 2. 使用 `codesign` 签名 `.app` 内所有二进制
> 3. 使用 `notarytool` 提交 Apple 公证
> 4. 使用 `stapler` 将公证票据附加到 `.app`
> 5. 打包成已签名的 `.dmg`

---

## 5. tauri.conf.json 可选配置

当前配置已包含 `identifier: "com.vedrr.app"`，这是签名必需的。可额外添加：

```jsonc
// src-tauri/tauri.conf.json → bundle → macOS
"macOS": {
  "entitlements": null,       // 默认即可，除非需要 Hardened Runtime 额外权限
  "signingIdentity": null,    // 留 null，由 CI 环境变量控制
  "minimumSystemVersion": "10.15"
}
```

如果 app 使用了网络、文件访问等需要 entitlements 的功能，需要创建 `src-tauri/Entitlements.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <false/>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
</dict>
</plist>
```

> **注意**：vedrr 使用了 `macOSPrivateApi: true`，Tauri 会自动添加所需的 entitlements，一般不需要手动创建。

---

## 6. 验证清单

完成上述步骤后，按顺序检查：

- [ ] Apple Developer Program 已激活（非免费账号）
- [ ] Developer ID Application 证书已创建并导入 Keychain
- [ ] `.p12` 文件已导出并 Base64 编码
- [ ] App-Specific Password 已生成
- [ ] 以下 6 个 GitHub Secrets 已设置：
  - [ ] `APPLE_CERTIFICATE`
  - [ ] `APPLE_CERTIFICATE_PASSWORD`
  - [ ] `APPLE_SIGNING_IDENTITY`
  - [ ] `APPLE_ID`
  - [ ] `APPLE_PASSWORD`
  - [ ] `APPLE_TEAM_ID`
- [ ] `release.yml` 已添加签名环境变量
- [ ] 推送测试 tag（如 `v0.1.1-rc1`）验证签名流程

---

## 7. 常见问题

### Q: 签名后 DMG 体积会变大吗？
签名信息约增加几百 KB，影响可忽略。

### Q: 公证需要多久？
通常 1-5 分钟，复杂 app 可能 15 分钟。CI 会自动等待。

### Q: 能只签名不公证吗？
技术上可以（只设置 `APPLE_CERTIFICATE` 相关变量），但 macOS 10.15+ 会对未公证 app 显示更严格的警告。**强烈建议同时公证**。

### Q: Universal Binary（arm64 + x86_64 合一）需要什么？
当前 CI 分别构建 aarch64 和 x86_64 两个 DMG，各自签名即可。如需合并为 Universal Binary，需要额外用 `lipo` 合并，签名流程不变。

---

## 费用总结

| 项目 | 费用 | 频率 |
|------|------|------|
| Apple Developer Program | US$99 | 每年 |
| GitHub Actions (macOS runner) | 包含在免费额度 / 已有付费计划 | 按用量 |
| 证书、公证 | 免费（包含在 Developer Program） | — |
