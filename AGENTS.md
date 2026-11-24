# 甭跳 (Beng Tiao)

拦截手机应用打开后的跳转广告，以及强行拉起另一个应用的行为。

## 目标平台

| 平台 | 方式 | 产出 |
|------|------|------|
| 🤖 Android | Capacitor + 无障碍服务 | APK |
| ⌚ 手表 | 触屏 + 窄屏 CSS | 同 APK |
| 💍 智能戒指 | 摇一摇开关防护 | DeviceOrientation |
| 🦯 智能手杖 | 轻点开关防护 | DeviceMotion |

> 核心拦截依赖 Android AccessibilityService；浏览器内可用「演示拦截」验证逻辑。

## 原理

1. **跨应用跳转**：应用 A 刚进入前台后约 2.8s 内，若被拉起另一应用 B → 自动返回（BACK）
2. **开屏跳过**：同包名窗口内匹配「跳过 / 关闭广告」等控件并点击
3. 桌面启动器、系统 UI、本应用包名默认忽略

## 命令

```bash
npm install
npm test                 # 单元/集成测试
npm run test:coverage    # c8 覆盖率（lines/funcs/stmts ≥90%, branches ≥80%）
npm run test:flow        # 覆盖率 + build + debug debug APK
npm start                # 本地预览 www/
npm run apk:debug        # 打 Android debug APK
```

## 同步说明

改 HTML/JS 后：`npm run build`，再 `npx cap sync android`。  
改 Java 无障碍服务后：直接 `./android/gradlew -p android assembleDebug`。

## Harness / Loop（助手）

- 遵循根 `/Users/skat/AGENTS.md`：**Harness Engineering** + **Loop Engineering**
- Guide = 本文件；Sensor = 下方验证命令；同类失误第二次须沉淀规则或测试（棘轮）
- 开干前写清 **Done**；每切片过验证环；显式停止（成功 / 上限 / 无进展 / 人审）
- 详解：`docs/HARNESS_ENGINEERING.md`、`docs/LOOP_ENGINEERING.md`

## 验证环 / Done

```bash
npm install
npm test          # 若有
npm run build     # 或 build:web
npx cap sync android   # 若有 android/
# 可选：JAVA_HOME=…/openjdk@17 npm run apk:debug
```

**Done 示例**：测试通过（若有）+ web 产物进 `www/`/`dist/` + `cap sync` 无报错。可选穿戴未做可搁置，不纳入强制 Done。
