import type { MutationField, Purchase, QueryField } from '../types';
import { type PurchaseError } from '../utils/errorMapping';
export type TransactionEvent = {
    transaction?: Purchase;
    error?: PurchaseError;
};
export declare function isProductIOS<T extends {
    platform?: string;
}>(item: unknown): item is T & {
    platform: 'ios';
};
/**
 * Sync state with Appstore (iOS only)
 * https://developer.apple.com/documentation/storekit/appstore/3791906-sync
 *
 * @returns Promise resolving to true on success
 * @throws Error if called on non-iOS platform
 *
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/sync-ios}
 */
export declare const syncIOS: MutationField<'syncIOS'>;
/**
 * Check if user is eligible for introductory offer
 *
 * @param groupId - The subscription group ID
 * @returns Promise resolving to true if eligible
 * @throws Error if called on non-iOS platform
 *
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/is-eligible-for-intro-offer-ios}
 */
export declare const isEligibleForIntroOfferIOS: QueryField<'isEligibleForIntroOfferIOS'>;
/**
 * Get subscription status for a specific SKU
 *
 * @param sku The product SKU
 * @returns Promise resolving to array of subscription status
 * @throws Error if called on non-iOS platform
 *
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/subscription-status-ios}
 */
export declare const subscriptionStatusIOS: QueryField<'subscriptionStatusIOS'>;
/**
 * Get current entitlement for a specific SKU
 *
 * @param sku The product SKU
 * @returns Promise resolving to current entitlement
 * @throws Error if called on non-iOS platform
 *
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/current-entitlement-ios}
 */
export declare const currentEntitlementIOS: QueryField<'currentEntitlementIOS'>;
/**
 * Get latest transaction for a specific SKU
 *
 * @param sku The product SKU
 * @returns Promise resolving to latest transaction
 * @throws Error if called on non-iOS platform
 *
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/latest-transaction-ios}
 */
export declare const latestTransactionIOS: QueryField<'latestTransactionIOS'>;
/**
 * Begin refund request for a specific SKU
 *
 * @param sku The product SKU
 * @returns Promise resolving to refund request status
 * @throws Error if called on non-iOS platform
 *
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/begin-refund-request-ios}
 */
export declare const beginRefundRequestIOS: MutationField<'beginRefundRequestIOS'>;
/**
 * Shows the system UI for managing subscriptions.
 * Returns an array of subscriptions that had status changes after the UI is closed.
 *
 * @returns Promise<Purchase[]> - Array of subscriptions with status changes (e.g., auto-renewal toggled)
 * @throws Error if called on non-iOS platform
 *
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/show-manage-subscriptions-ios}
 */
export declare const showManageSubscriptionsIOS: MutationField<'showManageSubscriptionsIOS'>;
/**
 * Get the device's base64 receipt data to send to your server. Verify it there
 * with Apple's verifyReceipt endpoint, never directly from the app.
 *
 * @returns {Promise<string>} Base64 encoded receipt data
 *
 * @see {@link https://openiap.dev/docs/apis/ios/get-receipt-data-ios}
 */
export declare const getReceiptDataIOS: QueryField<'getReceiptDataIOS'>;
/**
 * Refresh the receipt from Apple (AppStore.sync()) and return it. Use after a
 * first purchase, when getReceiptDataIOS() can return an empty string because
 * the receipt file is not written to disk yet.
 *
 * @returns {Promise<string>} Base64 encoded receipt data
 *
 * @platform iOS
 */
export declare const requestReceiptRefreshIOS: () => Promise<string>;
/**
 * Check if a transaction is verified through StoreKit 2.
 * StoreKit 2 performs local verification of transaction JWS signatures.
 *
 * @param sku The product's SKU (on iOS)
 * @returns Promise resolving to true if the transaction is verified
 * @throws Error if called on non-iOS platform
 *
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/is-transaction-verified-ios}
 */
export declare const isTransactionVerifiedIOS: QueryField<'isTransactionVerifiedIOS'>;
/**
 * Get the JWS representation of a purchase for server-side verification.
 * The JWS (JSON Web Signature) can be verified on your server using Apple's public keys.
 *
 * @param sku The product's SKU (on iOS)
 * @returns Promise resolving to JWS representation of the transaction
 * @throws Error if called on non-iOS platform
 *
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/get-transaction-jws-ios}
 */
export declare const getTransactionJwsIOS: QueryField<'getTransactionJwsIOS'>;
/**
 * Present the offer code redemption sheet. Real devices only, not simulators.
 *
 * @returns The verified redeemed purchase when built with Xcode 27+ and
 * running on Apple 27+. Earlier iOS/visionOS system sheets return null;
 * Catalyst 16–26 surfaces StoreKitError.unknown, and Catalyst 15 is a no-op
 * that returns null.
 * @throws Error if called on non-iOS platform or tvOS
 *
 * @platform iOS
 *
 * @deprecated Use `openRedeemOfferCode` instead. Scheduled for removal in
 * client protocol 1.0.0.
 *
 * @see {@link https://openiap.dev/docs/apis/ios/present-code-redemption-sheet-ios}
 */
export declare const presentCodeRedemptionSheetIOS: MutationField<'presentCodeRedemptionSheetIOS'>;
/**
 * Get the AppTransaction: the initial purchase that unlocked the app.
 * Requires iOS 16.0+ at runtime and Xcode 15.0+ (iOS 16.0 SDK) to compile.
 *
 * @returns Promise resolving to the app transaction information or null if not available
 * @throws Error if called on non-iOS platform, iOS version < 16.0, or compiled with older SDK
 *
 * @platform iOS
 * @since iOS 16.0
 *
 * @see {@link https://openiap.dev/docs/apis/ios/get-app-transaction-ios}
 */
export declare const getAppTransactionIOS: QueryField<'getAppTransactionIOS'>;
/**
 * Get information about a promoted product if one is available (iOS only).
 * Promoted products are products that the App Store promotes on your behalf.
 * This is called after a promoted product event is received from the App Store.
 *
 * @returns Promise resolving to the promoted product information or null if none available
 * @throws Error if called on non-iOS platform
 *
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/get-promoted-product-ios}
 */
export declare const getPromotedProductIOS: QueryField<'getPromotedProductIOS'>;
/**
 * Get pending transactions that haven't been finished yet (iOS only).
 *
 * @returns Promise resolving to array of pending transactions
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/get-pending-transactions-ios}
 */
export declare const getPendingTransactionsIOS: QueryField<'getPendingTransactionsIOS'>;
/**
 * List every StoreKit transaction (finished + unfinished) for the current user.
 *
 * @see {@link https://openiap.dev/docs/apis/ios/get-all-transactions-ios}
 */
export declare const getAllTransactionsIOS: QueryField<'getAllTransactionsIOS'>;
/**
 * Clear a specific transaction (iOS only).
 *
 * @returns Promise resolving when transaction is cleared
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/clear-transaction-ios}
 */
export declare const clearTransactionIOS: MutationField<'clearTransactionIOS'>;
/**
 * Deep link to subscriptions screen on iOS.
 * @returns {Promise<void>}
 *
 * @platform iOS
 */
export declare const deepLinkToSubscriptionsIOS: () => Promise<void>;
/**
 * Check if the device can present an external purchase notice sheet (iOS 17.4+).
 * Wraps `ExternalPurchase.canPresent`.
 *
 * @returns Promise resolving to true if the notice sheet can be presented
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/can-present-external-purchase-notice-ios}
 */
export declare const canPresentExternalPurchaseNoticeIOS: QueryField<'canPresentExternalPurchaseNoticeIOS'>;
/**
 * Present an external purchase notice sheet to inform users about external purchases (iOS 17.4+).
 * This must be called before opening an external purchase link.
 * Returns the external purchase token when user continues.
 *
 * @returns Promise resolving to the result with action, token, and error if any
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/present-external-purchase-notice-sheet-ios}
 */
export declare const presentExternalPurchaseNoticeSheetIOS: MutationField<'presentExternalPurchaseNoticeSheetIOS'>;
/**
 * Present an external purchase link to redirect users to your website (iOS 16.0+).
 *
 * @param url - The external purchase URL to open
 * @returns Promise resolving to the result with success status and error if any
 * @platform iOS
 *
 * @see {@link https://openiap.dev/docs/apis/ios/present-external-purchase-link-ios}
 */
export declare const presentExternalPurchaseLinkIOS: MutationField<'presentExternalPurchaseLinkIOS'>;
/**
 * Check if app is eligible for ExternalPurchaseCustomLink API (iOS 18.1+).
 *
 * @returns Promise resolving to true if eligible
 * @platform iOS
 * @see https://developer.apple.com/documentation/storekit/externalpurchasecustomlink/iseligible
 *
 * @see {@link https://openiap.dev/docs/apis/ios/is-eligible-for-external-purchase-custom-link-ios}
 */
export declare const isEligibleForExternalPurchaseCustomLinkIOS: QueryField<'isEligibleForExternalPurchaseCustomLinkIOS'>;
/**
 * Get external purchase token for reporting to Apple (iOS 18.1+).
 * Use this token with Apple's External Purchase Server API to report transactions.
 *
 * @param tokenType - Token type: 'acquisition' (new customers) or 'services' (existing customers)
 * @returns Promise resolving to the token result with token string or error
 * @platform iOS
 * @see https://developer.apple.com/documentation/storekit/externalpurchasecustomlink/token(for:)
 *
 * @see {@link https://openiap.dev/docs/apis/ios/get-external-purchase-custom-link-token-ios}
 */
export declare const getExternalPurchaseCustomLinkTokenIOS: QueryField<'getExternalPurchaseCustomLinkTokenIOS'>;
/**
 * Show ExternalPurchaseCustomLink notice sheet (iOS 18.1+).
 * Call this after a deliberate customer interaction before linking out to external purchases.
 *
 * @param noticeType - Notice type: 'browser' (external purchases displayed in browser)
 * @returns Promise resolving to the result with continued status and error if any
 * @platform iOS
 * @see https://developer.apple.com/documentation/storekit/externalpurchasecustomlink/shownotice(type:)
 *
 * @see {@link https://openiap.dev/docs/apis/ios/show-external-purchase-custom-link-notice-ios}
 */
export declare const showExternalPurchaseCustomLinkNoticeIOS: MutationField<'showExternalPurchaseCustomLinkNoticeIOS'>;
//# sourceMappingURL=ios.d.ts.map