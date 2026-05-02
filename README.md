# Bobby
Application mobile permettant de compter les points de jeu de société

## Installer une version standalone Android (APK)

### 1) Prérequis (une seule fois)

```bash
npm install
npx eas login
```

### 2) Générer l'APK standalone

```bash
npx eas build --platform android --profile preview
```

### 3) Installer sur ton téléphone Android

1. Ouvre le lien Expo/EAS affiché à la fin du build.
2. Télécharge le fichier `.apk` sur ton téléphone.
3. Lance l'installation (autoriser les sources inconnues si Android le demande).

### Commande principale demandée (standalone)

```bash
npx eas build --platform android --profile preview
```
