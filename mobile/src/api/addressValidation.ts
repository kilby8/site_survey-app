import type {
  AddressValidationRequest,
  AddressValidationResult,
} from "../types";
import {
  type AddressValidationOptions,
  validateSurveyAddress,
} from "./client";

/**
 * API wrapper dedicated to address-validation workflows.
 *
 * Keeps call sites decoupled from the larger client module and
 * enforces GPS-inclusive payloads via AddressValidationRequest.
 */
export async function validateAddressWithGps(
  input: AddressValidationRequest,
  options?: AddressValidationOptions,
): Promise<AddressValidationResult> {
  return validateSurveyAddress(input, options);
}

