import type { CapacitorConfig } from '@capacitor/cli';

// Appli Android (APK) : le même code que la PWA, construit par `npm run build:android`
// puis empaqueté par Capacitor (dossier `android/`).
const config: CapacitorConfig = {
  appId: 'io.github.kuelitink.planning',
  appName: 'Planning',
  webDir: 'dist',
  android: {
    backgroundColor: '#ffeaf1',
  },
  plugins: {
    // Icônes sombres dans les barres système (l'appli est claire, même en mode sombre).
    SystemBars: { style: 'LIGHT' },
  },
};

export default config;
