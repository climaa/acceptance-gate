Feature: Accessibility

  Scenario: The blog index has no accessibility violations
    When I visit the blog index
    Then the page has no accessibility violations

  Scenario: A post page has no accessibility violations
    When I visit the blog index
    And I open the first article
    Then the page has no accessibility violations

  Scenario: An article with code blocks has no accessibility violations
    When I visit the blog index
    And I open the first article carrying a code block
    Then the page has no accessibility violations

  Scenario: A tag page has no accessibility violations
    When I visit the first tag page
    Then the page has no accessibility violations

  Scenario: The dark theme has no accessibility violations
    When I visit the blog index
    And I switch to the dark theme
    Then the page has no accessibility violations
