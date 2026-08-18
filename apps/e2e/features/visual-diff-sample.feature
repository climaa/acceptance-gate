Feature: Sample mode

  Scenario: Sample data is badged on the console
    When I visit the sample console
    Then the sample badge is visible

  Scenario: Sample data is badged on the report
    When I visit the sample console
    And I open the sample report
    Then the sample badge is visible

  Scenario: Job controls are disabled in sample mode
    When I visit the sample console
    Then starting a job is disabled with an explanation
