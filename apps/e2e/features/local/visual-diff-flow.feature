Feature: The whole loop, against my own console

  ⚠️ This scenario WRITES, and it is the most expensive thing in this repo. It
  rebuilds Storybook, captures your whole corpus inside the pinned container,
  compares it, and then takes all of that back out again. Budget minutes and a
  running Docker daemon.

  What it does NOT do is touch anything of yours. It captures the set it needs,
  uses it, and removes that set and that report — by name, never by clearing a
  panel. So it runs the same on an empty console as on one holding a week of your
  captures, and leaves either exactly as it found it.

  That is the point. The empty console is not an edge case: it is what a fresh
  checkout looks like, and a lane that could only run once somebody had captured
  by hand was asserting requirements it could not reach.

  One scenario, not four, because this is one task: the console is only worth
  anything if the whole chain works, and a capture that cannot be compared or a
  report that cannot be read through is not a partial success. `@mutating` is the
  write permission and is on the scenario rather than the Feature, for the reason
  `scripts/local-integrity.mjs` spells out — inherited, it would arm whatever
  anyone appends here next.

  Nothing is named. The set is whatever the console suggests, the pair is whichever
  two the pickers offer first, and the sections are whichever ones the report drew.

  @mutating
  Scenario: The console captures, compares, reviews, and leaves nothing behind
    Given this console is serving my own data
    When I ask the console to name a capture set
    And I start a capture under that name
    Then a second job is refused while that one runs
    And the capture finishes and the set is listed
    When I compare that capture against the corpus
    Then the comparison writes a report
    When I read the whole report through
    Then every variant of it is marked reviewed
    Given my newest run is holding the job lock
    When I try to delete the set it captured
    Then the deletion is refused because a job is running
    And the page behind the dialog announces only the running job
    When the lock is released
    And I remove the set and the report
    Then the console holds nothing this run made
