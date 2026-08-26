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

  Scenario: The console names the next capture set for me
    When I visit the console
    And I ask the console to name the capture set
    Then the label field holds a set label no snapshot set already uses

  Scenario: The selected job tab is a link
    When I visit the console
    And I switch to the compare job tab
    Then the URL carries the compare job mode
    When I reload the console
    Then the compare job tab is selected

  Scenario: Asking for the same comparison again lands, from another tab
    When I visit the console
    And I choose two sets to compare
    And I switch to the capture job tab
    Then the URL has dropped the compare job mode
    When I choose the same two sets to compare
    Then the job form is set to compare those two sets

  Scenario: Past runs are listed with their outcome
    When I visit the console
    Then the history lists each run with its outcome, exit code and duration
