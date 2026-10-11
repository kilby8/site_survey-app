import * as Crypto from 'expo-crypto';

/**
 * Unguessable state value for the SolarPro sign-in round trip.
 * Uses the platform's secure random generator (not Math.random).
 */
export function generateStateNonce(): string {
  return Crypto.randomUUID();
}
