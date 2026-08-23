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

  Scenario: Deleting a held snapshot set is refused with the reason
    Given a snapshot set is held by a registered worktree
    When I delete the held set
    Then the deletion is refused naming what holds it

  Scenario: Past runs are listed with their outcome
    When I visit the console
    Then the history lists each run with its outcome, exit code and duration
