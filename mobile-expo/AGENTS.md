# AGENTS.md — Expo phone app

React Native (Expo) version of the phone app: pair with the desktop app by its QR code, then show its game screen (`http://<LAN IP>:17322/phone#k=…`) full screen for a TikTok screen-share LIVE. The Capacitor version of the same app lives in the repo root (`src/mobile`, `mobile/`); see `docs/MOBILE.md`.

React Native is used here because the streamer asked for it; it is limited to this folder. The desktop app stays React DOM + plain CSS (root `AGENTS.md`).

## Layout
- `App.tsx`: loads the saved link, switches pairing ↔ game screen.
- `src/PairingScreen.tsx`: QR scan (`expo-camera`) or pasted link.
- `src/GameScreen.tsx`: `react-native-webview` full screen, keep-awake, hidden status / navigation bars, hold-corner / Back menu.
- `src/shared.ts`: re-exports the desktop's platform-free modules from `../src/shared` (`phoneLink.ts`, `i18n.ts`); `metro.config.js` adds that folder to `watchFolders`. Add English texts to `../src/shared/en/mobile.ts`.

## Safety rules
1. Load only a link that passes `parsePhoneLink` (private IPv4, port 17322, `/phone`, token) — also when reading it back from storage.
2. The WebView may navigate only to the paired page (`onShouldStartLoadWithRequest` + `isPairedPage`); no popups, no file access.
3. Never give the page a bridge to the app: no `onMessage`, `injectedJavaScript` or native calls from the page.
4. Cleartext HTTP is allowed only because the desktop serves the LAN page over HTTP (`usesCleartextTraffic`, iOS `NSAllowsLocalNetworking`); never load other HTTP content.

## Expo notes
- Expo SDK 57. APIs change between SDKs: check the installed type definitions (`node_modules/<pkg>/build/*.d.ts`) or the versioned docs before using an API.
- Add packages with `npx expo install <package>` (SDK-compatible versions).
- `ios/` and `android/` are generated (Continuous Native Generation, gitignored): configure native behavior in `app.json` and config plugins, never by hand.
- Every module used here is in Expo Go, so `npx expo start` + Expo Go works without a native build.
- Run `npx tsc --noEmit` before declaring a task done. Node ≥ 22.
