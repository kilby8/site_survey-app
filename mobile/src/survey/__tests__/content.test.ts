import { contentFlags, EXPECTED, likelyNumber, OFF_SUBJECT } from "../content";

describe("content check", () => {
  it("needs readable digits on number/label slots", () => {
    expect(contentFlags("utility_meter_close", "", [])).toEqual(["no_text"]);
    expect(contentFlags("utility_meter_close", "kWh", [])).toEqual(["no_text"]);
    expect(contentFlags("utility_meter_close", "84 112 093 kWh", [])).toEqual([]);
    expect(contentFlags("elec_directory", "1 Kitchen 2 Bath 3 Garage", [])).toEqual([]);
  });

  it("doesn't need text on photo-only slots", () => {
    expect(contentFlags("walk_front", "", [])).toEqual([]);
  });

  it("flags a confident off-subject label, ignores weak ones", () => {
    expect(contentFlags("walk_front", "", [{ text: "Selfie", confidence: 0.92 }])).toEqual(["off_subject"]);
    expect(contentFlags("walk_front", "", [{ text: "Dog", confidence: 0.4 }])).toEqual([]);
    expect(contentFlags("walk_front", "", [{ text: "Building", confidence: 0.95 }])).toEqual([]);
  });

  it("doesn't flag an off-subject label when the slot's subject is clearly there", () => {
    // A dog in the yard of a house photo is still a house photo.
    expect(
      contentFlags("walk_front", "", [
        { text: "Dog", confidence: 0.8 },
        { text: "Building", confidence: 0.93 },
      ]),
    ).toEqual([]);
    // Expected subjects are per slot: food + a garden on a roof shot is still flagged.
    expect(
      contentFlags("roof_plane_wide", "", [
        { text: "Food", confidence: 0.9 },
        { text: "Garden", confidence: 0.7 },
      ]),
    ).toEqual(["off_subject"]);
    // An outdoor selfie: the face outweighs a weak building in the background.
    expect(
      contentFlags("walk_front", "", [
        { text: "Selfie", confidence: 0.92 },
        { text: "Building", confidence: 0.55 },
      ]),
    ).toEqual(["off_subject"]);
  });

  it("allows digital displays on meter and electrical slots only", () => {
    const screen = [{ text: "Screenshot", confidence: 0.9 }];
    expect(contentFlags("utility_meter_close", "84 112 093", screen)).toEqual([]);
    expect(contentFlags("elec_bus_label", "200A 240V", screen)).toEqual([]);
    // A screen alone on a non-text electrical slot is still the wrong subject.
    expect(contentFlags("elec_panel_open", "", screen)).toEqual(["wrong_subject"]);
    expect(contentFlags("walk_front", "", screen)).toEqual(["off_subject"]);
  });

  it("flags a photo that doesn't show what its slot needs", () => {
    // A rocket on the launch pad isn't a roof plane, even with no block-listed label.
    expect(
      contentFlags("roof_plane_wide", "", [
        { text: "Rocket", confidence: 0.9 },
        { text: "Sky", confidence: 0.8 },
        { text: "Tower", confidence: 0.6 },
      ]),
    ).toEqual(["wrong_subject"]);
    // Bare sky on an elevation slot.
    expect(contentFlags("walk_back", "", [{ text: "Sky", confidence: 0.95 }])).toEqual(["wrong_subject"]);
    // The real thing passes.
    expect(contentFlags("roof_plane_wide", "", [{ text: "Roof", confidence: 0.81 }, { text: "Sky", confidence: 0.9 }])).toEqual([]);
    expect(contentFlags("ground_area", "", [{ text: "Field", confidence: 0.7 }])).toEqual([]);
  });

  it("doesn't ask the subject question when it can't be answered", () => {
    // No labels (labeller didn't run or saw nothing confident).
    expect(contentFlags("roof_plane_wide", "", [])).toEqual([]);
    // Close-ups the general model labels poorly, and text slots.
    expect(contentFlags("roof_attic", "", [{ text: "Room", confidence: 0.7 }])).toEqual([]);
    expect(contentFlags("utility_meter_close", "84 112 093", [{ text: "Hand", confidence: 0.7 }])).toEqual([]);
  });

  it("only uses label names the ML Kit base model can emit", () => {
    // Spot-check against the published label map: these never appear.
    const impossible = ["House", "Window", "Door", "Fence", "Grass", "Lawn", "Pipe", "Wire", "Monitor", "Tree"];
    for (const e of EXPECTED) for (const l of e.labels) expect(impossible).not.toContain(l);
    for (const l of OFF_SUBJECT) expect(impossible).not.toContain(l);
  });

  it("pulls a meter number out of the text it read", () => {
    expect(likelyNumber("ComEd\nNo. 84 112 093\nkWh 00412")).toBe("84 112 093");
    expect(likelyNumber("CL200 240V")).toBeNull();
    expect(likelyNumber("Tel 1 800 555 0199 2025")).toBeNull(); // too many digits to be a meter no.
    expect(likelyNumber("1234")).toBeNull();
  });
});
