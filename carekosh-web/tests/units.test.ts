import { expect, it } from "vitest";
import { unitLabel } from "../src/domain";
it("uses singular/plural count words without altering measurement units", () => {
  expect(unitLabel(0, "piece")).toBe("pieces");
  expect(unitLabel(1, "boxes")).toBe("box");
  expect(unitLabel(2, "set")).toBe("sets");
  expect(unitLabel(2, "mL")).toBe("mL");
  expect(unitLabel(1, "custom unit")).toBe("custom unit");
});
