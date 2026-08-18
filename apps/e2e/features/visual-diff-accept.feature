Feature: Baseline acceptance

  Scenario: Accept stays gated until the review completes
    Given a finished comparison report exists
    When I visit the console
    And I select the accept job mode
    Then accept is unavailable while variants remain unreviewed

  Scenario: A host mismatch degrades accept to a command
    Given every variant of the report is reviewed
    When I visit the console
    And I select the accept job mode
    Then I am warned that this host cannot accept baselines
    And I can copy the container command instead of running it

  @mutating
  Scenario: A matched host accepts the baselines
    Given every variant of the mutating report is reviewed
    And the runner matches the pinned container
    When I visit the mutating console
    And I run the accept
    Then the baselines are rewritten and restamped

  Scenario: An accessibility failure blocks the accept
    Given the report still carries an accessibility failure
    When I visit the console
    And I select the accept job mode
    Then accept is refused because of the accessibility failure
