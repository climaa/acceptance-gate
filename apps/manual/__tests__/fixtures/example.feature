Feature: Example subject

  Background:
    Given the world is prepared

  Scenario: A plain task
    When I do the thing
    Then I see the result
    And the result is durable

  @desktop
  Scenario: A tagged task that returns to acting
    When I do the thing
    Then I see the result
    When I do it again
    Then I see it twice
    But nothing else changed
