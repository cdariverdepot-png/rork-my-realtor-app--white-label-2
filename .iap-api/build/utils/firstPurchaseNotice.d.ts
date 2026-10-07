import type { PurchaseInput } from '../types';
export declare const FIRST_PURCHASE_NOTICE: string;
export interface FirstPurchaseNoticeSignals {
    isDebugBuild: () => boolean;
    isTestRunner: () => boolean;
    hasFlagStore: () => boolean;
    /** True only the first time on this install. */
    claim: () => Promise<boolean>;
    log: (message: string) => void;
}
/** Call after a finish resolves; it never throws and never blocks the caller. */
export declare function createFirstPurchaseNotice(signals: FirstPurchaseNoticeSignals): (purchase: PurchaseInput) => void;
export declare const showFirstPurchaseNotice: (purchase: PurchaseInput) => void;
//# sourceMappingURL=firstPurchaseNotice.d.ts.map