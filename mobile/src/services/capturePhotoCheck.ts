/**
 * services/capturePhotoCheck.ts — check an engineering photo right after it is taken.
 *
 * James 2026-11-05: "send that flag back to the app so they get notified in real
 * time of mistakes so we don't have to go back for photos". Only the photo slots
 * Engineering reads are checked (panel, breaker, OCPD, meter, service entry, attic);
 * everything else costs nothing and shows nothing. Needs signal; offline, nothing
 * is shown and the photo is checked when the survey syncs.
 */
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { checkPhotoAtCapture, type CapturePhotoCheck } from "../api/client";

/** NewSurveyScreen slot ids whose photos Engineering reads. */
export const ENGINEERING_PHOTO_SLOTS: ReadonlySet<string> = new Set([
  "elec_main_panel",
  "elec_main_breaker",
  "elec_ocpd_rating",
  "meter_number_tag",
  "meter_wall_wide",
  "service_close_up",
  "service_wide_shot",
  "attic_access",
]);

/** Long side of the copy sent for checking (the reader's own maximum). */
const CHECK_LONG_SIDE_PX = 1568;

export async function checkSlotPhoto(
  uri: string,
  slotId: string,
  size?: { width?: number; height?: number },
): Promise<CapturePhotoCheck | null> {
  if (!ENGINEERING_PHOTO_SLOTS.has(slotId)) return null;
  try {
    const w = size?.width ?? 0;
    const h = size?.height ?? 0;
    const resize = w >= h
      ? { width: Math.min(CHECK_LONG_SIDE_PX, w || CHECK_LONG_SIDE_PX) }
      : { height: Math.min(CHECK_LONG_SIDE_PX, h) };
    const copy = await manipulateAsync(uri, [{ resize }], {
      compress: 0.8,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (!copy.base64) return null;
    return await checkPhotoAtCapture(copy.base64, slotId);
  } catch {
    return null;
  }
}
