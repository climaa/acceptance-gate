Feature: Shareable comparison links

  A comparison has an address of its own — /report/<id>/compare/<variant key> —
  so a reviewer can send the exact pixels they are looking at.

  Scenario: Opening a shared link shows the comparison directly
    When I open a shared comparison link
    Then the comparison modal shows the before, after and diff shots

  Scenario: Closing a shared link returns to its report
    Given a shared comparison link is open
    When I press escape
    Then I am on the comparison's report

  Scenario: Back closes a comparison opened from the report
    Given the comparison modal is open
    When I go back in the browser
    Then the comparison modal is closed
    And I am on the comparison's report

  Scenario: An unknown comparison is a 404
    When I request a comparison the report does not hold
    Then the response status is 404

  Scenario: Copy link copies the current comparison
    Given the comparison modal is open
    When I copy the comparison link
    Then the clipboard holds the comparison's address
