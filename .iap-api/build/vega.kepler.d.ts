import { type ExpoIapVegaModule } from './vega-adapter';
/**
 * Returns true when the current React Native platform is Amazon Vega/Kepler.
 */
export declare const isVegaOS: () => boolean;
/**
 * Lazily creates the Vega IAP adapter backed by Amazon's Kepler Appstore IAP service.
 */
export declare const getVegaIapModule: () => ExpoIapVegaModule | null;
//# sourceMappingURL=vega.kepler.d.ts.map