// import { findClosestEphemeraItem } from "../utils/map";

// describe("findClosestEphemeraItem", () => {
//   it("should return undefined when ephemeraItems is empty", () => {
//     const ephemeraItems: EphemeraItem[] = [];
//     const result = findClosestEphemeraItem(new Date(), ephemeraItems);
//     expect(result).toBeUndefined();
//   });

//   it("should return the closest ephemera item", () => {
//     const dateTime = new Date("2023-01-01T12:00:00Z");
//     const ephemeraItems: EphemeraItem[] = [
//       { epoch: "2023-01-01T11:00:00Z", tle_line1: "", tle_line2: "" },
//       { epoch: "2023-01-01T13:00:00Z", tle_line1: "", tle_line2: "" },
//     ];
//     const result = findClosestEphemeraItem(dateTime, ephemeraItems);
//     expect(result).toEqual({ epoch: "2023-01-01T11:00:00Z", tle_line1: "", tle_line2: "" });
//   });

//   // ...additional test cases...
// });
