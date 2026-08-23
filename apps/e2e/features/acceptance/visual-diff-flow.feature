@mutating @mode:serial
Feature: The mutating flow, end to end

  Every scenario below wrecks the same data directory, in the order it is
  written. They are not independent requirements that happen to share a world —
  they are the steps of one flow: launch a comparison, promote its baselines,
  refuse what must be refused while a job holds the lock, then retire sets.

  `@mode:serial` is what makes that honest. Playwright runs these one after
  another and SKIPS every scenario after a failure, so a broken compare stops
  the accept instead of letting it fail a second time against a world that was
  never built. Without it the run would report four more failures that all say
  the same thing, and the first one — the only one that explains anything —
  would be buried among them.

  Reordering this file changes what runs against what. The accept sits before
  the deletions because it promotes from a report whose sets those deletions
  retire, and after the launch because a world with no finished job has nothing
  to promote. `scripts/suite-integrity.mjs` names this file in SERIAL_FEATURES;
  no other feature may carry `@mode:`.

  Background:
    Given the mutating console has snapshot sets

  Scenario: Launching a comparison streams its log and links the report
    When I visit the mutating console
    And I launch the prepared comparison
    Then the live log runs to the job's end
    And the finished job links to its report
    And the console lists that report without a reload

  Scenario: A matched host accepts the baselines
    Given every variant of the mutating report is reviewed
    And the runner matches the pinned container
    When I visit the mutating console
    And I run the accept
    Then the baselines are rewritten and restamped

  Scenario: A second job is refused while one is running
    Given a job is already running
    When I try to start another job
    Then the console shows the running job instead of queueing mine
    And the history shows that job as running

  Scenario: A refusal inside a confirmation dialog is announced on its own
    Given a job is already running
    When I delete an unheld set
    Then the deletion is refused because a job is running
    And the page behind the dialog announces only the running job

  Scenario: Deleting an unheld snapshot set removes it
    When I visit the mutating console
    And I delete an unheld set
    Then that set is no longer listed

  Scenario: Pruning keeps only the latest sets
    When I visit the mutating console
    And I prune keeping the latest three sets
    Then only the three latest sets remain
