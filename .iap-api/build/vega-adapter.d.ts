import type { ActiveSubscription, Product, ProductSubscription, Purchase, PurchaseOptions, VerifyPurchaseWithProviderProps, VerifyPurchaseWithProviderResult } from './types';
type VegaListener = (payload: any) => void;
interface VegaPrice {
    priceCurrencyCode?: string | null;
    priceStr?: string | null;
    valueInMicros?: bigint | number | string | null;
}
interface VegaProduct {
    description?: string | null;
    freeTrialPeriod?: string | null;
    itemType?: unknown;
    price?: VegaPrice | number | string | null;
    productType?: unknown;
    sku?: string | null;
    subscriptionBase?: string | null;
    subscriptionParent?: string | null;
    subscriptionPeriod?: string | null;
    term?: string | null;
    title?: string | null;
}
interface VegaReceipt {
    cancelDate?: Date | number | string | null;
    deferredDate?: Date | number | string | null;
    deferredSku?: string | null;
    isCancelled?: boolean | null;
    isDeferred?: boolean | null;
    productType?: unknown;
    purchaseDate?: Date | number | string | null;
    receiptId?: string | null;
    sku?: string | null;
    termSku?: string | null;
}
interface VegaUserData {
    countryCode?: string | null;
    marketplace?: string | null;
    userId?: string | null;
}
interface VegaResponse {
    responseCode?: unknown;
}
interface VegaProductDataResponse extends VegaResponse {
    productData?: Map<string, VegaProduct> | Record<string, VegaProduct> | null;
}
interface VegaPurchaseResponse extends VegaResponse {
    receipt?: VegaReceipt | null;
    userData?: VegaUserData | null;
}
interface VegaPurchaseUpdatesResponse extends VegaResponse {
    hasMore?: boolean | null;
    receiptList?: VegaReceipt[] | null;
    userData?: VegaUserData | null;
}
interface VegaUserDataResponse extends VegaResponse {
    userData?: VegaUserData | null;
}
interface VegaUserDataRequest {
    fetchUserProfileAccessConsentStatus: boolean;
}
export interface VegaPurchasingService {
    getProductData(request: {
        skus: string[];
    }): Promise<VegaProductDataResponse>;
    getPurchaseUpdates(request: {
        reset: boolean;
    }): Promise<VegaPurchaseUpdatesResponse>;
    getUserData(request: VegaUserDataRequest): Promise<VegaUserDataResponse>;
    notifyFulfillment(request: {
        fulfillmentResult: number;
        receiptId: string;
    }): Promise<VegaResponse>;
    purchase(request: {
        sku: string;
    }): Promise<VegaPurchaseResponse>;
}
export interface ExpoIapVegaModule {
    ERROR_CODES: Record<string, string>;
    acknowledgePurchaseAndroid(purchaseToken: string): Promise<void>;
    addListener(eventName: string, listener: VegaListener): {
        remove: () => void;
    };
    consumePurchaseAndroid(purchaseToken: string): Promise<void>;
    endConnection(): Promise<boolean>;
    fetchProducts(type: string, skus: string[]): Promise<(Product | ProductSubscription)[]>;
    getActiveSubscriptions(subscriptionIds?: string[] | null): Promise<ActiveSubscription[]>;
    getAvailableItems(options?: PurchaseOptions): Promise<Purchase[]>;
    getStorefront(): Promise<string>;
    hasActiveSubscriptions(subscriptionIds?: string[] | null): Promise<boolean>;
    initConnection(config?: unknown): Promise<boolean>;
    removeListener(eventName: string, listener: VegaListener): void;
    requestPurchase(params: {
        skus?: string[];
        type?: string;
    }): Promise<Purchase[]>;
    verifyPurchaseWithProvider(options: VerifyPurchaseWithProviderProps): Promise<VerifyPurchaseWithProviderResult>;
}
export declare function createExpoIapVegaModule(service: VegaPurchasingService): ExpoIapVegaModule;
export {};
//# sourceMappingURL=vega-adapter.d.ts.map