import { getCrewMembersOnboardByDate } from "utils/crew";
import crewArrDepFile from "./mock_data/iss_crew_arr_dep.json";

const crewArrDep: CrewArrDepItem[] = JSON.parse(JSON.stringify(crewArrDepFile));

test("Multiple crew onboard on Expedition 1", async () => {
  const dateStr = "2000-12-01";

  const expected: CrewArrDepItem[] = [
    {
      name: "Yuri Gidzenko",
      nationality: "Russia",
      arrivalDate: "2000-11-02T09:21:00Z",
      arrivalFlight: "Soyuz TM-31",
      departureDate: "2001-03-21T07:33:00Z",
      departureFlight: "STS-102",
      durationDays: "141",
    },
    {
      name: "Sergei Krikalev",
      nationality: "Russia",
      arrivalDate: "2000-11-02T09:21:00Z",
      arrivalFlight: "Soyuz TM-31",
      departureDate: "2001-03-21T07:33:00Z",
      departureFlight: "STS-102",
      durationDays: "141",
    },
    {
      name: "William Shepherd",
      nationality: "United States",
      arrivalDate: "2000-11-02T09:21:00Z",
      arrivalFlight: "Soyuz TM-31",
      departureDate: "2001-03-21T07:33:00Z",
      departureFlight: "STS-102",
      durationDays: "141",
    },
  ];

  const result = getCrewMembersOnboardByDate({ dateStr, crewArrDep });
  expect(result).toEqual(expected);
});

test("Multiple crew onboard on 2001-04-15", async () => {
  const dateStr = "2001-04-15";

  const expected: CrewArrDepItem[] = [
    {
      name: "Yury Usachov",
      nationality: "Russia",
      arrivalDate: "2001-03-08T11:42:00Z",
      arrivalFlight: "STS-102",
      departureDate: "2001-08-22T19:24:00Z",
      departureFlight: "STS-105",
      durationDays: "167.28",
    },
    {
      name: "James S. Voss",
      nationality: "United States",
      arrivalDate: "2001-03-08T11:42:00Z",
      arrivalFlight: "STS-102",
      departureDate: "2001-08-22T19:24:00Z",
      departureFlight: "STS-105",
      durationDays: "167.28",
    },
    {
      name: "Susan Helms",
      nationality: "United States",
      arrivalDate: "2001-03-08T11:42:00Z",
      arrivalFlight: "STS-102",
      departureDate: "2001-08-22T19:24:00Z",
      departureFlight: "STS-105",
      durationDays: "167.28",
    },
  ];

  const result = getCrewMembersOnboardByDate({ dateStr, crewArrDep });
  expect(result).toEqual(expected);
});

test("Multiple crew onboard on 2001-12-10", async () => {
  const dateStr = "2001-12-10";

  const expected: CrewArrDepItem[] = [
    {
      name: "Frank L. Culbertson Jr.",
      nationality: "United States",
      arrivalDate: "2001-08-10T21:10:00Z",
      arrivalFlight: "STS-105",
      departureDate: "2001-12-17T17:56:00Z",
      departureFlight: "STS-108",
      durationDays: "128.86",
    },
    {
      name: "Mikhail Tyurin",
      nationality: "Russia",
      arrivalDate: "2001-08-10T21:10:00Z",
      arrivalFlight: "STS-105",
      departureDate: "2001-12-17T17:56:00Z",
      departureFlight: "STS-108",
      durationDays: "128.86",
    },
    {
      name: "Vladimir Dezhurov",
      nationality: "Russia",
      arrivalDate: "2001-08-10T21:10:00Z",
      arrivalFlight: "STS-105",
      departureDate: "2001-12-17T17:56:00Z",
      departureFlight: "STS-108",
      durationDays: "128.86",
    },
    {
      name: "Yury Onufriyenko",
      nationality: "Russia",
      arrivalDate: "2001-12-05T22:19:00Z",
      arrivalFlight: "STS-108",
      departureDate: "2002-06-19T09:57:00Z",
      departureFlight: "STS-111",
      durationDays: "195.82",
    },
  ];

  const result = getCrewMembersOnboardByDate({ dateStr, crewArrDep });
  expect(result).toEqual(expected);
});

test("No crew onboard on 1999-01-01", async () => {
  const dateStr = "1999-01-01";

  const expected: CrewArrDepItem[] = [];

  const result = getCrewMembersOnboardByDate({ dateStr, crewArrDep });
  expect(result).toEqual(expected);
});
