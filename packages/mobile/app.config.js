const IS_DEV = process.env.APP_VARIANT === 'development';
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

const getAppName = () => {
  if (IS_DEV) return 'SHADOW Dev';
  if (IS_PREVIEW) return 'SHADOW Preview';
  return 'SHADOW';
};

const getBundleId = () => {
  if (IS_DEV) return 'ai.shadow.app.dev';
  if (IS_PREVIEW) return 'ai.shadow.app.preview';
  return 'ai.shadow.app';
};

const getAndroidPackage = () => {
  if (IS_DEV) return 'ai.shadow.app.dev';
  if (IS_PREVIEW) return 'ai.shadow.app.preview';
  return 'ai.shadow.app';
};

export default {
  expo: {
    name: getAppName(),
    slug: 'shadow',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'shadow',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    platforms: ['ios', 'android'],
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#100F0F',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: getBundleId(),
      buildNumber: '1',
      infoPlist: {
        NSFaceIDUsageDescription:
          'SHADOW uses Face ID to protect the app',
        NSLocalNetworkUsageDescription:
          'SHADOW connects to your Shadow Node on the local network',
        NSBonjourServices: ['_http._tcp'],
        LSSupportsOpeningDocumentsInPlace: true,
        UIFileSharingEnabled: true,
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
          NSAllowsLocalNetworking: true,
        },
      },
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      package: getAndroidPackage(),
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#100F0F',
      },
    },
    plugins: [
      './plugins/withPrivacyManifest.js',
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#100F0F',
          image: './assets/splash-icon.png',
          imageWidth: 200,
        },
      ],
      [
        'expo-font',
        {
          fonts: [
            './assets/fonts/IBMPlexMono-Regular.ttf',
            './assets/fonts/IBMPlexMono-Medium.ttf',
            './assets/fonts/IBMPlexMono-SemiBold.ttf',
            './assets/fonts/IBMPlexMono-Bold.ttf',
          ],
        },
      ],
      'expo-secure-store',
      [
        'expo-local-authentication',
        {
          faceIDPermission:
            'Allow SHADOW to use Face ID to protect the app',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#100F0F',
        },
      ],
      [
        'expo-file-system',
        {
          supportsOpeningDocumentsInPlace: true,
          enableFileSharing: true,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {
        origin: false,
      },
      eas: {
        projectId: '0f1f6641-2847-4b02-9961-7d1354754b44',
      },
    },
    owner: 'heynerd',
  },
};
