import { z } from "zod";
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((s) => !/[\r\n<>]/.test(s))
    .nullable()
    .optional();
const amount = z.number().int().min(0).max(100000000).nullable().optional();
export const listingDetailsSchema = z
  .object({
    propertyName: text(120),
    rentYen: amount,
    managementFeeYen: amount,
    deposit: text(80),
    keyMoney: text(80),
    layout: text(40),
    floorAreaM2: z.number().positive().max(100000).nullable().optional(),
    nearestStation: text(120),
    walkMinutes: z.number().int().min(0).max(999).nullable().optional(),
    address: text(256),
    buildingAgeYears: z.number().int().min(0).max(300).nullable().optional(),
  })
  .strict();
export type ListingDetails = z.infer<typeof listingDetailsSchema>;
export type EmailListing = ListingDetails & { url: string };
export const listingDetailLabels: Record<keyof ListingDetails, string> = {
  propertyName: "物件名",
  rentYen: "賃料（円）",
  managementFeeYen: "管理費・共益費（円）",
  deposit: "敷金",
  keyMoney: "礼金",
  layout: "間取り",
  floorAreaM2: "専有面積（㎡）",
  nearestStation: "最寄り駅",
  walkMinutes: "徒歩（分）",
  address: "所在地",
  buildingAgeYears: "築年数",
};
export const numericListingFields = new Set<keyof ListingDetails>([
  "rentYen",
  "managementFeeYen",
  "floorAreaM2",
  "walkMinutes",
  "buildingAgeYears",
]);
