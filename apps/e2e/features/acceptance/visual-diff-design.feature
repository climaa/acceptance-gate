Feature: Reading a comparison against a design board

  The comparison modal can put a design board — an export of the design
  file — beside the after screenshot, as reference. It is never compared.

  Scenario: The design view puts a board beside the screenshot
    Given a shared comparison link is open
    When I compare it to the design
    Then a design board is shown beside the after screenshot
    And the comparison modes are gone

  Scenario: The board cannot be zoomed out past fitting the pane
    Given the design view is open
    When I zoom the board in and back out
    Then the board is at 100% and cannot be zoomed out further

  Scenario: Another board can be picked
    Given the design view is open
    When I pick the console board
    Then the console board is shown

  Scenario: A shared link opens on the board it names
    When I open a comparison link naming the pages board
    Then the pages board is shown
