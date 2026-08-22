Feature: The console on my own captures

  Every assertion here is an invariant between values on this page, never a
  named fact: the data behind this console is whatever my machine captured, and
  it changes every time I run one. Nothing in this file writes.

  Background:
    Given this console is serving my own captures

  @regression
  Scenario: The console serves real data, not the committed sample
    When I visit my console
    Then the console is not badged as sample data
    And at least one snapshot set is listed

  @regression
  Scenario: Every snapshot set is listed with its identity
    When I visit my console
    Then every listed set carries a label, a branch, a date and a story count

  @regression
  Scenario: The canonical corpus is offered for comparison but never as a set
    When I visit my console
    Then the canonical corpus is badged canonical and cannot be deleted
    And the canonical corpus is not one of the listed sets

  @regression
  Scenario: The compare pickers offer every set the table lists
    When I visit my console
    Then both pickers offer every listed set
    And the two pickers open on different sets

  @regression
  Scenario: Choosing two sets prepares a comparison without starting one
    When I visit my console
    And I choose the two newest sets to compare
    Then the job form is set to compare those two sets
    And no job has been started

  @regression
  Scenario: Each job mode names its own start control
    When I visit my console
    Then each of the four job modes offers its own start button
    And no job has been started

  @regression
  Scenario: History agrees with the exit code behind every run
    When I visit my console
    Then every past run's outcome word matches its exit code

  @regression
  Scenario: Every report on disk is linked from the console
    When I visit my console
    Then every listed report links to its own page
