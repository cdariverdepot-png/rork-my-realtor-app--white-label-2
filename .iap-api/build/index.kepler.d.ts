import type { MutationField, ProductQueryType, ProductRequest, Purchase, PurchaseError, PurchaseUpdatedListenerOptions, QueryField } from './types';
export * from './types';
export * from './vega';
export * from './useIAP';
export { kitApi, KitApiError } from './kit-api';
export type { EntitlementsResponse, KitApiOptions, KitClientPayloadCache, KitClientPayloadOptions, KitClientPayloadResponse, KitProduct, KitProductClientPayload, KitProductOffer, KitProductPlatform, KitProductsOptions, KitProductsResponse, KitSubscription, StatusResponse, } from './kit-api';
export declare enum OpenIapEvent {
    PurchaseUpdated = "purchase-updated",
    PurchaseError = "purchase-error",
    PromotedProductIOS = "promoted-product-ios",
    UserChoiceBillingAndroid = "user-choice-billing-android",
    DeveloperProvidedBillingAndroid = "developer-provided-billing-android",
    SubscriptionBillingIssue = "subscription-billing-issue"
}
export type ProductTypeInput = ProductQueryType;
export interface EventSubscription {
    remove(): void;
}
export declare const emitter: {
    addListener(eventName: OpenIapEvent, listener: (payload: Purchase | PurchaseError) => void): EventSubscription;
    removeListener(eventName: OpenIapEvent, listener: (payload: Purchase | PurchaseError) => void): void;
};
export declare const purchaseUpdatedListener: (listener: (event: Purchase) => void, options?: PurchaseUpdatedListenerOptions | null) => EventSubscription;
export declare const purchaseErrorListener: (listener: (error: PurchaseError) => void) => EventSubscription;
export declare const initConnection: MutationField<'initConnection'>;
export declare const endConnection: MutationField<'endConnection'>;
export declare const fetchProducts: (request: Omit<ProductRequest, "type"> & {
    type?: ProductTypeInput | null;
}) => ReturnType<QueryField<"fetchProducts">>;
export declare const requestPurchase: MutationField<'requestPurchase'>;
export declare const getAvailablePurchases: QueryField<'getAvailablePurchases'>;
export declare const finishTransaction: MutationField<'finishTransaction'>;
export declare const restorePurchases: MutationField<'restorePurchases'>;
export declare const getActiveSubscriptions: QueryField<'getActiveSubscriptions'>;
export declare const hasActiveSubscriptions: QueryField<'hasActiveSubscriptions'>;
export declare const getStorefront: QueryField<'getStorefront'>;
export declare const verifyPurchaseWithProvider: MutationField<'verifyPurchaseWithProvider'>;
export declare const verifyPurchase: MutationField<'verifyPurchase'>;
export declare const acknowledgePurchaseAndroid: MutationField<'acknowledgePurchaseAndroid'>;
export declare const consumePurchaseAndroid: MutationField<'consumePurchaseAndroid'>;
export declare const syncIOS: MutationField<'syncIOS'>;
export declare const getAppTransactionIOS: QueryField<'getAppTransactionIOS'>;
export declare const getPromotedProductIOS: QueryField<'getPromotedProductIOS'>;
export declare const showManageSubscriptionsIOS: MutationField<'showManageSubscriptionsIOS'>;
/**
 * @deprecated Use `openRedeemOfferCode` instead. Scheduled for removal in client protocol 1.0.0.
 */
export declare const presentCodeRedemptionSheetIOS: MutationField<'presentCodeRedemptionSheetIOS'>;
export declare const presentExternalPurchaseLinkIOS: MutationField<'presentExternalPurchaseLinkIOS'>;
export declare const deepLinkToSubscriptions: MutationField<'deepLinkToSubscriptions'>;
export declare const openRedeemOfferCode: MutationField<'openRedeemOfferCode'>;
/**
 * @deprecated Use `openRedeemOfferCode` instead. Scheduled for removal in
 * client protocol 1.0.0.
 */
export declare const openRedeemOfferCodeAndroid: MutationField<'openRedeemOfferCodeAndroid'>;
export declare const promotedProductListenerIOS: () => EventSubscription;
export declare const userChoiceBillingListenerAndroid: () => EventSubscription;
export declare const developerProvidedBillingListenerAndroid: () => EventSubscription;
export declare const subscriptionBillingIssueListener: () => EventSubscription;
export declare const isBillingProgramAvailableAndroid: MutationField<'isBillingProgramAvailableAndroid'>;
export declare const getBillingChoiceInfoAndroid: QueryField<'getBillingChoiceInfoAndroid'>;
export declare const launchExternalLinkAndroid: MutationField<'launchExternalLinkAndroid'>;
export declare const createBillingProgramReportingDetailsAndroid: MutationField<'createBillingProgramReportingDetailsAndroid'>;
export declare const showBillingProgramInformationDialogAndroid: MutationField<'showBillingProgramInformationDialogAndroid'>;
export declare const showInAppMessagesAndroid: MutationField<'showInAppMessagesAndroid'>;
//# sourceMappingURL=index.kepler.d.ts.map