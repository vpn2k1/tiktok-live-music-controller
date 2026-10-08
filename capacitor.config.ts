import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Phone app that shows the desktop's game screen (/phone page) full screen.
 * Native projects live in mobile/android and mobile/ios; web assets come from
 * `npm run mobile:build` (dist-mobile).
 */
const config: CapacitorConfig = {
  appId: 'local.tiklivevpn.screen',
  appName: 'TikLiveVPN Screen',
  webDir: 'dist-mobile',
  server: {
    // The app page is http://localhost so the paired computer's plain-HTTP
    // LAN page can load in its frame (an https page would block it as mixed content).
    androidScheme: 'http',
    cleartext: true
  },
  android: { path: 'mobile/android' },
  ios: { path: 'mobile/ios' },
  plugins: {
    StatusBar: { overlaysWebView: true }
  }
};

export default config;
