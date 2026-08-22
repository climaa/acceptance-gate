Feature: Accessibility on my own captures

  A seeded fixture can only fail axe on what it happens to render. These scan
  the pages my own data actually draws.

  @regression
  Scenario: The console has no accessibility violations
    When I visit my console
    Then the page has no accessibility violations

  @regression
  Scenario: The dark console has no accessibility violations
    When I visit my console
    And I switch to the dark theme
    Then the page has no accessibility violations

  @regression
  Scenario: The report has no accessibility violations
    Given this console holds a finished comparison
    When I open one of my reports
    Then the page has no accessibility violations
