Feature: Census

  Scenario: The census home shows the testing pyramid and opens a workspace
    When I visit the census home
    Then the page has a main heading "Census"
    And the testing pyramid shows a count for each level
    When I open a workspace from the home
    Then the workspace page has its name as the main heading
