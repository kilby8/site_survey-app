/**
 * services/googleMapsService.ts
 *
 * Implementation of Google Address Validation API.
 * https://developers.google.com/maps/documentation/address-validation/overview
 */

const GOOGLE_VALIDATION_URL = "https://addressvalidation.googleapis.com/v1:validateAddress";
const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export type AddressValidationGranularity =
  | "PREMISE"
  | "ROUTE"
  | "LOCALITY"
  | "ADMINISTRATIVE_AREA"
  | "COUNTRY"
  | "UNKNOWN";

export interface AddressValidationResult {
  isValid: boolean;
  formattedAddress: string;
  granularity: AddressValidationGranularity;
  gps: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  components?: {
    streetNumber?: string;
    route?: string;
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    countryCode?: string;
  };
  source?: "google" | "solarpro";
}

export interface GoogleAddressValidationResponse {
  result: {
    verdict: {
      inputGranularity: string;
      validationGranularity: string;
      geocodeGranularity: string;
      addressComplete?: boolean;
      hasUnconfirmedComponents?: boolean;
      hasInferredComponents?: boolean;
      hasReplacedComponents?: boolean;
    };
    address: {
      formattedAddress: string;
      postalAddress: {
        regionCode: string;
        languageCode: string;
        postalCode: string;
        administrativeArea: string;
        locality: string;
        addressLines: string[];
      };
      addressComponents: Array<{
        componentName: { text: string; languageCode: string };
        componentType: string;
        confirmationLevel: string;
        inferred?: boolean;
        replaced?: boolean;
        unexpected?: boolean;
      }>;
    };
    geocode: {
      location: {
        latitude: number;
        longitude: number;
      };
      plusCode?: {
        globalCode: string;
        compoundCode: string;
      };
      bounds?: {
        low: { latitude: number; longitude: number };
        high: { latitude: number; longitude: number };
      };
      featureSizeMeters?: number;
      placeId?: string;
      placeTypes?: string[];
    };
    metadata?: {
      business?: boolean;
      poBox?: boolean;
      residential?: boolean;
    };
    uspsData?: Record<string, unknown>;
  };
  responseId: string;
}

/**
 * Maps Google's validationGranularity to our app's AddressValidationGranularity.
 */
function mapGranularity(googleVal: string): AddressValidationGranularity {
  const upper = (googleVal || "").toUpperCase();
  if (upper.includes("PREMISE") || upper.includes("SUB_PREMISE")) return "PREMISE";
  if (upper.includes("ROUTE")) return "ROUTE";
  if (upper.includes("LOCALITY")) return "LOCALITY";
  if (upper.includes("ADMINISTRATIVE_AREA")) return "ADMINISTRATIVE_AREA";
  if (upper.includes("COUNTRY")) return "COUNTRY";
  return "UNKNOWN";
}

export async function validateAddressWithGoogle(
  address: string,
  placeId?: string,
): Promise<AddressValidationResult | null> {
  const apiKey = (process.env.GOOGLE_MAPS_API_KEY || "").trim();
  if (!apiKey) {
    console.error("[GOOGLE_MAPS] GOOGLE_MAPS_API_KEY is missing from environment variables.");
    return null;
  }

  try {
    const response = await fetch(`${GOOGLE_VALIDATION_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: {
          addressLines: [address],
        },
        ...(placeId ? { previousResponseId: placeId } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GOOGLE_MAPS] Validation HTTP error ${response.status}: ${errorText}`);
      return null;
    }

    const data = (await response.json()) as GoogleAddressValidationResponse & { error?: { message: string } };

    if (data.error) {
      console.error(`[GOOGLE_MAPS] Validation API error: ${data.error.message}`);
      return null;
    }

    if (!data.result) {
      console.error("[GOOGLE_MAPS] Validation API returned no result object");
      return null;
    }

    const { verdict, address: googleAddress, geocode } = data.result;

    const components: AddressValidationResult["components"] = {};
    for (const comp of googleAddress.addressComponents) {
      const type = comp.componentType;
      const text = comp.componentName.text;
      if (type === "street_number") components.streetNumber = text;
      else if (type === "route") components.route = text;
      else if (type === "locality") components.locality = text;
      else if (type === "administrative_area_level_1") components.administrativeArea = text;
      else if (type === "postal_code") components.postalCode = text;
      else if (type === "country") components.countryCode = text;
    }

    return {
      isValid: verdict.validationGranularity === "PREMISE" || verdict.validationGranularity === "SUB_PREMISE",
      formattedAddress: googleAddress.formattedAddress,
      granularity: mapGranularity(verdict.validationGranularity),
      gps: {
        latitude: geocode.location.latitude,
        longitude: geocode.location.longitude,
      },
      components,
      source: "google",
    };
  } catch (err) {
    console.error("[GOOGLE_MAPS] validation failed:", err);
    return null;
  }
}

/**
 * Reverse geocodes lat/lng into a formatted address string.
 */
export async function reverseGeocodeWithGoogle(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const apiKey = (process.env.GOOGLE_MAPS_API_KEY || "").trim();
  if (!apiKey) {
    console.error("[GOOGLE_MAPS] GOOGLE_MAPS_API_KEY is missing from environment variables.");
    return null;
  }

  try {
    const response = await fetch(
      `${GOOGLE_GEOCODE_URL}?latlng=${latitude},${longitude}&key=${apiKey}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GOOGLE_MAPS] Geocode HTTP error ${response.status}: ${errorText}`);
      return null;
    }

    const data = (await response.json()) as {
      results: Array<{ formatted_address: string }>;
      status: string;
      error_message?: string;
    };

    if (data.status === "OK" && data.results.length > 0) {
      return data.results[0].formatted_address;
    }

    console.error(`[GOOGLE_MAPS] Geocode API returned status: ${data.status}${data.error_message ? ` - ${data.error_message}` : ""}`);
    return null;
  } catch (err) {
    console.error("[GOOGLE_MAPS] reverse geocode failed:", err);
    return null;
  }
}
