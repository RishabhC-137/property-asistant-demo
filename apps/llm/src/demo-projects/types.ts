import type { GalleryImage, PropertyCard } from "@property-assistant/contracts";
import type { NearbyPlace, PaymentStage } from "../types.js";

export interface DemoProjectCase {
    card: PropertyCard;
    aliases: string[];
    bookingAmountInr: number;
    paymentPlan: PaymentStage[];
    nearby: NearbyPlace[];
    loanBanks: string[];
    locationAdvantages: string[];
    gallery: GalleryImage[];
}
