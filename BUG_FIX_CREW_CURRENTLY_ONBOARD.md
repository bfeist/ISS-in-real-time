# Bug Fix: Currently Onboard Crew Not Appearing in crew_arr_dep.json

## Date: October 5, 2025

## Problem

Crew members currently onboard the ISS (like Zena Cardman on SpaceX Crew-11) were not appearing in the `crew_arr_dep.json` output file. This caused them to not show up in the UI when querying who's onboard on the current date.

## Root Cause

The Python script `6_web_crew_arrive_dep_from_flights.py` only created crew stay records when BOTH arrival and departure events existed. For missions currently in progress:

- The `undocking_date` field is empty/missing in `flights.json`
- The script skipped adding departure events for crew with missing undocking dates
- Without a departure event, no crew stay record was created
- Result: Currently onboard crew were tracked internally but never written to the output file

## Code Location

File: `src/server-batch/3_flights/6_web_crew_arrive_dep_from_flights.py`

### Before (line 312):

```python
if crew_name and dt_departure:
    # Only add departure event if dt_departure exists
    # Problem: dt_departure is None when undocking_date is empty
```

## Solution

Modified the script to explicitly handle crew members still in space:

1. Track arrivals without departures in the `status_tracker` dictionary
2. After processing all events, identify crew still marked as "in_space"
3. Create crew stay records for them using special values:
   - `departureDate`: "2099-12-31T23:59:59Z" (far-future date)
   - `departureFlight`: "TBD"
   - `durationDays`: "TBD"

### Code Changes:

```python
# Handle crew members still in space (no departure yet)
# Add them to crew_records with a far-future departure date
still_in_space = [
    (name, data)
    for name, data in status_tracker.items()
    if data.get("in_space", False)
]

if still_in_space:
    # Use a far-future date (2099-12-31) for crew members still onboard
    # This allows the UI to correctly identify them as currently onboard
    far_future_date = "2099-12-31T23:59:59Z"

    for name, data in still_in_space:
        arrival_event = data["arrival"]
        crew_records.append({
            "name_first": arrival_event["name_first"],
            "name_middle": arrival_event["name_middle"],
            "name_last": arrival_event["name_last"],
            "name_suffix": arrival_event["name_suffix"],
            "nationality": arrival_event["nationality"],
            "arrivalDate": arrival_event["date"],
            "arrivalFlight": arrival_event["flightName"],
            "departureDate": far_future_date,
            "departureFlight": "TBD",
            "durationDays": "TBD",
        })
```

## Why This Approach Works

1. **Date filtering logic still works**: The `getCrewMembersOnboardByDate()` function in TypeScript checks:

   ```typescript
   arrivalDate <= endOfDay && departureDate >= startOfDay;
   ```

   Since `2099-12-31` is far in the future, it will always be >= any current date.

2. **UI can identify current crew**: The "TBD" values signal to the UI that this is an ongoing stay.

3. **No breaking changes**: Existing logic for completed stays remains unchanged.

4. **Future-proof**: When the crew eventually departs, running the script again will update their record with the actual departure date.

## Test Results

### Before Fix:

```
Total crew stays recorded: 508
Total arrival events: 512
Total departure events: 508

[INFO] 4 crew member(s) still marked as in space (no departure recorded):
  - Michael Fincke (arrived 2025-08-02T06:26:56Z on SpaceX Crew-11)
  - Kimiya Yui (arrived 2025-08-02T06:26:56Z on SpaceX Crew-11)
  - Zena Cardman (arrived 2025-08-02T06:26:56Z on SpaceX Crew-11)
  - Oleg Platonov (arrived 2025-08-02T06:26:56Z on SpaceX Crew-11)
```

### After Fix:

```
Total crew stays recorded: 512  ← Now includes all 4 currently onboard
Total arrival events: 512
Total departure events: 508

[INFO] 4 crew member(s) currently onboard (added with TBD departure):
  - Michael Fincke (arrived 2025-08-02T06:26:56Z on SpaceX Crew-11)
  - Kimiya Yui (arrived 2025-08-02T06:26:56Z on SpaceX Crew-11)
  - Zena Cardman (arrived 2025-08-02T06:26:56Z on SpaceX Crew-11)
  - Oleg Platonov (arrived 2025-08-02T06:26:56Z on SpaceX Crew-11)
```

### Verification Test:

```javascript
// Test for Oct 5, 2025
Crew onboard on 2025-10-05: 7 people
  - Sergey Ryzhikov (Russia)
  - Alexey Zubritsky (Russia)
  - Jonny Kim (United States)
  - Michael Fincke (United States)
  - Kimiya Yui (Japan)
  - Zena Cardman (United States)  ← NOW APPEARS!
  - Oleg Platonov (Russia)

✅ SUCCESS: Zena Cardman is correctly identified as onboard!
```

## Example Output Record

```json
{
  "name_first": "Zena",
  "name_middle": "",
  "name_last": "Cardman",
  "name_suffix": "",
  "nationality": "United States",
  "arrivalDate": "2025-08-02T06:26:56Z",
  "arrivalFlight": "SpaceX Crew-11",
  "departureDate": "2099-12-31T23:59:59Z",
  "departureFlight": "TBD",
  "durationDays": "TBD"
}
```

## Related Files

- **Python script**: `src/server-batch/3_flights/6_web_crew_arrive_dep_from_flights.py`
- **TypeScript util**: `src/utils/onboard.ts` (function `getCrewMembersOnboardByDate`)
- **Output data**: `crew_arr_dep.json` (in WEB_ASSETS_FOLDER)

## Impact

- ✅ Currently onboard crew now appear in the UI
- ✅ Historical data remains unchanged
- ✅ No breaking changes to TypeScript code
- ✅ Backward compatible with existing logic

## Future Considerations

1. **UI Enhancement**: Consider showing a special indicator for crew still onboard (e.g., "Currently onboard" instead of showing departure countdown).

2. **Data Updates**: When crew departs, re-run the script to update their record with actual departure date.

3. **Alternative Approaches**: Could use `null` for departure date, but far-future date is simpler and works with existing date comparison logic.
