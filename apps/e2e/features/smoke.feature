Feature: Smoke

  Scenario: The blog is up
    When I visit the blog index
    Then the page has a main heading
