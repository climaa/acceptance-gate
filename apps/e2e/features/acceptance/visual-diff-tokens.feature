Feature: Reading spacing in design-token terms

  A capture records a token ledger for every variant: the spacing it measured,
  each value named by the design token it matches or the one it is nearest to.
  The design view lists those readings beside the board, as reference. They
  never change a comparison's bucket.

  Scenario: The design view names a spacing change in token terms
    Given the dialog's comparison is open
    When I compare it to the design
    Then the readings list spacing that changed between before and after
    And the "Keep it open" button's padding-right went from "--space-4 (16px)" to "6px", browser default

  Scenario: A reading marks its box on the after screenshot
    Given the dialog's design view is open
    When I focus the "Keep it open" button's padding-right reading
    Then its box is marked on the after screenshot

  Scenario: Without a before ledger, the readings come from the after side alone
    Given a comparison against the baselines is open
    When I compare it to the design
    Then the readings come from the after screenshot alone

  Scenario: A comparison with no ledger says so
    Given a shared comparison link is open
    When I compare it to the design
    Then the readings say this comparison has no token ledger

  Scenario: Readings never change a bucket
    When I open the dialog's report
    Then the dialog story is still counted as changed

  Scenario: The design view with readings has no accessibility violations
    Given the dialog's design view is open
    Then the page has no accessibility violations
