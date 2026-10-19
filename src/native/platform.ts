/** Appli Android (Capacitor) ou navigateur (PWA). */

import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

/** Numéro de build de l'APK (numéro du passage GitHub Actions), 0 hors APK publiée. */
export const BUILD_NUMBER = Number(import.meta.env.VITE_BUILD_NUMBER ?? 0) || 0;
