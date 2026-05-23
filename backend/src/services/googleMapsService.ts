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
  gpsLatitude?: number,
  gpsLongitude?: number,
  placeId?: string,
): Promise<AddressValidationResult | null> {
  const apiKey = (process.env.GOOGLE_MAPS_API_KEY || "").trim();
  console.log(`[GOOGLE_MAPS] validateAddressWithGoogle called: address="${address.substring(0, 30)}", lat=${gpsLatitude}, lng=${gpsLongitude}, hasKey=${apiKey.length > 0}`);

  if (!apiKey) {
    console.error("[GOOGLE_MAPS] GOOGLE_MAPS_API_KEY is missing from environment variables.");
    return null;
  }

  // Address Validation API is not enabled on most GCP projects.
  // Instead, use Geocoding API (reverse geocoding) to validate and normalize the address.
  // If GPS coordinates are available, reverse-geocode them first for the most accurate result.
  if (Number.isFinite(gpsLatitude) && Number.isFinite(gpsLongitude)) {
    try {
      console.log(`[GOOGLE_MAPS] Attempting reverse geocoding with lat=${gpsLatitude}, lng=${gpsLongitude}`);
      const reverseResult = await reverseGeocodeWithGoogle(gpsLatitude!, gpsLongitude!);
      if (reverseResult) {
        console.log(`[GOOGLE_MAPS] Reverse geocoding succeeded: "${reverseResult}"`);
        return {
          isValid: true,
          formattedAddress: reverseResult,
          granularity: "PREMISE",
          gps: {
            latitude: gpsLatitude!,
            longitude: gpsLongitude!,
          },
          source: "google",
        };
      }
      console.log(`[GOOGLE_MAPS] Reverse geocoding returned null, trying forward geocoding`);
    } catch (err) {
      console.warn("[GOOGLE_MAPS] reverse geocoding failed, falling back to forward geocoding:", err instanceof Error ? err.message : String(err));
    }
  }

  // Fallback: forward geocoding (address → GPS)
  try {
    const encodedAddress = encodeURIComponent(address);
    const forwardUrl = `${GOOGLE_GEOCODE_URL}?address=${encodedAddress}&key=${apiKey.substring(0, 10)}...`;
    console.log(`[GOOGLE_MAPS] Attempting forward geocoding with URL (address part): ${forwardUrl}`);

    const response = await fetch(
      `${GOOGLE_GEOCODE_URL}?address=${encodedAddress}&key=${apiKey}`,
    );

    console.log(`[GOOGLE_MAPS] Geocoding API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GOOGLE_MAPS] Geocoding HTTP error ${response.status}: ${errorText}`);
      return null;
    }

    const data = (await response.json()) as {
      results: Array<{
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
        address_components?: Array<{ types: string[]; long_name: string }>;
      }>;
      status: string;
      error_message?: string;
    };

    if (data.status === "OK" && data.results.length > 0) {
      const result = data.results[0];
      const components: AddressValidationResult["components"] = {};

      if (result.address_components) {
        for (const comp of result.address_components) {
          const typeStr = comp.types.join(",");
          if (typeStr.includes("street_number")) components.streetNumber = comp.long_name;
          else if (typeStr.includes("route")) components.route = comp.long_name;
          else if (typeStr.includes("locality")) components.locality = comp.long_name;
          else if (typeStr.includes("administrative_area_level_1")) components.administrativeArea = comp.long_name;
          else if (typeStr.includes("postal_code")) components.postalCode = comp.long_name;
          else if (typeStr.includes("country")) components.countryCode = comp.long_name;
        }
      }

      return {
        isValid: true,
        formattedAddress: result.formatted_address,
        granularity: "ROUTE",
        gps: {
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng,
        },
        components,
        source: "google",
      };
    }

    console.error(`[GOOGLE_MAPS] Geocoding API returned status: ${data.status}${data.error_message ? ` - ${data.error_message}` : ""}`);
    return null;
  } catch (err) {
    console.error("[GOOGLE_MAPS] geocoding failed:", err);
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
    const URL = `${GOOGLE_GEOCODE_URL}?latlng=${latitude},${longitude}&key=${apiKey}`;
    console.log(`[GOOGLE_MAPS] Reverse geocoding URL: ${GOOGLE_GEOCODE_URL}?latlng=${latitude},${longitude}&key=${apiKey.substring(0, 10)}...`);

    const response = await fetch(URL);

    console.log(`[GOOGLE_MAPS] Reverse geocode HTTP status: ${response.status}`);

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

    console.log(`[GOOGLE_MAPS] Reverse geocode API status: ${data.status}`);

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
