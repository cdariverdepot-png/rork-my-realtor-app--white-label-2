import type { BillingProgramAndroid, BillingProgramReportingDetailsAndroid, DeepLinkOptions, DeveloperBillingTypeAndroid, MutationCreateBillingProgramReportingDetailsAndroidArgs, MutationField, QueryField } from '../types';
export declare function isProductAndroid<T extends {
    platform?: string;
}>(item: unknown): item is T & {
    platform: 'android';
};
/**
 * Deep link to subscriptions screen on Android.
 * @param {Object} params - The parameters object
 * @param {string} params.skuAndroid - The product's SKU (on Android)
 * @param {string} params.packageNameAndroid - The package name of your Android app (e.g., 'com.example.app')
 * @returns {Promise<void>}
 *
 * @example
 * ```typescript
 * await deepLinkToSubscriptionsAndroid({
 *   skuAndroid: 'subscription_id',
 *   packageNameAndroid: 'com.example.app'
 * });
 * ```
 */
export declare const deepLinkToSubscriptionsAndroid: (options?: DeepLinkOptions | null) => Promise<void>;
/**
 * Consume a purchase token so the user can purchase the same product again
 * (Android consumable products). Prefer using `finishTransaction` with
 * `isConsumable: true`, which dispatches to this under the hood.
 *
 * @see {@link https://openiap.dev/docs/apis/android/consume-purchase-android}
 */
export declare const consumePurchaseAndroid: MutationField<'consumePurchaseAndroid'>;
/**
 * Acknowledge a non-consumable purchase or subscription (Android only).
 * @param {Object} params - The parameters object
 * @param {string} params.token - The product's token (on Android)
 * @returns {Promise<VoidResult | void>}
 * @throws Error if called on a non-Android platform
 *
 * @see {@link https://openiap.dev/docs/apis/android/acknowledge-purchase-android}
 */
export declare const acknowledgePurchaseAndroid: MutationField<'acknowledgePurchaseAndroid'>;
/**
 * Open the Play Store offer/promo code redeem page; other store flavors return
 * false. Needs no initialized billing client or Play Billing version. A listener
 * can receive the purchase while billing is connected; reconcile available
 * purchases on resume.
 *
 * @returns Promise resolving to true when launched, or false when unsupported
 *
 * @deprecated Use `openRedeemOfferCode` instead. Scheduled for removal in
 * client protocol 1.0.0.
 *
 * @see {@link https://openiap.dev/docs/apis/android/open-redeem-offer-code-android}
 */
export declare const openRedeemOfferCodeAndroid: MutationField<'openRedeemOfferCodeAndroid'>;
/**
 * Check if a specific billing program is available for this user/device (Android only).
 * Available in Google Play Billing Library 8.2.0+. Billing Choice availability
 * details, including the configured renderer and external-link support, require 9.1.0+.
 *
 * @param program - The billing program to check
 * @returns Promise resolving to availability result
 *
 * @example
 * ```typescript
 * const result = await isBillingProgramAvailableAndroid('external-offer');
 * if (result.isAvailable) {
 *   // Proceed with billing program flow
 * }
 * ```
 *
 * @see {@link https://openiap.dev/docs/apis/android/is-billing-program-available-android}
 */
export declare const isBillingProgramAvailableAndroid: MutationField<'isBillingProgramAvailableAndroid'>;
/**
 * Fetch Play Billing assets and loyalty text for developer-rendered Billing Choice screens.
 * Available in Google Play Billing Library 9.1.0+.
 *
 * @param params - Billing Choice info request parameters
 * @returns Promise resolving to Play Billing Choice display information
 *
 * @see {@link https://openiap.dev/docs/apis/android/get-billing-choice-info-android}
 */
export declare const getBillingChoiceInfoAndroid: QueryField<'getBillingChoiceInfoAndroid'>;
/**
 * Launch an external link for the specified billing program (Android only).
 * Available in Google Play Billing Library 8.2.0+; developer-rendered Billing
 * Choice external-link flows require 9.1.0+ and `externalTransactionToken`.
 *
 * @param params - The external link parameters
 * @returns Promise resolving to true if the link was launched successfully
 *
 * @example
 * ```typescript
 * await launchExternalLinkAndroid({
 *   billingProgram: 'billing-choice',
 *   externalTransactionToken: 'pre-generated-token',
 *   launchMode: 'launch-in-external-browser-or-app',
 *   linkType: 'link-to-digital-content-offer',
 *   linkUri: 'https://your-payment-site.com',
 * });
 * ```
 *
 * @see {@link https://openiap.dev/docs/apis/android/launch-external-link-android}
 */
export declare const launchExternalLinkAndroid: MutationField<'launchExternalLinkAndroid'>;
export declare function createBillingProgramReportingDetailsAndroid(args: MutationCreateBillingProgramReportingDetailsAndroidArgs): Promise<BillingProgramReportingDetailsAndroid>;
export declare function createBillingProgramReportingDetailsAndroid(program: BillingProgramAndroid, developerBillingType?: DeveloperBillingTypeAndroid | null): Promise<BillingProgramReportingDetailsAndroid>;
/**
 * Show Google's mandatory information dialog before a developer-rendered,
 * in-app Billing Choice screen.
 * Available in Google Play Billing Library 9.1.0+.
 *
 * @param params - Dialog parameters with the external transaction token
 * @returns Promise resolving to BillingResult
 *
 * @see {@link https://openiap.dev/docs/apis/android/show-billing-program-information-dialog-android}
 */
export declare const showBillingProgramInformationDialogAndroid: MutationField<'showBillingProgramInformationDialogAndroid'>;
/**
 * Show Play Billing in-app messages, such as transactional subscription updates.
 * Available in Google Play Billing Library 4.1.0+.
 *
 * @param params - Optional in-app message categories
 * @returns Promise resolving to in-app message result
 *
 * @see {@link https://openiap.dev/docs/apis/android/show-in-app-messages-android}
 */
export declare const showInAppMessagesAndroid: MutationField<'showInAppMessagesAndroid'>;
//# sourceMappingURL=android.d.ts.map