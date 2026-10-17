Feature: Reading one screenshot from a set beside its design

  Scenario: A screenshot in a set opens beside a design board
    Given a screenshot set captured from the console is open
    When I open the "Badge — Accent" desktop light screenshot
    Then it is shown beside a design board
    And the set is still open beneath it

  Scenario: The screenshot's address opens expanded on its own
    When I load the "Badge — Accent" screenshot's address directly
    Then the screenshot and the board fill the page
    And there is a way back to the set

  Scenario: Every reading, folded until asked for
    Given the "Badge — Accent" screenshot is open
    When I unfold the spacing readings
    Then the badge's padding-left reads "8px" as "--space-2 (8px)"
    And its padding-top reads "2px" as exempt, "pill half-step"

  Scenario: A baselines screenshot has no token ledger
    Given the baselines screenshot set is open
    When I open the "Badge — Accent" desktop light screenshot
    Then the readings say this screenshot has no token ledger

  Scenario: The shot view has no accessibility violations
    Given the "Badge — Accent" screenshot is open
    Then the page has no accessibility violations
