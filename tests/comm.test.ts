import { describe, expect, it } from "vitest";
import { processCommCsv } from "../src/utils/comm";

describe("processCommCsv", () => {
  it("masks profanity in english transcripts", () => {
    const csv = [
      "12:00:00|file1|0|5|English|This is fuck example.|This is fuck original.",
      "12:01:00|file2|0|4|English (translated)|Another SHIT example.|Another SHIT original.",
    ].join("\n");

    const items = processCommCsv(csv);

    expect(items).toHaveLength(2);
    expect(items[0].text).toBe("This is **** example.");
    expect(items[0].textOriginalLang).toBe("This is fuck original.");
    expect(items[1].text).toBe("Another **** example.");
    expect(items[1].textOriginalLang).toBe("Another SHIT original.");
  });

  it("leaves non-english transcripts unchanged", () => {
    const csv = [
      "12:00:00|file1|0|5|French|Ceci est merde.|Ceci est merde.",
      "12:01:00|file2|0|4|Russian|Eto primer teksta.|Eto primer teksta.",
    ].join("\n");

    const items = processCommCsv(csv);

    expect(items).toHaveLength(2);
    expect(items[0].text).toBe("Ceci est merde.");
    expect(items[0].textOriginalLang).toBe("Ceci est merde.");
    expect(items[1].text).toBe("Eto primer teksta.");
    expect(items[1].textOriginalLang).toBe("Eto primer teksta.");
  });
});
