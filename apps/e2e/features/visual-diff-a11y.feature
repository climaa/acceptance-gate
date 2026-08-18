Feature: Visual-diff accessibility

  Scenario: An accessibility failure leads the report
    Given a finished comparison report exists
    When I open the report
    Then the accessibility section appears before any pixel bucket

  Scenario: The violation list replaces the diff pane
    Given a finished comparison report exists
    When I open the report
    Then the a11y story shows its violations where the diff would be

  Scenario: Reviewing an a11y variant does not clear it
    Given a finished comparison report exists
    When I open the report
    And I mark the a11y story as reviewed
    Then the a11y story still counts as an accessibility failure

  Scenario: The console has no accessibility violations
    When I visit the console
    Then the page has no accessibility violations

  Scenario: The report has no accessibility violations
    Given a finished comparison report exists
    When I open the report
    Then the page has no accessibility violations

  Scenario: The dark console has no accessibility violations
    When I visit the console
    And I switch to the dark theme
    Then the page has no accessibility violations

  Scenario: The comparison modal has no accessibility violations
    Given the comparison modal is open
    Then the page has no accessibility violations
