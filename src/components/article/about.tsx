import { FunctionComponent, JSX } from "react";
import styles from "./about.module.css";

const About: FunctionComponent = (): JSX.Element => {
  return (
    <div className={styles.articleContainer}>
      <div className={styles.articleContent}>
        <h1>About This Project</h1>

        <p>
          We are Ben Feist and David Charney. We both work at NASA Johnson Space Center. We built
          ISS in real time over the past year (on evenings and weekends) just because we like to put
          good things on the Internet.
        </p>

        <p>
          {`10 years ago (Dec 2015), Ben Feist released Apollo in Real Time for the Apollo 17 mission.
          ISS in Real Time is a continuation of that effort. Don't worry, we haven't forgotten about
          the remaining Apollo missions. Stay tuned.`}
        </p>

        <p>
          Iss in real time is an interactive experience that lets you explore the past 25 years
          onboard the International Space Station. Nov 2, 2000 marks the beginning of continuous
          human presence in space (onboard the ISS). There are many summaries out there and many
          impressive statistics about what it took to achieve this continuous effort to have people
          off of the Earth, but we thought it would be cool to show the world each and every day
          onboard.
        </p>

        <h2>Data availability</h2>

        <p>
          {`Over the past 25 years, NASA has continuously released data about the space station in
          various formats and media types. The NASA.gov website has undergone many redesigns, and
          the landscape of digital media availability has gone from dial-up to broadband. We have
          made every effort to gather ISS data and media from every public resource available and
          found ways to place it back into the context of the continued human presence onboard. This
          means that many days are chalk full of things to show, and other days are somewhat empty.
          Of course every day onboard the ISS was chalk full; it's a matter of whether information
          was made available to the public, and whether that data has survived 25 years of evolution
          on the Internet.`}
        </p>

        <p>
          {`There are few other examples of multimedia projects that attempt to represent both, data
          from the "early" Internet and today all at once. Coverage is spotty at times. If you know
          of other data that's publicly available that we could include, please let us know.`}
        </p>

        <h2>Future data</h2>

        <p>
          {`NASA has been publishing ISS telemetry data for at least the past 7 years. This includes
          sensor values, joint angles, voltages, and a ton of other data. We have some of this in
          our possession but haven't yet integrated it into the website. Coming soon.`}
        </p>

        <h2>Media sources:</h2>

        <h2>Space-to-ground Communications</h2>

        <p>
          {`The ISS has 4 space-to-ground communication channels (called "loops" at NASA). Every day's
          comm from the ISS is published to archive.org by the NASA public affairs office. We
          gathered all of this material (currently roughly 3200 days of audio) and broke it down
          into units of speech we call "utterances". We then used the OpenAI model called Whisper
          Large-v3 to transcribe all of the utterances. This AI model includes the ability to
          translate from other languages. We translated any non-English comm to include the original
          language and the English translation.`}
        </p>

        <h2>Dragon-to-ground Communications</h2>

        <p>
          A few of the days onboard include dragon-to-ground (or air-to-ground in the case of the
          Boeing Starliner) communication. We have treated this in the same way as space-to-ground,
          and include it in context with each day.
        </p>

        <h2>Ephemera</h2>

        <p>
          {`NORAD tracks the ISS and publishes it's trajectory data multiple times a day. We use this
          data to show where the ISS has been over the past 25 years, including the number of orbits
          it has made since the beginning of its construction. The data we use is courtesy
          spacetrack.com`}
        </p>

        <h2>Earth Photography</h2>

        <p>
          {`NASA's ongoing Earth Observation efforts includes an excellent online database of photos
          of the Earth taken from the ISS. This data is on the excellent website ########## that
          includes a helpful API. We used this API to collect information on when each photo was
          taken so we could place it back into context. Of course, we only know when each photo was
          taken based on the clock within the cameras used. These clocks sometimes drift out of sync
          with earth time when in space.`}
        </p>

        <h2>Mission Photography</h2>

        <p>
          NASA has been publishing photos to Flickr into image galleries that includes data from
          each photo about what time it was taken (again, assuming correct clocks). We gathered this
          data from Flickr and then wrote a custom AI agent that helped us to identify which photos
          were taken in space, filtering out training and other press photos that were in the same
          Flickr collections. The odd miscategorized photo may have slipped through.
        </p>

        <h2>Video</h2>

        <p>
          {`NASA releases clips of video as they are requested by the press, etc onto archive.org. We
          gathered all of this media and used identifying information that allowed us to determine
          the start time of each piece of media. These are often short clips of astronaut interviews
          onboard. NASA also releases content on Youtube. We used Google's Youtube API to pull all
          of the live streams NASA has published to youtube from the ISS. We then transcribed each
          of the video and used a fuzzy logic matching algorithm to look for speech utterances that
          match the space-to-ground comm from the same day. The comm has known-good timestamps so we
          were able to determine the real UTC start time of each Youtube stream so we were able to
          accurately place them into context on each day.`}
        </p>

        <h2>Articles</h2>

        <p>
          NASA has published information about current events on the ISS (and Shuttle missions
          servicing the ISS) for many years in different formats from status reports to blog posts.
          We have pulled the full record of these articles from NASA.gov. Articles and status
          reports prior to 2013 were removed from NASA.gov when a web redesign occurred. For
          articles before this there is spotty coverage that we have attempted to recover from the
          Wayback Machine at archive.org. All are included within each day using the publication
          dates.
        </p>

        <h2>Visiting Vehicles</h2>

        <p>
          The ISS has had a constant stream of uncrewed resupply vehicles and crew vehicles docking
          and undocking. We have used the data published at Wikipedia to catalog these. This
          information is provided for every day.
        </p>

        <h2>Crew Members</h2>

        <p>
          Lists of crew members who arrived and departed from the ISS on different spacecraft were
          also gathered from Wikipedia. This has allowed us to derive the information of who is
          onboard at a given time . This information is provided for every day.
        </p>

        <h2>Expeditions</h2>

        <p>
          NASA broke up the work being done on the ISS by Expedition. Counterintuitively though,
          there were often multiple expeditions active on the ISS at the same time. The information
          about what Expeditions are active at a given time was gathered from the Wikipedia
          Expedition list. The summary text that describes each Expedition was pulled from NASA.gov.
        </p>
      </div>
    </div>
  );
};

export default About;
