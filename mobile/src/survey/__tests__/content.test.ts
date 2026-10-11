import { contentFlags, likelyNumber } from "../content";

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
        { text: "Dog", confidence: 0.9 },
        { text: "House", confidence: 0.8 },
      ]),
    ).toEqual([]);
    // Expected subjects are per slot: "Food" + "Grass" on a roof shot is still flagged.
    expect(
      contentFlags("roof_overview", "", [
        { text: "Food", confidence: 0.9 },
        { text: "Grass", confidence: 0.7 },
      ]),
    ).toEqual(["off_subject"]);
  });

  it("allows digital displays on meter and electrical slots only", () => {
    const screen = [{ text: "Monitor", confidence: 0.9 }];
    expect(contentFlags("utility_meter_close", "84 112 093", screen)).toEqual([]);
    expect(contentFlags("elec_bus_label", "200A 240V", screen)).toEqual([]);
    expect(contentFlags("walk_front", "", screen)).toEqual(["off_subject"]);
  });

  it("pulls a meter number out of the text it read", () => {
    expect(likelyNumber("ComEd\nNo. 84 112 093\nkWh 00412")).toBe("84 112 093");
    expect(likelyNumber("CL200 240V")).toBeNull();
    expect(likelyNumber("Tel 1 800 555 0199 2025")).toBeNull(); // too many digits to be a meter no.
    expect(likelyNumber("1234")).toBeNull();
  });
});
