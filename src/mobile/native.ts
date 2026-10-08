import { App } from '@capacitor/app';
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { KeepAwake } from '@capacitor-community/keep-awake';

/**
 * Native features of the phone app. Every call is optional: in a plain browser
 * (`vite --config vite.mobile.config.ts`) they do nothing, and a plugin error
 * never breaks the screen.
 */
export const isNative = Capacitor.isNativePlatform();

/** Full screen and screen always on while the game shows (off on the pairing screen). */
export async function setShowing(showing: boolean): Promise<void> {
  if (!isNative) return;
  await Promise.allSettled([
    showing ? StatusBar.hide() : StatusBar.show(),
    showing ? KeepAwake.keepAwake() : KeepAwake.allowSleep()
  ]);
}

/** Scans a QR code with the camera; null when cancelled. */
export async function scanQr(instructions: string): Promise<string | null> {
  const result = await CapacitorBarcodeScanner.scanBarcode({
    hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
    scanInstructions: instructions
  });
  return result.ScanResult || null;
}

/** Android back button; returns the unsubscribe function. */
export function onBackButton(callback: () => void): () => void {
  if (!isNative) return () => undefined;
  const handle = App.addListener('backButton', callback);
  return () => {
    void handle.then((listener) => listener.remove());
  };
}
