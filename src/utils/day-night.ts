import { findClosestEphemeraItem } from "./map";
import SunCalc from "./suncalc";
import { getSatelliteInfo } from "tle.js";
import { hhmmssFromAppSeconds } from "./time";

/**
 * Calculate day night information from a given ephemera for a desired date
 * @param ephemera ephemera containing a TLE
 * @param year yyyy
 * @param month mm
 * @param date dd
 * @returns An array of day night objects. Each object in the array is a change in daylight state.
 */
export function calcDayNight(ephemera: EphemeraItem[], selectedDate: string): DayNightObj[] {
  const secondsIn24Hours = 86400;

  const dayNightObjArray = [];
  let prevDaylight = null;
  //10 seconds resolution on day/night times
  for (let i = 0; i < secondsIn24Hours; i = i + 10) {
    const ephemeris = findClosestEphemeraItem(new Date(`${selectedDate}T12:00:00Z`), ephemera);
    const tle = `${ephemeris.tle_line1}
                 ${ephemeris.tle_line2}`;

    const iISODate = selectedDate + "T" + hhmmssFromAppSeconds(i) + "Z";
    const iDate = new Date(iISODate);

    const issInfo = getSatelliteInfo(tle, iDate.getTime());

    let daylight = true;
    daylight = isSunlit(iDate, issInfo.lng, issInfo.lat, issInfo.height * 1000);

    if (daylight !== prevDaylight) {
      const dayNightObj: DayNightObj = {
        appSeconds: i,
        daylight: daylight ? "day" : "night",
      };
      dayNightObjArray.push(dayNightObj);
    }

    prevDaylight = daylight;
  }
  const dayNightObj: DayNightObj = {
    appSeconds: secondsIn24Hours,
    daylight: "night",
  };
  dayNightObjArray.push(dayNightObj);

  return dayNightObjArray;
}

function isSunlit(date: Date, lng: number, lat: number, heightMeters: number) {
  const sunTimes = SunCalc.getTimes(date, lat, lng, heightMeters);

  // get time between sunset start and golden hour.
  const sunlightEnd = new Date((sunTimes.sunset.getTime() + sunTimes.goldenHour.getTime()) / 2);

  let sunlight = true;
  // if sunrise or sunset are NaN then it's high beta angle season and the sun never sets
  if (!isNaN(sunTimes.sunriseEnd.getTime()) && !isNaN(sunlightEnd.getTime())) {
    if (date > sunTimes.sunriseEnd && date < sunlightEnd) {
      sunlight = true;
    } else {
      sunlight = false;
    }
  }
  return sunlight;
}
