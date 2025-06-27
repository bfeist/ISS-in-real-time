import { FunctionComponent } from "react";
import { useDateTimeNavigation } from "store/hooks/useDateTimeNavigation";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
import { useStateClock } from "store/hooks/useStateClock";

/**
 * Example component demonstrating the slug-based date/time navigation
 */
const DateTimeNavigationExample: FunctionComponent = () => {
  const { navigateToCurrentDateTime, setDateTimeAndNavigate, getCurrentSlug } =
    useDateTimeNavigation();
  const { selectedDate } = useStateSelectedDate();
  const { appSecondsAtStartStop } = useStateClock();

  const handleExampleNavigation = () => {
    // Example: Navigate to Christmas 2023 at 2:30:15 PM
    setDateTimeAndNavigate("2023-12-25", 14 * 3600 + 30 * 60 + 15);
  };

  const handleNavigateToCurrentTime = () => {
    navigateToCurrentDateTime();
  };

  const currentSlug = getCurrentSlug();

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc", margin: "20px" }}>
      <h3>Date/Time Navigation Example</h3>
      <p>
        <strong>Current Selected Date:</strong> {selectedDate || "None"}
      </p>
      <p>
        <strong>Current App Seconds:</strong> {appSecondsAtStartStop}
      </p>
      <p>
        <strong>Current Slug:</strong> {currentSlug || "None"}
      </p>

      <div style={{ marginTop: "20px" }}>
        <button onClick={handleExampleNavigation} style={{ marginRight: "10px" }}>
          Navigate to Christmas 2023 14:30:15
        </button>
        <button onClick={handleNavigateToCurrentTime}>Navigate to Current Date/Time</button>
      </div>

      <div style={{ marginTop: "20px" }}>
        <h4>URL Examples:</h4>
        <ul>
          <li>
            <code>/2023-12-25~14:30:15</code> - Christmas 2023 at 2:30:15 PM
          </li>
          <li>
            <code>/2020-02-29~00:00:00</code> - Leap year day 2020 at midnight
          </li>
          <li>
            <code>/2024-07-04~12:00:00</code> - July 4th 2024 at noon
          </li>
        </ul>
        <p>
          <small>
            Note: URLs use ~ separator to avoid routing conflicts. The format represents
            YYYY-MM-DD~HH:MM:SS
          </small>
        </p>
      </div>
    </div>
  );
};

export default DateTimeNavigationExample;
