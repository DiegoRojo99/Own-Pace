import { expect, it } from "vitest";
import { decodePolyline } from "./polyline";

it("decodes positive and negative route coordinates", () => {
  expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
    [38.5, -120.2], [40.7, -120.95], [43.252, -126.453],
  ]);
});

it("rejects incomplete, invalid, or oversized polylines", () => {
  expect(() => decodePolyline("_")).toThrow();
  expect(() => decodePolyline("!")).toThrow();
  expect(() => decodePolyline("?".repeat(200_001))).toThrow();
});
