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

  it("pulls a meter number out of the text it read", () => {
    expect(likelyNumber("ComEd\nNo. 84 112 093\nkWh 00412")).toBe("84 112 093");
    expect(likelyNumber("CL200 240V")).toBeNull();
  });
});
