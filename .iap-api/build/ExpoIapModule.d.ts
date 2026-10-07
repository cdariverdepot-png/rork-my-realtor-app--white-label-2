import { type EventSubscription } from 'expo-modules-core';
import type { BillingProgramAndroid, BillingProgramReportingDetailsAndroid, DeveloperBillingTypeAndroid, Mutation, MutationField, ProductQueryType, PurchaseInput, PurchaseOptions, PurchaseUpdatedListenerOptions, Query, QueryField, SubscriptionStatusIOS } from './types';
/** Members read from the raw module; every store module provides them. */
type NativeEventModule = {
    ERROR_CODES?: Record<string, unknown>;
    addListener<T>(eventName: string, listener: (payload: T) => void): EventSubscription | undefined;
    removeListener?<T>(eventName: string, listener: (payload: T) => void): void;
    setPurchaseUpdatedListenerOptions?(options?: PurchaseUpdatedListenerOptions | null): Promise<void>;
};
type QueryFields<K extends keyof Query> = {
    [P in K]: QueryField<P>;
};
type MutationFields<K extends keyof Mutation> = {
    [P in K]: MutationField<P>;
};
/**
 * Native surface behind the default export. Results the wrappers decode stay
 * `unknown`; the rest match the generated operation signatures.
 */
export type ExpoIapNativeModule = NativeEventModule & QueryFields<'canPresentExternalPurchaseNoticeIOS' | 'currentEntitlementIOS' | 'getActiveSubscriptions' | 'getAppTransactionIOS' | 'getBillingChoiceInfoAndroid' | 'getExternalPurchaseCustomLinkTokenIOS' | 'getPromotedProductIOS' | 'getReceiptDataIOS' | 'getTransactionJwsIOS' | 'hasActiveSubscriptions' | 'isEligibleForExternalPurchaseCustomLinkIOS' | 'isEligibleForIntroOfferIOS' | 'isTransactionVerifiedIOS' | 'latestTransactionIOS'> & MutationFields<'beginRefundRequestIOS' | 'clearTransactionIOS' | 'endConnection' | 'initConnection' | 'isBillingProgramAvailableAndroid' | 'launchExternalLinkAndroid' | 'openRedeemOfferCodeAndroid' | 'presentCodeRedemptionSheetIOS' | 'presentExternalPurchaseLinkIOS' | 'presentExternalPurchaseNoticeSheetIOS' | 'showBillingProgramInformationDialogAndroid' | 'showExternalPurchaseCustomLinkNoticeIOS' | 'showInAppMessagesAndroid' | 'syncIOS' | 'verifyPurchase' | 'verifyPurchaseWithProvider'> & {
    USING_ONSIDE_SDK: boolean;
    USING_VEGA_SDK: boolean;
    fetchProducts(request: {
        skus: string[];
        type: ProductQueryType;
    }): Promise<unknown[]>;
    fetchProducts(type: ProductQueryType, skus: string[]): Promise<unknown[]>;
    getAvailableItems(alsoPublishToEventListenerIOS: boolean, onlyIncludeActiveItemsIOS: boolean): Promise<unknown>;
    getAvailableItems(options: PurchaseOptions): Promise<unknown>;
    getAllTransactionsIOS(): Promise<unknown>;
    getPendingTransactionsIOS(): Promise<unknown>;
    showManageSubscriptionsIOS(): Promise<unknown>;
    requestPurchase(request: object): Promise<unknown>;
    finishTransaction(purchase: PurchaseInput, isConsumable: boolean | null): Promise<boolean>;
    /** Internal: the once-per-install flag behind the first-purchase notice. */
    claimFirstPurchaseNotice(): Promise<boolean>;
    acknowledgePurchaseAndroid(purchaseToken: string): Promise<unknown>;
    consumePurchaseAndroid(purchaseToken: string): Promise<unknown>;
    createBillingProgramReportingDetailsAndroid(program: BillingProgramAndroid, developerBillingType: DeveloperBillingTypeAndroid | null): Promise<BillingProgramReportingDetailsAndroid>;
    subscriptionStatusIOS(sku: string): Promise<SubscriptionStatusIOS[] | null>;
    requestReceiptRefreshIOS(): Promise<string>;
    deepLinkToSubscriptionsAndroid?(options: {
        skuAndroid?: string;
        packageNameAndroid?: string;
    }): Promise<void> | void;
    getStorefront?(): Promise<string> | string;
    restorePurchases?(): Promise<boolean>;
};
export declare const NATIVE_ERROR_CODES: Record<string, unknown>;
/**
 * Returns the raw native module, not the Proxy. Use it for addListener: a JSI
 * HostObject needs the real module as `this`, and a Proxy throws "native state
 * unsupported on Proxy" on New Architecture / Hermes.
 */
export declare function getNativeModule(): NativeEventModule;
declare const _default: ExpoIapNativeModule;
export default _default;
//# sourceMappingURL=ExpoIapModule.d.ts.map