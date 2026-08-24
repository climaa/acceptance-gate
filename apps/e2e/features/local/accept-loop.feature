@mode:serial
Feature: The accept loop, against my own captures

  ⚠️ These scenarios WRITE, and they cost far more than the flow beside them. A
  capture rebuilds Storybook and shoots your whole corpus in the pinned container, then
  a promote writes that corpus into `<your data dir>/__baselines__`. Budget minutes
  and a running Docker daemon — `pnpm test:local` needs neither, which is the whole
  reason this file is not in it.

  Every run of this file leaves one new capture set behind. Nothing here deletes anything, so
  unlike the flow next door this one grows your tree rather than pruning it.

  `@accept` is the selector: `pnpm test:local:accept` greps for it and the two
  ordinary local scripts grep it away. `@mutating` is the write permission, on each
  scenario rather than on this Feature, for the reason `visual-diff-flow.feature`
  spells out — inherited, it would arm whatever anyone appends here next.

  Nothing is named, as everywhere in this lane. The set is whatever the console
  suggests, the pair is whichever two the pickers offer first, and the sections are
  whichever ones the report turned out to draw.

  A capture captures; it does not write a report. `runCheck` answers with no
  report id, so the shot tree is the whole of what it leaves behind and the report
  is the NEXT scenario's doing — which is why these are two steps here and were
  two clicks in the walkthrough this came from.

  These four do NOT reuse each other's browser state. A review mark lives in the
  reader's own browser, and every scenario opens a fresh one, so the last reviews
  the report again rather than inheriting what the one before it did.

  Background:
    Given this console is serving my own captures

  @mutating @accept
  Scenario: The console names a capture set and captures it
    When I visit my console
    And I ask the console to name a capture set
    And I start a capture under that name
    Then the capture finishes and the set is listed

  @mutating @accept
  Scenario: Comparing that capture against the corpus writes a report
    When I visit my console
    And I compare my newest capture against the corpus
    Then the comparison finishes and writes a report

  @mutating @accept
  Scenario: Reading the report through opens the accept gate
    When I open the report that comparison wrote
    And I mark the whole report reviewed
    Then every variant of that report is marked
    And the console offers to accept it

  @mutating @accept
  Scenario: Accepting the reviewed report promotes its shots
    Given the report that comparison wrote is fully reviewed
    When I accept it
    Then the promotion runs to its end
    And the history records the accept as succeeded
