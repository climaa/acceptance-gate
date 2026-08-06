import {
  EFFORTS,
  MODEL_ALIASES,
  describeOverride,
  envOverride,
  mergeProfile,
  parseOverrideLabels,
} from "../sandcastle-model-overrides.mts";

/**
 * REAL unit tests, not source-text assertions — sandcastle-model-overrides.mts
 * imports nothing from this directory precisely so it can be loaded without
 * dragging in sandcastle-config.mts's import-time side effects (same reasoning
 * as sandcastle-worktree-safety.mts).
 *
 * What is being protected: this resolver decides which model runs an issue, so
 * a silent misparse is a silent cost/capability change. Every malformed label
 * must surface as an error, never as a fallback.
 */

const OPUS = "claude-opus-5";
const SONNET = "claude-sonnet-5";
// Mirrors PROFILES.implementer without importing it (that module pulls in the SDK).
const BASE = { model: OPUS, effort: "high" as const };

describe("parseOverrideLabels", () => {
  it("ignores labels that are not sc:-prefixed", () => {
    // Arrange
    const labels = ["Sandcastle", "bug", "blocked", "testing"];

    // Act
    const { overrides, errors } = parseOverrideLabels(labels);

    // Assert
    expect(errors).toEqual([]);
    expect(overrides).toEqual({});
  });

  it("reads a model alias for a per-issue role", () => {
    // Arrange & Act
    const { overrides, errors } = parseOverrideLabels([
      "sc:implementer:sonnet-5",
    ]);

    // Assert
    expect(errors).toEqual([]);
    expect(overrides.implementer).toEqual({ model: SONNET });
  });

  it("reads an effort override independently of the model", () => {
    // Arrange & Act
    const { overrides, errors } = parseOverrideLabels([
      "sc:reviewer:effort:xhigh",
    ]);

    // Assert
    expect(errors).toEqual([]);
    expect(overrides.reviewer).toEqual({ effort: "xhigh" });
  });

  it("combines a model and an effort label for the same role", () => {
    // Arrange & Act
    const { overrides, errors } = parseOverrideLabels([
      "sc:implementer:sonnet-5",
      "sc:implementer:effort:low",
    ]);

    // Assert
    expect(errors).toEqual([]);
    expect(overrides.implementer).toEqual({ model: SONNET, effort: "low" });
  });

  it("accepts a canonical model id as well as an alias", () => {
    // Arrange & Act
    const { overrides, errors } = parseOverrideLabels([
      `sc:implementer:${SONNET}`,
    ]);

    // Assert
    expect(errors).toEqual([]);
    expect(overrides.implementer).toEqual({ model: SONNET });
  });

  it("rejects planner — it runs once per invocation, before issues exist", () => {
    // Arrange & Act
    const { overrides, errors } = parseOverrideLabels(["sc:planner:sonnet-5"]);

    // Assert
    expect(overrides).toEqual({});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("cannot be set per issue");
    expect(errors[0]).toContain("SC_PLANNER_MODEL");
  });

  it("rejects merger — it runs once for every branch at once", () => {
    // Arrange & Act
    const { errors } = parseOverrideLabels(["sc:merger:effort:low"]);

    // Assert
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("SC_MERGER_EFFORT");
  });

  it("rejects an unknown model rather than passing it to the CLI", () => {
    // Arrange & Act — a plausible typo
    const { overrides, errors } = parseOverrideLabels([
      "sc:implementer:sonnnet-5",
    ]);

    // Assert
    expect(overrides).toEqual({});
    expect(errors[0]).toContain('unknown model "sonnnet-5"');
  });

  it("rejects fable-5, which is deliberately not in the allowlist", () => {
    // Arrange & Act
    const { errors } = parseOverrideLabels(["sc:implementer:fable-5"]);

    // Assert
    expect(errors[0]).toContain("unknown model");
  });

  it("rejects an unknown effort", () => {
    // Arrange & Act
    const { errors } = parseOverrideLabels(["sc:reviewer:effort:turbo"]);

    // Assert
    expect(errors[0]).toContain('unknown effort "turbo"');
  });

  it("rejects an unknown role", () => {
    // Arrange & Act
    const { errors } = parseOverrideLabels(["sc:architect:opus-5"]);

    // Assert
    expect(errors[0]).toContain('unknown role "architect"');
  });

  it("rejects a malformed label shape", () => {
    // Arrange & Act
    const { errors } = parseOverrideLabels(["sc:implementer"]);

    // Assert
    expect(errors[0]).toContain("malformed");
  });

  it("rejects two conflicting models for the same role", () => {
    // Arrange & Act
    const { errors } = parseOverrideLabels([
      "sc:implementer:sonnet-5",
      "sc:implementer:opus-5",
    ]);

    // Assert
    expect(errors[0]).toContain("conflicting model");
  });

  it("collects every error rather than stopping at the first", () => {
    // Arrange & Act
    const { errors } = parseOverrideLabels([
      "sc:implementer:nope",
      "sc:reviewer:effort:nope",
    ]);

    // Assert
    expect(errors).toHaveLength(2);
  });
});

describe("envOverride", () => {
  it("returns nothing when no SC_ vars are set", () => {
    // Arrange & Act
    const { override, errors } = envOverride("planner", {});

    // Assert
    expect(override).toEqual({});
    expect(errors).toEqual([]);
  });

  it("reads model and effort for the named role only", () => {
    // Arrange
    const env = {
      SC_PLANNER_MODEL: "sonnet-5",
      SC_PLANNER_EFFORT: "medium",
      SC_MERGER_MODEL: "opus-5",
    };

    // Act
    const planner = envOverride("planner", env);
    const reviewer = envOverride("reviewer", env);

    // Assert
    expect(planner.override).toEqual({ model: SONNET, effort: "medium" });
    expect(reviewer.override).toEqual({});
  });

  it("reports an unusable value instead of silently ignoring it", () => {
    // Arrange & Act
    const { override, errors } = envOverride("merger", {
      SC_MERGER_MODEL: "gpt-5",
    });

    // Assert
    expect(override).toEqual({});
    expect(errors[0]).toContain("SC_MERGER_MODEL");
  });

  it("treats whitespace-only as unset", () => {
    // Arrange & Act
    const { override, errors } = envOverride("planner", {
      SC_PLANNER_MODEL: "   ",
    });

    // Assert
    expect(override).toEqual({});
    expect(errors).toEqual([]);
  });
});

describe("mergeProfile — precedence is PROFILES < env < label", () => {
  it("returns the base untouched when nothing overrides it", () => {
    // Arrange & Act
    const { profile, errors } = mergeProfile(BASE);

    // Assert
    expect(profile).toEqual(BASE);
    expect(errors).toEqual([]);
  });

  it("lets env beat the base", () => {
    // Arrange & Act
    const { profile } = mergeProfile(BASE, { model: SONNET });

    // Assert
    expect(profile).toEqual({ model: SONNET, effort: "high" });
  });

  it("lets a label beat env", () => {
    // Arrange & Act
    const { profile } = mergeProfile(BASE, { model: SONNET }, { model: OPUS });

    // Assert
    expect(profile.model).toBe(OPUS);
  });

  it("merges model and effort from different layers", () => {
    // Arrange & Act
    const { profile } = mergeProfile(
      BASE,
      { effort: "low" },
      { model: SONNET },
    );

    // Assert
    expect(profile).toEqual({ model: SONNET, effort: "low" });
  });

  it("rejects effort max on a non-Opus effective model", () => {
    // Arrange & Act — legal-looking in isolation; only the combination is wrong
    const { errors } = mergeProfile(BASE, { model: SONNET }, { effort: "max" });

    // Assert
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Opus-only");
  });

  it("allows effort max on Opus", () => {
    // Arrange & Act
    const { profile, errors } = mergeProfile(BASE, {}, { effort: "max" });

    // Assert
    expect(errors).toEqual([]);
    expect(profile).toEqual({ model: OPUS, effort: "max" });
  });
});

describe("describeOverride", () => {
  it("returns null when the effective profile equals the base", () => {
    // Arrange & Act
    const described = describeOverride("implementer", BASE, { ...BASE });

    // Assert
    expect(described).toBeNull();
  });

  it("names the effective model when it differs", () => {
    // Arrange & Act
    const described = describeOverride("implementer", BASE, {
      model: SONNET,
      effort: "high",
    });

    // Assert
    expect(described).toBe(`implementer=${SONNET}·high`);
  });
});

describe("allowlist shape", () => {
  it("exposes exactly the two models this pipeline is cleared for", () => {
    // Arrange & Act
    const models = Object.values(MODEL_ALIASES).sort();

    // Assert — fable-5 is excluded on quota grounds (see the module header)
    expect(models).toEqual([OPUS, SONNET]);
  });

  it("matches the SDK's five effort levels", () => {
    // Arrange & Act & Assert
    expect([...EFFORTS]).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });
});
