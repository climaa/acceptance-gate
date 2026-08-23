@mode:serial
Feature: The mutating flow, against my own captures

  ⚠️ These scenarios WRITE. Every other requirement in this lane is read-only and
  enforced to be — `steps/local/fixtures.ts` aborts every non-GET before it
  reaches the server, and a step that writes to disk asks for the `mayWrite`
  fixture, which refuses an untagged scenario. `@mutating` on a scenario is what
  opts it out of both. It is written on every scenario below rather than on this
  Feature on purpose: inherited, it would hand the same permission to the next
  scenario anyone appends here, with no line of its own for a reviewer to object
  to. `scripts/local-integrity.mjs` refuses it on a Feature, and refuses it
  outside this file.

  There is no seeded world behind these: they launch a job in YOUR
  `.visual-diff`, take its lock, delete YOUR oldest capture set and prune one
  more. Nothing re-seeds afterwards. A run costs you two sets.

  `@mode:serial` is what makes the chain honest. They run in the order written
  and Playwright SKIPS every scenario after a failure, so a compare that never
  finished cannot be followed by a lock that impersonates it, or by a delete
  aimed at a console that is not in the state the scenario assumes.

  Nothing is named here, as everywhere in this lane: the sets are whatever your
  machine captured, so each step reads the labels off the page and the
  assertions compare page values with each other.

  Background:
    Given this console is serving my own captures

  @mutating
  Scenario: Comparing the two sets the pickers offer writes a report
    Given no report exists yet for the two sets the pickers offer
    When I visit my console
    And I launch a comparison of the two sets the pickers offer
    Then the live log runs to the job's end
    And the finished job links to its report
    And the console lists that report without a reload

  @mutating
  Scenario: A second job is refused while one is running
    Given my newest run is holding the job lock
    When I try to start another job
    Then the console shows the running job instead of queueing mine
    And the history shows that job as running

  @mutating
  Scenario: A refusal inside a confirmation dialog is announced on its own
    Given my newest run is holding the job lock
    When I delete my oldest set
    Then the deletion is refused because a job is running
    And the page behind the dialog announces only the running job

  @mutating
  Scenario: Deleting my oldest set removes it
    When I visit my console
    And I delete my oldest set
    Then that set is no longer listed

  @mutating
  Scenario: Pruning retires the set outside the window
    When I visit my console
    And I prune keeping every set but the oldest
    Then only the sets inside that window remain
