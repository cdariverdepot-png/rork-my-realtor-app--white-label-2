/** Helpers for platform error codes and structured purchase errors. */
import { ErrorCode, type IapPlatform, type SubResponseCodeAndroid } from '../types';
export interface PurchaseErrorProps {
    message?: string;
    responseCode?: number;
    debugMessage?: string;
    code?: ErrorCode | string | number;
    productId?: string;
    productIds?: string[];
    productType?: string;
    isEmptyProductList?: boolean;
    subResponseCodeAndroid?: SubResponseCodeAndroid;
    platform?: IapPlatform;
}
export interface PurchaseError extends Error {
    responseCode?: number;
    debugMessage?: string;
    code?: ErrorCode;
    productId?: string;
    productIds?: string[];
    productType?: string;
    isEmptyProductList?: boolean;
    subResponseCodeAndroid?: SubResponseCodeAndroid;
    platform?: IapPlatform;
}
/**
 * Prefix shared with the native Expo bridges. Expo Modules only transports an
 * exception code and message for rejected async functions, so native bridges
 * append the canonical PurchaseError payload to the message with this marker.
 */
export declare const OPENIAP_ERROR_ENVELOPE_PREFIX = "OPENIAP_ERROR_JSON:";
export declare const ErrorCodeMapping: {
    readonly ios: Record<ErrorCode, string>;
    readonly android: Record<ErrorCode, string>;
};
export declare const createPurchaseError: (props: PurchaseErrorProps) => PurchaseError;
export declare const createPurchaseErrorFromPlatform: (errorData: PurchaseErrorProps, platform: IapPlatform) => PurchaseError;
/**
 * Rebuild a canonical PurchaseError from an Expo Modules Promise rejection,
 * read from the message envelope (see OPENIAP_ERROR_ENVELOPE_PREFIX). Direct
 * fields are accepted too, for the Vega/Onside adapters and older native builds.
 */
export declare const createPurchaseErrorFromNativeException: (error: unknown, platform: IapPlatform, fallback?: PurchaseErrorProps) => PurchaseError;
export declare const ErrorCodeUtils: {
    getNativeErrorCode: (errorCode: ErrorCode) => string;
    fromPlatformCode: (platformCode: string | number | null | undefined, platform: IapPlatform) => ErrorCode;
    toPlatformCode: (errorCode: ErrorCode, _platform: IapPlatform) => string | number;
    isValidForPlatform: (errorCode: ErrorCode, _platform: IapPlatform) => boolean;
};
type ErrorLike = string | {
    code?: ErrorCode | string;
    message?: string;
};
export declare function isUserCancelledError(error: unknown): boolean;
export declare function isNetworkError(error: unknown): boolean;
export declare function isRecoverableError(error: unknown): boolean;
/**
 * End-user copy for a known error code, derived from the code by design: the
 * native message can name build configuration a customer must not be shown.
 * Developers get that diagnostic as `error.message`.
 */
export declare function getUserFriendlyErrorMessage(error: ErrorLike): string;
export {};
//# sourceMappingURL=errorMapping.d.ts.map