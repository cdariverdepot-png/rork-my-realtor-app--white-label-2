import { requestPurchase as requestPurchaseInternal, type ActiveSubscription, type ProductTypeInput } from './index';
import type { Product, ProductSubscription, BillingChoiceScreenTypeAndroid, BillingProgramAndroid, DeveloperProvidedBillingDetailsAndroid, Purchase, MutationRequestPurchaseArgs, PurchaseUpdatedListenerOptions, VerifyPurchaseProps, VerifyPurchaseResult, VerifyPurchaseWithProviderProps, VerifyPurchaseWithProviderResult, PurchaseOptions, MutationField, QueryField, UserChoiceBillingDetails } from './types';
import type { PurchaseError } from './utils/errorMapping';
type UseIap = {
    connected: boolean;
    products: Product[];
    subscriptions: ProductSubscription[];
    availablePurchases: Purchase[];
    promotedProductIOS?: Product;
    activeSubscriptions: ActiveSubscription[];
    finishTransaction: ({ purchase, isConsumable, }: {
        purchase: Purchase;
        isConsumable?: boolean;
    }) => Promise<void>;
    getAvailablePurchases: (options?: PurchaseOptions) => Promise<void>;
    fetchProducts: (params: {
        skus: string[];
        type?: ProductTypeInput;
    }) => Promise<void>;
    requestPurchase: (params: MutationRequestPurchaseArgs) => ReturnType<typeof requestPurchaseInternal>;
    verifyPurchase: (props: VerifyPurchaseProps) => Promise<VerifyPurchaseResult>;
    verifyPurchaseWithProvider: (props: VerifyPurchaseWithProviderProps) => Promise<VerifyPurchaseWithProviderResult>;
    restorePurchases: (options?: PurchaseOptions) => Promise<void>;
    getPromotedProductIOS: () => Promise<Product | null>;
    getActiveSubscriptions: (subscriptionIds?: string[]) => Promise<void>;
    hasActiveSubscriptions: (subscriptionIds?: string[]) => Promise<boolean>;
    /**
     * Manually retry the store connection.
     * Useful when the initial auto-connect fails (e.g., Play Store not ready at mount time).
     * Updates the `connected` state on success.
     */
    reconnect: () => Promise<boolean>;
    getBillingChoiceInfoAndroid: QueryField<'getBillingChoiceInfoAndroid'>;
    isBillingProgramAvailableAndroid: MutationField<'isBillingProgramAvailableAndroid'>;
    createBillingProgramReportingDetailsAndroid: MutationField<'createBillingProgramReportingDetailsAndroid'>;
    launchExternalLinkAndroid: MutationField<'launchExternalLinkAndroid'>;
    showBillingProgramInformationDialogAndroid: MutationField<'showBillingProgramInformationDialogAndroid'>;
    showInAppMessagesAndroid: MutationField<'showInAppMessagesAndroid'>;
    openRedeemOfferCode: MutationField<'openRedeemOfferCode'>;
    /**
     * @deprecated Use `openRedeemOfferCode` instead. Scheduled for removal in
     * client protocol 1.0.0.
     */
    openRedeemOfferCodeAndroid: MutationField<'openRedeemOfferCodeAndroid'>;
};
export interface UseIAPOptions {
    onPurchaseSuccess?: (purchase: Purchase) => void;
    onPurchaseError?: (error: PurchaseError) => void;
    /**
     * iOS only. When enabled, the purchase success listener also receives
     * StoreKit replay events for a transaction ID already delivered during the
     * current connection session. Defaults to false.
     */
    purchaseUpdatedListenerOptions?: PurchaseUpdatedListenerOptions | null;
    /**
     * Called when a hook method such as fetchProducts, getAvailablePurchases,
     * getActiveSubscriptions or restorePurchases fails.
     */
    onError?: (error: Error) => void;
    onPromotedProductIOS?: (product: Product) => void;
    onUserChoiceBillingAndroid?: (details: UserChoiceBillingDetails) => void;
    /**
     * Fires when the user selects developer-provided billing in an External
     * Payments or Google-rendered Billing Choice flow.
     */
    onDeveloperProvidedBillingAndroid?: (details: DeveloperProvidedBillingDetailsAndroid) => void;
    /** Fires when a subscription enters a billing-issue state. */
    onSubscriptionBillingIssue?: (purchase: Purchase) => void;
    /**
     * Enable a specific billing program for Android (8.2.0+).
     * Use 'external-payments' for Developer Provided Billing (Japan only, 8.3.0+).
     * Use 'user-choice-billing' for User Choice Billing (7.0+).
     * Use 'billing-choice' for Billing Choice (9.1.0+).
     */
    enableBillingProgramAndroid?: BillingProgramAndroid;
    /**
     * Select who renders the Billing Choice screen (9.1.0+). Must match the
     * choiceScreenType returned by isBillingProgramAvailableAndroid.
     */
    billingChoiceScreenTypeAndroid?: BillingChoiceScreenTypeAndroid;
}
/**
 * React Hook for managing In-App Purchases.
 * See documentation at https://openiap.dev/docs/setup/expo#useIAP-hook
 */
export declare function useIAP(options?: UseIAPOptions): UseIap;
export {};
//# sourceMappingURL=useIAP.d.ts.map