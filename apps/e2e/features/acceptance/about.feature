Feature: Authorship page
  As a reader who arrived from a CV or a job post
  I want the about page to point at the portfolio
  so I can get the short version without leaving by the back button.

  Scenario: The about page points at the portfolio
    When I visit the about page
    Then the about page links to the portfolio
    And the portfolio address answers 200
