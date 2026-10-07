import { type Purchase, type PurchaseIOS } from '../types';
/** Decode an authoritative native purchase list without partial success. */
export declare const decodeAvailablePurchases: (value: unknown) => Purchase[];
/** Decode an authoritative StoreKit list without filtering foreign entries. */
export declare const decodeApplePurchases: (value: unknown) => PurchaseIOS[];
/** Decode an authoritative Android-family list without foreign stores. */
export declare const decodeAndroidPurchases: (value: unknown) => Purchase[];
//# sourceMappingURL=availablePurchases.d.ts.map