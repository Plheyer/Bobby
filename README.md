# Bobby
Application mobile permettant de compter les points de jeu de société

## Installer une version standalone

### 1) Prérequis (une seule fois)

```bash
npm install
npx eas login
```

## Android (APK)

### Générer l'APK standalone

```bash
npx eas build --platform android --profile preview
```

### Installer sur ton téléphone Android

1. Ouvre le lien Expo/EAS affiché à la fin du build.
2. Télécharge le fichier `.apk` sur ton téléphone.
3. Lance l'installation (autoriser les sources inconnues si Android le demande).

### Commande principale (Android)

```bash
npx eas build --platform android --profile preview
```

---

## iPhone (iOS)

### Prérequis supplémentaires iOS

- Pour tester gratuitement : Xcode sur macOS + simulateur iOS, ou Expo Go sur iPhone.
- Pour générer une vraie app iPhone installable hors Expo Go, un compte Apple Developer est nécessaire.

### Générer la build iOS

**Pour test sur simulateur (macOS uniquement) :**
```bash
npx eas build --platform ios --profile preview
```

**Pour test sur un iPhone sans compte payant :**
```bash
npx expo start
```

Puis ouvrir le projet avec Expo Go sur l'iPhone.

**Pour une build installable sur iPhone réel :**
```bash
npx eas build --platform ios --profile preview --device
```

### Installer sur iPhone

1. Ouvre le lien Expo/EAS affiché à la fin du build.
2. Télécharge le fichier `.ipa`.
3. Utilise Xcode pour installer:
   ```bash
   xcode-select --install  # Si nécessaire
   open Bobby.ipa
   ```
   Ou utilise Apple Configurator 2 pour installer directement.

Alternativement, utilise **TestFlight** pour distribuer facilement à d'autres testeurs.

### Commande principale (iOS)

```bash
npx eas build --platform ios --profile preview
```

> Note : sans compte Apple Developer, tu ne peux pas produire un fichier .ipa standalone destiné à l'installation classique sur iPhone.
