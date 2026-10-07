import { type InstalledFromOnside } from './ExpoOnsideMarketplaceAvailabilityModule';
declare let installedFromOnside: InstalledFromOnside;
/**
 * Detects an Onside marketplace install so the payment module can switch at runtime.
 *
 * Call it before initializing useIAP, for example during SplashScreen initialization:
 * the check is asynchronous and cannot run at module import, and useIAP must be
 * referenced only after it to use the correct platform.
 *
 * Enable the Onside module in your Expo config plugin:
 *
 *    plugins: [
 *      [
 *        'expo-iap',
 *        {
 *          modules: {
 *            onside: true,
 *            //Keep other modules
 *          },
 *        },
 *      ],
 *    ];
 *
 * Without it, the Onside integration is not linked and the check always returns false.
 */
declare function checkInstallationFromOnside(): Promise<InstalledFromOnside>;
declare function useOnside(): {
    isOnsideLoading: boolean;
};
export { checkInstallationFromOnside, installedFromOnside, useOnside };
//# sourceMappingURL=index.d.ts.map