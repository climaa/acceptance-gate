Feature: Visual-diff console

  Background:
    Given the console has snapshot sets

  Scenario: The console lists the snapshot sets
    When I visit the console
    Then I see each snapshot set with its branch, story count and size
    And a set captured from a dirty tree is marked as dirty

  Scenario: Comparing two sets pre-fills the job form
    When I visit the console
    And I choose two sets to compare
    Then the job form is set to compare those two sets

  @mutating
  Scenario: Launching a comparison streams its log and links the report
    When I visit the mutating console
    And I launch the prepared comparison
    Then the live log runs to the job's end
    And the finished job links to its report
    And the console lists that report without a reload

  @mutating
  Scenario: A second job is refused while one is running
    Given a job is already running
    When I try to start another job
    Then the console shows the running job instead of queueing mine
    And the history shows that job as running

  @mutating
  Scenario: A refusal inside a confirmation dialog is announced on its own
    Given a job is already running
    When I delete an unheld set
    Then the deletion is refused because a job is running
    And the page behind the dialog announces only the running job

  Scenario: Deleting a held snapshot set is refused with the reason
    Given a snapshot set is held by a registered worktree
    When I delete the held set
    Then the deletion is refused naming what holds it

  @mutating
  Scenario: Deleting an unheld snapshot set removes it
    When I visit the mutating console
    And I delete an unheld set
    Then that set is no longer listed

  @mutating
  Scenario: Pruning keeps only the latest sets
    When I visit the mutating console
    And I prune keeping the latest three sets
    Then only the three latest sets remain

  Scenario: Past runs are listed with their outcome
    When I visit the console
    Then the history lists each run with its outcome, exit code and duration
