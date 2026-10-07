import type { DeveloperProvidedBillingDetailsAndroid, MutationField, Product, ProductQueryType, Purchase, PurchaseUpdatedListenerOptions, QueryField, UserChoiceBillingDetails } from './types';
import { type PurchaseError } from './utils/errorMapping';
export * from './types';
export * from './modules/android';
export * from './modules/ios';
export * from './onside';
export * from './vega';
export declare enum OpenIapEvent {
    PurchaseUpdated = "purchase-updated",
    PurchaseError = "purchase-error",
    PromotedProductIOS = "promoted-product-ios",
    UserChoiceBillingAndroid = "user-choice-billing-android",
    /**
     * Fired for External Payments (8.3.0+) and Billing Choice (9.1.0+)
     * developer billing flows. Nullable fields depend on the selected flow.
     */
    DeveloperProvidedBillingAndroid = "developer-provided-billing-android",
    /** Fired when a subscription enters a billing-issue state; see `subscriptionBillingIssueListener`. */
    SubscriptionBillingIssue = "subscription-billing-issue"
}
type ExpoIapEventPayloads = {
    [OpenIapEvent.PurchaseUpdated]: Purchase;
    [OpenIapEvent.PurchaseError]: PurchaseError;
    [OpenIapEvent.PromotedProductIOS]: Product | string | {
        id?: string;
        productId?: string;
    };
    [OpenIapEvent.UserChoiceBillingAndroid]: UserChoiceBillingDetails;
    [OpenIapEvent.DeveloperProvidedBillingAndroid]: DeveloperProvidedBillingDetailsAndroid;
    [OpenIapEvent.SubscriptionBillingIssue]: Purchase;
};
type ExpoIapEventListener<E extends OpenIapEvent> = (payload: ExpoIapEventPayloads[E]) => void;
type ExpoIapEmitter = {
    addListener<E extends OpenIapEvent>(eventName: E, listener: ExpoIapEventListener<E>): {
        remove: () => void;
    };
    removeListener<E extends OpenIapEvent>(eventName: E, listener: ExpoIapEventListener<E>): void;
};
export declare const emitter: ExpoIapEmitter;
export type ProductTypeInput = ProductQueryType;
export declare const purchaseUpdatedListener: (listener: (event: Purchase) => void, options?: PurchaseUpdatedListenerOptions | null) => {
    remove: () => void;
};
export declare const purchaseErrorListener: (listener: (error: PurchaseError) => void) => {
    remove: () => void;
};
/**
 * iOS-only listener for App Store promoted product events.
 * This fires when a user taps on a promoted product in the App Store.
 *
 * @param listener - Callback function that receives the promoted product details
 * @returns EventSubscription that can be used to unsubscribe
 *
 * @example
 * ```typescript
 * const subscription = promotedProductListenerIOS((product) => {
 *   console.log('Promoted product:', product);
 *   // Handle the promoted product
 * });
 *
 * // Later, clean up
 * subscription.remove();
 * ```
 *
 * @platform iOS
 */
export declare const promotedProductListenerIOS: (listener: (product: Product) => void) => {
    remove: () => void;
};
/**
 * Android-only listener for User Choice Billing events.
 * This fires when a user selects alternative billing instead of Google Play billing
 * in the User Choice Billing dialog (only in 'user-choice' mode).
 *
 * @param listener - Callback function that receives the external transaction token and product IDs
 * @returns EventSubscription that can be used to unsubscribe
 *
 * @example
 * ```typescript
 * const subscription = userChoiceBillingListenerAndroid((details) => {
 *   console.log('User selected alternative billing');
 *   console.log('External transaction token received; send it to your backend without logging it.');
 *   console.log('Products:', details.products);
 *
 *   // Process payment in your system, then report token to Google
 *   await processPaymentAndReportToken(details);
 * });
 *
 * // Later, clean up
 * subscription.remove();
 * ```
 *
 * @platform Android
 */
export declare const userChoiceBillingListenerAndroid: (listener: (details: UserChoiceBillingDetails) => void) => {
    remove: () => void;
};
/**
 * Android-only listener for Developer Provided Billing events.
 * This fires when a user selects the developer's option in an External Payments
 * or Billing Choice purchase flow.
 *
 * @param listener - Callback that receives selected products and flow details
 * @returns EventSubscription that can be used to unsubscribe
 *
 * @example
 * ```typescript
 * const subscription = developerProvidedBillingListenerAndroid(async (details) => {
 *   await processPaymentWithYourGateway(details.products, details.linkUri);
 *   if (details.externalTransactionToken) {
 *     await reportExternalTransactionToGoogle(details.externalTransactionToken);
 *   }
 * });
 *
 * // Later, clean up
 * subscription.remove();
 * ```
 *
 * @platform Android (Play Billing Library 8.3.0+; Billing Choice 9.1.0+)
 */
export declare const developerProvidedBillingListenerAndroid: (listener: (details: DeveloperProvidedBillingDetailsAndroid) => void) => {
    remove: () => void;
};
/**
 * Listen for subscription billing-issue events (cross-platform).
 *
 * Fires when a user's active subscription enters a state that needs attention
 * for a payment problem. Unifies:
 * - iOS / Mac Catalyst 16.4+ and visionOS 1.0+: StoreKit 2 `Message.Reason.billingIssue`.
 * - Android (Play Billing 8.1+): when `Purchase.isSuspendedAndroid === true`.
 * - Meta Horizon, Amazon, macOS, tvOS, watchOS, and iOS before 16.4: never fires.
 *
 * Recommended UX: call `deepLinkToSubscriptions()` when this fires so the user
 * can update their payment method in the platform subscription center.
 *
 * @example
 * ```typescript
 * const subscription = subscriptionBillingIssueListener((purchase) => {
 *   console.warn('Needs attention:', purchase.productId);
 *   deepLinkToSubscriptions({
 *     skuAndroid: purchase.productId,
 *     packageNameAndroid: 'com.example.app',
 *   });
 * });
 * ```
 */
export declare const subscriptionBillingIssueListener: (listener: (purchase: Purchase) => void) => {
    remove: () => void;
};
/**
 * Initialize the store connection. Must be called before any other IAP API.
 *
 * @param config Optional connection config. Use `enableBillingProgramAndroid` (Android,
 *   Play Billing 8.2.0+) to opt into a billing program. For Billing Choice 9.1.0+, set
 *   `billingChoiceScreenTypeAndroid` to the renderer configured in Play Console.
 *   iOS ignores Android-specific fields.
 * @returns Promise resolving to `true` when the platform billing client is connected.
 * @throws When the platform billing client fails to initialize.
 *
 * @example
 * ```ts
 * await initConnection();
 * await initConnection({ enableBillingProgramAndroid: 'external-offer' });
 * await initConnection({
 *   enableBillingProgramAndroid: 'billing-choice',
 *   billingChoiceScreenTypeAndroid: 'developer-rendered',
 * });
 * ```
 *
 * @remarks When using `useIAP()`, connection is auto-managed on mount/unmount —
 *   pass options to the hook instead of calling this directly.
 *
 * @see {@link https://openiap.dev/docs/apis/init-connection}
 */
export declare const initConnection: MutationField<'initConnection'>;
/**
 * Close the store connection and release resources.
 *
 * @see {@link https://openiap.dev/docs/apis/end-connection}
 */
export declare const endConnection: MutationField<'endConnection'>;
/**
 * Retrieve products or subscriptions from the store by SKU.
 *
 * @param request `ProductRequest` — `skus` (string[]) and optional `type`
 *   (`'in-app' | 'subs' | 'all'`, defaults to `'in-app'`).
 * @returns Promise resolving to a `FetchProductsResult` union — `Product[]` for `'in-app'`,
 *   `ProductSubscription[]` for `'subs'`, or a mixed array for `'all'`.
 * @throws When the store rejects the request (empty `skus`, not connected,
 *   network/store error). Unknown SKUs are omitted from the result, not thrown.
 *
 * @example
 * ```ts
 * const products = await fetchProducts({
 *   skus: ['com.app.coins_100', 'com.app.premium'],
 *   type: 'in-app',
 * });
 * ```
 *
 * @remarks Promise-based, unlike the event-based `request*` APIs such as `requestPurchase`.
 *
 * @see {@link https://openiap.dev/docs/apis/fetch-products}
 */
export declare const fetchProducts: QueryField<'fetchProducts'>;
/**
 * List the user's unfinished purchases: non-consumables, active subscriptions,
 * and pending transactions.
 *
 * @param options Optional `PurchaseOptions`. iOS-only flags:
 *   `alsoPublishToEventListenerIOS`, `onlyIncludeActiveItemsIOS`.
 * @returns Promise resolving to an array of `Purchase` currently held by the store.
 * @throws When the platform query fails.
 *
 * @example
 * ```ts
 * const purchases = await getAvailablePurchases();
 * for (const p of purchases) {
 *   if (await verifyOnServer(p)) await finishTransaction({ purchase: p, isConsumable: false });
 * }
 * ```
 *
 * @see {@link https://openiap.dev/docs/apis/get-available-purchases}
 */
export declare const getAvailablePurchases: QueryField<'getAvailablePurchases'>;
/**
 * Get all active subscriptions. On iOS each entry carries `renewalInfoIOS`
 * (e.g. pendingUpgradeProductId, willAutoRenew, autoRenewPreference); on
 * Android they are filtered from the available purchases.
 *
 * @param subscriptionIds - Optional array of subscription product IDs to filter. If not provided, returns all active subscriptions.
 * @returns Promise resolving to array of active subscriptions with details
 *
 * @example
 * ```typescript
 * // Get all active subscriptions
 * const subs = await getActiveSubscriptions();
 *
 * // Get specific subscriptions
 * const premiumSubs = await getActiveSubscriptions(['premium', 'premium_year']);
 *
 * // Check for pending upgrades (iOS)
 * subs.forEach(sub => {
 *   if (sub.renewalInfoIOS?.pendingUpgradeProductId) {
 *     console.log(`Upgrade pending to: ${sub.renewalInfoIOS.pendingUpgradeProductId}`);
 *   }
 * });
 * ```
 *
 * @see {@link https://openiap.dev/docs/apis/get-active-subscriptions}
 */
export declare const getActiveSubscriptions: QueryField<'getActiveSubscriptions'>;
/**
 * Check if user has any active subscriptions.
 *
 * @param subscriptionIds - Optional array of subscription product IDs to check. If not provided, checks all subscriptions.
 * @returns Promise resolving to true if user has at least one active subscription
 *
 * @example
 * ```typescript
 * // Check any active subscription
 * const hasAny = await hasActiveSubscriptions();
 *
 * // Check specific subscriptions
 * const hasPremium = await hasActiveSubscriptions(['premium', 'premium_year']);
 * ```
 *
 * @see {@link https://openiap.dev/docs/apis/has-active-subscriptions}
 */
export declare const hasActiveSubscriptions: QueryField<'hasActiveSubscriptions'>;
/**
 * Return the user's storefront country code.
 *
 * @see {@link https://openiap.dev/docs/apis/get-storefront}
 */
export declare const getStorefront: QueryField<'getStorefront'>;
/**
 * Initiate a purchase or subscription flow. The result arrives through
 * `purchaseUpdatedListener` / `purchaseErrorListener` (or `useIAP`'s
 * `onPurchaseSuccess` / `onPurchaseError`), not the return value.
 *
 * @param args `RequestPurchaseProps`, discriminated by `type`:
 *   - `type: 'in-app'` — pass `request.apple.sku` (iOS) and/or `request.google.skus` (Android).
 *   - `type: 'subs'`  — same shape, plus `request.google.subscriptionOffers: [{ sku, offerToken }]`.
 * @returns The dispatched purchase payload; do not rely on it for the outcome.
 * @throws Synchronous rejection from the store (e.g. `ErrorCode.NotPrepared`, validation failure).
 *
 * @example
 * ```ts
 * await requestPurchase({
 *   request: {
 *     apple: { sku: 'com.app.premium' },
 *     google: { skus: ['com.app.premium'] },
 *   },
 *   type: 'in-app',
 * });
 * ```
 *
 * @see {@link https://openiap.dev/docs/apis/request-purchase}
 */
export declare const requestPurchase: MutationField<'requestPurchase'>;
/**
 * Complete a purchase transaction. Call after server-side verification to remove it
 * from the queue.
 *
 * @param args.purchase The `Purchase` to finalize.
 * @param args.isConsumable `true` for consumables (consumes the token so the SKU can be
 *   re-bought, e.g. coins); `false` (default) for non-consumables and subscriptions.
 * @returns Promise that resolves once the platform finalizes the transaction.
 * @throws When the platform finalize call fails.
 *
 * @example
 * ```ts
 * // Inside purchaseUpdatedListener:
 * if (await verifyOnServer(purchase)) {
 *   await finishTransaction({ purchase, isConsumable: false });
 * }
 * ```
 *
 * @remarks Android purchases must be finalized within 3 days or Google
 *   auto-refunds. iOS unfinished transactions replay on every app launch.
 *
 * @see {@link https://openiap.dev/docs/apis/finish-transaction}
 */
export declare const finishTransaction: MutationField<'finishTransaction'>;
/**
 * Restore completed transactions. Returns nothing; read the restored items with
 * `getAvailablePurchases` or from hook state.
 *
 * - iOS: sync (or Onside restore when OnsideKit is active), then fetch available purchases.
 * - Android: fetch available purchases; the query itself restores them.
 *
 * @see {@link https://openiap.dev/docs/apis/restore-purchases}
 */
export declare const restorePurchases: MutationField<'restorePurchases'>;
/**
 * Deeplinks to native interface that allows users to manage their subscriptions
 * @param options.skuAndroid - Required for Android to locate specific subscription (ignored on iOS)
 * @param options.packageNameAndroid - Required for Android to identify your app (ignored on iOS)
 *
 * @returns Promise that resolves when the deep link is successfully opened
 *
 * @throws {Error} When called on unsupported platform or when required Android parameters are missing
 *
 * @example
 * import { deepLinkToSubscriptions } from 'expo-iap';
 *
 * // Works on both iOS and Android
 * await deepLinkToSubscriptions({
 *   skuAndroid: 'your_subscription_sku',
 *   packageNameAndroid: 'com.example.app'
 * });
 *
 * @see {@link https://openiap.dev/docs/apis/deep-link-to-subscriptions}
 */
export declare const deepLinkToSubscriptions: MutationField<'deepLinkToSubscriptions'>;
/**
 * Open the platform's offer/promo code redemption flow.
 *
 * Resolves the redeemed purchase only when the store reports it synchronously;
 * every other path resolves null, so reconcile with `getAvailablePurchases`
 * when the app resumes.
 *
 * @returns Promise resolving to the redeemed purchase, or null
 * @throws Error when a redemption flow exists but cannot be opened
 *
 * @see {@link https://openiap.dev/docs/apis/open-redeem-offer-code}
 */
export declare const openRedeemOfferCode: MutationField<'openRedeemOfferCode'>;
/**
 * Verify purchase with the configured providers.
 *
 * @param options - Receipt validation options containing the SKU
 * @returns Promise resolving to receipt validation result
 *
 * @see {@link https://openiap.dev/docs/features/validation#verify-purchase}
 */
export declare const verifyPurchase: MutationField<'verifyPurchase'>;
/**
 * Verify purchase with a specific provider (e.g., IAPKit).
 *
 * @param options - Verification options including provider and credentials
 * @returns Promise resolving to provider-specific verification result
 *
 * @example
 * ```typescript
 * const result = await verifyPurchaseWithProvider({
 *   provider: 'iapkit',
 *   iapkit: {
 *     apiKey: 'your-api-key',
 *     // Choose exactly one store payload.
 *     // apple: { jws: purchase.purchaseToken },
 *     // google: { purchaseToken: purchase.purchaseToken },
 *     amazon: {
 *       expectedProductId: purchase.productId,
 *       userId: amazonUserId,
 *       receiptId: purchase.purchaseToken,
 *       // Enable only for App Tester after the IAPKit project opt-in.
 *       sandbox: amazonSandboxEnabled,
 *     }
 *   }
 * });
 * ```
 *
 * @see {@link https://openiap.dev/docs/features/validation#verify-purchase-with-provider}
 */
export declare const verifyPurchaseWithProvider: MutationField<'verifyPurchaseWithProvider'>;
export * from './useIAP';
export { kitApi, KitApiError } from './kit-api';
export type { KitApiOptions, KitClientPayloadCache, KitClientPayloadOptions, KitClientPayloadResponse, KitProduct, KitProductClientPayload, KitProductOffer, KitProductPlatform, KitProductsOptions, KitProductsResponse, KitSubscription, EntitlementsResponse, StatusResponse, } from './kit-api';
export { ErrorCodeUtils, ErrorCodeMapping, createPurchaseError, createPurchaseErrorFromPlatform, getUserFriendlyErrorMessage, isUserCancelledError, } from './utils/errorMapping';
export type { PurchaseError as ExpoPurchaseError, PurchaseErrorProps, } from './utils/errorMapping';
export { ExpoIapConsole } from './utils/debug';
//# sourceMappingURL=index.d.ts.map